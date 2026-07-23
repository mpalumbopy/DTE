import AdmZip from 'adm-zip';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { Parse, validarFirmaXades } from '../xades';
import { sha256Hex } from '../hash';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const NOMBRE_MANIFIESTO = 'manifiesto.json';
const NOMBRE_SELLO_MANIFIESTO = 'manifiesto.tsr';
const NOMBRE_XML = 'dte.xml';

export interface ArchivoContenedor {
  /** Ruta relativa dentro del ZIP (p. ej. "dte.xml", "certificados/0.der"). */
  nombre: string;
  contenido: Buffer;
}

export interface ManifiestoArchivo {
  archivo: string;
  hashSha256: string;
  tamanoBytes: number;
}

export interface Manifiesto {
  idDte: string;
  version: number;
  generadoEn: string;
  archivos: ManifiestoArchivo[];
}

/** Calcula el manifiesto (hash + tamaño por archivo) — determinista, no incluye timestamps de zip. */
export function construirManifiesto(idDte: string, version: number, archivos: ArchivoContenedor[]): Manifiesto {
  return {
    idDte,
    version,
    generadoEn: new Date().toISOString(),
    archivos: archivos.map((a) => ({
      archivo: a.nombre,
      hashSha256: sha256Hex(a.contenido),
      tamanoBytes: a.contenido.length,
    })),
  };
}

/** Empaqueta los archivos de datos + el manifiesto + su sello TSA en un único ZIP. */
export function construirZip(archivos: ArchivoContenedor[], manifiesto: Manifiesto, selloManifiestoDer: Buffer): Buffer {
  const zip = new AdmZip();
  for (const archivo of archivos) {
    zip.addFile(archivo.nombre, archivo.contenido);
  }
  zip.addFile(NOMBRE_MANIFIESTO, Buffer.from(JSON.stringify(manifiesto, null, 2), 'utf8'));
  zip.addFile(NOMBRE_SELLO_MANIFIESTO, selloManifiestoDer);
  return zip.toBuffer();
}

function leerZip(zipBuffer: Buffer): Map<string, Buffer> {
  const zip = new AdmZip(zipBuffer);
  const mapa = new Map<string, Buffer>();
  for (const entrada of zip.getEntries()) {
    if (!entrada.isDirectory) {
      mapa.set(entrada.entryName, entrada.getData());
    }
  }
  return mapa;
}

/**
 * Extrae `messageImprint.hashedMessage` de un token RFC 3161 (CMS SignedData con TSTInfo), sin
 * verificar la firma criptográfica del token en sí (eso ya lo hace el emisor — TSA real o
 * simulada — al sellarlo; aquí solo se comprueba que el hash sellado coincide con el manifiesto
 * actual, que es lo que "el manifiesto lo detecta" exige). Réplica minimalista de
 * `leerTokenTsa` en `@psdte/crypto-providers` — no se importa ese paquete aquí para evitar una
 * dependencia circular (crypto-providers ya depende de xml-engine).
 */
function extraerHashSellado(tokenTsrDer: Buffer): Buffer {
  const asn1ContentInfo = asn1js.fromBER(tokenTsrDer);
  const contentInfo = new pkijs.ContentInfo({ schema: asn1ContentInfo.result });
  const signedData = new pkijs.SignedData({ schema: contentInfo.content });
  const eContentEnvuelto = signedData.encapContentInfo.eContent as unknown as {
    valueBlock: { value: Array<{ valueBlock: { valueHexView: Uint8Array } }> };
  };
  const tstInfoDer = eContentEnvuelto.valueBlock.value[0].valueBlock.valueHexView;
  const tstInfo = new pkijs.TSTInfo({ schema: asn1js.fromBER(tstInfoDer).result });
  return Buffer.from(
    (tstInfo.messageImprint.hashedMessage as unknown as { valueBlock: { valueHexView: Uint8Array } }).valueBlock
      .valueHexView,
  );
}

export interface ResultadoVerificacionOffline {
  valido: boolean;
  motivos: string[];
  manifiesto?: Manifiesto;
}

/**
 * Verificador offline del contenedor probatorio (docs/PLAN.md sección 9/F9): no requiere red ni
 * base de datos. Comprueba, en orden: (1) el manifiesto y su sello TSA están presentes, (2) el
 * hash sellado coincide con el hash actual del manifiesto (detecta manifiesto reemplazado), (3)
 * cada archivo listado existe y su hash recalculado coincide (detecta CUALQUIER artefacto
 * alterado, no solo el XML), (4) las firmas XAdES embebidas en `dte.xml` son criptográficamente
 * válidas.
 */
export async function verificarContenedorOffline(zipBuffer: Buffer): Promise<ResultadoVerificacionOffline> {
  const motivos: string[] = [];
  const archivos = leerZip(zipBuffer);

  const manifiestoBytes = archivos.get(NOMBRE_MANIFIESTO);
  if (!manifiestoBytes) {
    return { valido: false, motivos: [`Falta ${NOMBRE_MANIFIESTO} en el contenedor`] };
  }
  const manifiesto = JSON.parse(manifiestoBytes.toString('utf8')) as Manifiesto;

  const selloBytes = archivos.get(NOMBRE_SELLO_MANIFIESTO);
  if (!selloBytes) {
    motivos.push(`Falta ${NOMBRE_SELLO_MANIFIESTO}: el manifiesto no está sellado`);
  } else {
    try {
      const hashSellado = extraerHashSellado(selloBytes);
      const hashActual = Buffer.from(sha256Hex(manifiestoBytes), 'hex');
      if (!hashSellado.equals(hashActual)) {
        motivos.push('El hash sellado (TSA) no coincide con el manifiesto actual: pudo haber sido reemplazado');
      }
    } catch (err) {
      motivos.push(`No se pudo leer el sello TSA del manifiesto: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const entrada of manifiesto.archivos) {
    const contenido = archivos.get(entrada.archivo);
    if (!contenido) {
      motivos.push(`Falta el archivo listado en el manifiesto: ${entrada.archivo}`);
      continue;
    }
    if (contenido.length !== entrada.tamanoBytes) {
      motivos.push(`Tamaño alterado: ${entrada.archivo}`);
    }
    const hashActual = sha256Hex(contenido);
    if (hashActual !== entrada.hashSha256) {
      motivos.push(`Hash alterado: ${entrada.archivo} (esperado ${entrada.hashSha256}, actual ${hashActual})`);
    }
  }

  const xmlBytes = archivos.get(NOMBRE_XML);
  if (!xmlBytes) {
    motivos.push(`Falta ${NOMBRE_XML}`);
  } else {
    const documento = Parse(xmlBytes.toString('utf8'));
    const nodosFirma = Array.from(documento.getElementsByTagNameNS(DS_NS, 'Signature')) as unknown as Element[];
    for (const nodoFirma of nodosFirma) {
      const resultado = await validarFirmaXades(documento, nodoFirma);
      if (!resultado.valida) {
        motivos.push(`Firma XAdES inválida en dte.xml (Id=${nodoFirma.getAttribute('Id') ?? '?'}): ${resultado.motivo ?? 'sin motivo'}`);
      }
    }
  }

  return { valido: motivos.length === 0, motivos, manifiesto };
}

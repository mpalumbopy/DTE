import { existsSync, readdirSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ConfigService } from '@nestjs/config';
import puppeteer from 'puppeteer-core';
import { ErrorDominio } from '@psdte/shared';
import { ArchivoContenedor, construirManifiesto, construirZip, sha256Hex } from '@psdte/xml-engine';
import { EnvConfig } from '../../config/config.schema';
import { ProviderFactoryService } from '../integraciones/provider-factory.service';
import { Dte } from '../../entities/dte.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DteParte } from '../../entities/dte-parte.entity';
import { DteCondicion } from '../../entities/dte-condicion.entity';
import { Persona } from '../../entities/persona.entity';
import { Evidencia } from '../../entities/evidencia.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { Exportacion } from '../../entities/exportacion.entity';
import { construirHtmlRepresentacion } from './plantilla-pdf';
import { PdfaConformanceChecker, VerificadorPdfaEstructural } from './pdfa-conformance';

const execFileAsync = promisify(execFile);

export interface ResultadoExportacion {
  exportacionId: string;
  hashSha256: string;
  uriObjeto: string;
}

/** Localiza `PDFA_def.ps` (versionado bajo el directorio de instalación de Ghostscript) sin
 * hardcodear la versión — evita romperse cuando el paquete del sistema se actualiza. */
function resolverPdfaDefPs(): string | undefined {
  const base = '/usr/share/ghostscript';
  if (!existsSync(base)) return undefined;
  for (const version of readdirSync(base)) {
    const candidato = join(base, version, 'lib', 'PDFA_def.ps');
    if (existsSync(candidato)) return candidato;
  }
  return undefined;
}

function resolverPerfilIccSrgb(): string | undefined {
  const candidato = '/usr/share/color/icc/ghostscript/srgb.icc';
  return existsSync(candidato) ? candidato : undefined;
}

@Injectable()
export class ExportacionService {
  private readonly pdfaChecker: PdfaConformanceChecker = new VerificadorPdfaEstructural();

  constructor(
    private readonly providerFactory: ProviderFactoryService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
    @InjectRepository(DteXmlVersion) private readonly xmlVersionRepo: Repository<DteXmlVersion>,
    @InjectRepository(DteParte) private readonly parteRepo: Repository<DteParte>,
    @InjectRepository(DteCondicion) private readonly condicionRepo: Repository<DteCondicion>,
    @InjectRepository(Persona) private readonly personaRepo: Repository<Persona>,
    @InjectRepository(Evidencia) private readonly evidenciaRepo: Repository<Evidencia>,
    @InjectRepository(Certificado) private readonly certificadoRepo: Repository<Certificado>,
    @InjectRepository(Firma) private readonly firmaRepo: Repository<Firma>,
    @InjectRepository(Exportacion) private readonly exportacionRepo: Repository<Exportacion>,
  ) {}

  async generarContenedor(dteId: string, usuarioId: string | null): Promise<ResultadoExportacion> {
    const { dte, ultimaVersion } = await this.cargarDteYVersion(dteId);

    const [evidencias, firmas] = await Promise.all([
      this.evidenciaRepo.find({ where: { dteId } }),
      this.firmaRepo.find({ where: { dteId } }),
    ]);
    const certificadoIds = [...new Set(firmas.map((f) => f.certificadoId))];
    const certificados = certificadoIds.length > 0 ? await this.certificadoRepo.findBy({ id: In(certificadoIds) }) : [];

    const archivos: ArchivoContenedor[] = [
      { nombre: 'dte.xml', contenido: Buffer.from(ultimaVersion.contenidoXml ?? '', 'utf8') },
      ...evidencias.map((e, i) => ({
        nombre: `evidencias/${i}-${e.tipoCodigo}.json`,
        contenido: Buffer.from(
          JSON.stringify({ id: e.id, tipoCodigo: e.tipoCodigo, hashSha256: e.hashSha256, metadatos: e.metadatos, creadoEn: e.creadoEn }, null, 2),
          'utf8',
        ),
      })),
      ...certificados.map((c, i) => ({ nombre: `certificados/${i}.der`, contenido: c.certificadoDer })),
    ];

    const manifiesto = construirManifiesto(dte.idDte, dte.versionVigente, archivos);
    const manifiestoBytes = Buffer.from(JSON.stringify(manifiesto, null, 2), 'utf8');
    const tsaProvider = await this.providerFactory.obtenerProveedorTsa();
    const { tokenTsrDer } = await tsaProvider.sellarHash(Buffer.from(sha256Hex(manifiestoBytes), 'hex'));

    const zip = construirZip(archivos, manifiesto, tokenTsrDer);
    const hashContenedor = sha256Hex(zip);
    const uriObjeto = await this.guardarArchivo(`${dte.idDte}-contenedor-v${dte.versionVigente}.zip`, zip);

    const exportacion = await this.exportacionRepo.save(
      this.exportacionRepo.create({
        dteId: dte.id,
        xmlVersionId: ultimaVersion.id,
        tipo: 'CONTENEDOR',
        hashSha256: hashContenedor,
        manifiesto: manifiesto as unknown as Record<string, unknown>,
        uriObjeto,
        solicitadoPor: usuarioId,
      }),
    );

    return { exportacionId: exportacion.id, hashSha256: hashContenedor, uriObjeto };
  }

  async generarPdfA(dteId: string, usuarioId: string | null): Promise<ResultadoExportacion> {
    const { dte, ultimaVersion } = await this.cargarDteYVersion(dteId);

    const [partes, condiciones] = await Promise.all([
      this.parteRepo.find({ where: { dteId }, order: { orden: 'ASC' } }),
      this.condicionRepo.find({ where: { dteId }, order: { orden: 'ASC' } }),
    ]);
    const personas = await this.personaRepo.findBy({ id: In(partes.map((p) => p.personaId)) });
    const personasPorId = new Map(personas.map((p) => [p.id, p]));
    const partesConPersona = partes.map((parte) => ({ parte, persona: personasPorId.get(parte.personaId)! }));

    const html = construirHtmlRepresentacion(dte, partesConPersona, condiciones);
    const pdfBasico = await this.renderizarPdf(html);
    const pdfA = await this.convertirAPdfA(pdfBasico);
    const conformidad = await this.pdfaChecker.verificar(pdfA);

    const manifiesto = {
      idDte: dte.idDte,
      version: dte.versionVigente,
      generadoEn: new Date().toISOString(),
      archivo: 'representacion.pdf',
      hashSha256: sha256Hex(pdfA),
      tamanoBytes: pdfA.length,
      conformidadPdfA: conformidad,
    };

    const uriObjeto = await this.guardarArchivo(`${dte.idDte}-representacion-v${dte.versionVigente}.pdf`, pdfA);
    const exportacion = await this.exportacionRepo.save(
      this.exportacionRepo.create({
        dteId: dte.id,
        xmlVersionId: ultimaVersion.id,
        tipo: 'PDF_A',
        hashSha256: manifiesto.hashSha256,
        manifiesto,
        uriObjeto,
        solicitadoPor: usuarioId,
      }),
    );

    return { exportacionId: exportacion.id, hashSha256: manifiesto.hashSha256, uriObjeto };
  }

  async leerArchivo(exportacionId: string): Promise<{ contenido: Buffer; tipo: string }> {
    const exportacion = await this.exportacionRepo.findOneOrFail({ where: { id: exportacionId } });
    const contenido = await readFile(exportacion.uriObjeto);
    return { contenido, tipo: exportacion.tipo };
  }

  private async cargarDteYVersion(dteId: string): Promise<{ dte: Dte; ultimaVersion: DteXmlVersion }> {
    const dte = await this.dteRepo.findOneOrFail({ where: { id: dteId } });
    const ultimaVersion = await this.xmlVersionRepo.findOne({ where: { dteId }, order: { version: 'DESC' } });
    if (!ultimaVersion) {
      throw new ErrorDominio('ERR-SISTEMA-001', 'DTE sin versión XML vigente');
    }
    return { dte, ultimaVersion };
  }

  private async guardarArchivo(nombre: string, contenido: Buffer): Promise<string> {
    const dir = this.configService.get('EXPORT_DIR', { infer: true });
    await mkdir(dir, { recursive: true });
    const ruta = join(dir, nombre);
    await writeFile(ruta, contenido);
    return ruta;
  }

  private async renderizarPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      executablePath: this.configService.get('CHROMIUM_PATH', { infer: true }),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'a4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /** Convierte un PDF genérico a PDF/A-2b vía Ghostscript (docs/PLAN.md sección 9: worker con
   * ghostscript). Si Ghostscript o sus recursos (PDFA_def.ps, perfil ICC) no están disponibles en
   * este entorno, devuelve el PDF sin convertir — la verificación de conformidad lo reportará como
   * no conforme en vez de fallar silenciosamente (degradación observable, no oculta). */
  private async convertirAPdfA(pdfBytes: Buffer): Promise<Buffer> {
    const pdfaDefPs = resolverPdfaDefPs();
    const perfilIcc = resolverPerfilIccSrgb();
    if (!pdfaDefPs || !perfilIcc) {
      return pdfBytes;
    }

    const dirTemporal = await mkdtemp(join(tmpdir(), 'psdte-pdfa-'));
    try {
      const entrada = join(dirTemporal, 'entrada.pdf');
      const salida = join(dirTemporal, 'salida.pdf');
      await writeFile(entrada, pdfBytes);

      await execFileAsync(this.configService.get('GHOSTSCRIPT_PATH', { infer: true }), [
        '-dPDFA=2',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOOUTERSAVE',
        '-dPDFACompatibilityPolicy=1',
        '-sColorConversionStrategy=RGB',
        '-sProcessColorModel=DeviceRGB',
        `-sOutputICCProfile=${perfilIcc}`,
        '-sDEVICE=pdfwrite',
        `-sOutputFile=${salida}`,
        pdfaDefPs,
        entrada,
      ]);

      return await readFile(salida);
    } finally {
      await rm(dirTemporal, { recursive: true, force: true });
    }
  }
}

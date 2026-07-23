import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { Parse, canonicalizarExclusivo, sha256Hex, validarFirmaXades } from '@psdte/xml-engine';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { Dte } from '../../entities/dte.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DteEvento } from '../../entities/dte-evento.entity';
import { DteParte } from '../../entities/dte-parte.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { DteEndoso } from '../../entities/dte-endoso.entity';
import { Firma } from '../../entities/firma.entity';
import { CatEstadoDte } from '../../entities/cat-estado-dte.entity';
import { CatRol } from '../../entities/cat-rol.entity';
import { Usuario } from '../../entities/usuario.entity';
import { ConsultaVerificacion } from '../../entities/consulta-verificacion.entity';
import { Persona } from '../../entities/persona.entity';
import { DteBloqueo } from '../../entities/dte-bloqueo.entity';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';

/** Niveles de CAT-DTE-04 (`cat_nivel_consulta`) — coinciden con `cat_rol.nivel_acceso`. */
export const NIVEL_PUBLICO = 1;
export const NIVEL_INTERVINIENTE = 2;
export const NIVEL_AUTORIDAD = 3;

export interface ResultadoIntegridad {
  valida: boolean;
  motivos: string[];
}

export interface ResultadoPublico {
  existe: boolean;
  idDte?: string;
  estado?: string;
  estadoCodigo?: number;
  fechaEmision?: Date;
  hashVerificacion?: string;
  integridadValida?: boolean;
}

export interface ResultadoDetallado extends ResultadoPublico {
  nivelAcceso: number;
  fechaVencimiento?: Date;
  monto?: string;
  monedaCodigo?: string;
  saldoPendiente?: string;
  montoLetras?: string;
  versionVigente?: number;
  motivosIntegridad?: string[];
  cadenaHashValida?: boolean;
  tenedorActualPersonaId?: string | null;
  eventos?: Array<{
    id: string;
    numeroEvento: string;
    tipoEvento: number;
    fechaEvento: Date;
    estadoPrevio: number;
    estadoResultante: number;
    rolActor: string;
    actorDescripcion: string;
  }>;
  firmas?: Array<{
    eventoId: string | null;
    rolFirmante: string;
    ambito: string;
    estadoValidacion: string;
    signingTime: Date;
  }>;
  partes?: Array<{
    personaId: string;
    nombre: string;
    rolParte: string;
    condicionFirmante: string | null;
  }>;
  bloqueoActivoId?: string | null;
}

/**
 * Verificación de integridad + estado por nivel de acceso (docs/PLAN.md sección 5.2, CAT-DTE-04).
 * "El XML manda" (I8): la integridad se recalcula contra el XML vigente, no se confía ciegamente en
 * las columnas de `dte`.
 */
@Injectable()
export class VerificacionService {
  constructor(
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
    @InjectRepository(DteXmlVersion) private readonly xmlVersionRepo: Repository<DteXmlVersion>,
    @InjectRepository(DteEvento) private readonly eventoRepo: Repository<DteEvento>,
    @InjectRepository(DteParte) private readonly parteRepo: Repository<DteParte>,
    @InjectRepository(DteTenencia) private readonly tenenciaRepo: Repository<DteTenencia>,
    @InjectRepository(DteEndoso) private readonly endosoRepo: Repository<DteEndoso>,
    @InjectRepository(Firma) private readonly firmaRepo: Repository<Firma>,
    @InjectRepository(CatEstadoDte) private readonly estadoRepo: Repository<CatEstadoDte>,
    @InjectRepository(CatRol) private readonly rolRepo: Repository<CatRol>,
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(ConsultaVerificacion) private readonly consultaRepo: Repository<ConsultaVerificacion>,
    @InjectRepository(Persona) private readonly personaRepo: Repository<Persona>,
    @InjectRepository(DteBloqueo) private readonly bloqueoRepo: Repository<DteBloqueo>,
  ) {}

  async verificarIntegridad(dte: Dte, ultimaVersion: DteXmlVersion): Promise<ResultadoIntegridad> {
    if (!ultimaVersion.contenidoXml) {
      return { valida: false, motivos: ['El contenido XML de esta versión no está disponible en base (almacenamiento externo)'] };
    }
    const motivos: string[] = [];
    const documento = Parse(ultimaVersion.contenidoXml);
    const hashRecalculado = sha256Hex(canonicalizarExclusivo(documento.documentElement));

    if (hashRecalculado !== dte.hashVigente) {
      motivos.push('El hash recalculado del XML vigente no coincide con dte.hash_vigente');
    }
    if (hashRecalculado !== ultimaVersion.hashSha256) {
      motivos.push('El hash recalculado del XML vigente no coincide con dte_xml_version.hash_sha256');
    }

    const nodosFirma = Array.from(documento.getElementsByTagNameNS(DS_NS, 'Signature')) as unknown as Element[];
    for (const nodoFirma of nodosFirma) {
      const resultado = await validarFirmaXades(documento, nodoFirma);
      if (!resultado.valida) {
        motivos.push(`Firma inválida (Id=${nodoFirma.getAttribute('Id') ?? '?'}): ${resultado.motivo ?? 'sin motivo'}`);
      }
    }

    return { valida: motivos.length === 0, motivos };
  }

  async verificarCadenaHashes(dteId: string): Promise<ResultadoIntegridad> {
    const eventos = await this.eventoRepo.find({ where: { dteId }, order: { secuencia: 'ASC' } });
    const motivos: string[] = [];
    for (let i = 0; i < eventos.length; i += 1) {
      const esperado = i === 0 ? null : eventos[i - 1].hashEvento;
      if (eventos[i].hashAnterior !== esperado) {
        motivos.push(`El evento #${eventos[i].secuencia} no encadena con el hash del evento anterior`);
      }
    }
    return { valida: motivos.length === 0, motivos };
  }

  async consultaPublica(codigo: string, ip: string | null): Promise<ResultadoPublico> {
    const dte = await this.dteRepo.findOne({ where: { idDte: codigo } });
    if (!dte) {
      await this.registrarConsulta(null, codigo, NIVEL_PUBLICO, null, ip, 'NO_ENCONTRADO');
      return { existe: false };
    }

    const ultimaVersion = await this.xmlVersionRepo.findOne({ where: { dteId: dte.id }, order: { version: 'DESC' } });
    const integridad = ultimaVersion ? await this.verificarIntegridad(dte, ultimaVersion) : { valida: false, motivos: ['Sin versión XML'] };
    const estado = await this.estadoRepo.findOne({ where: { codigo: dte.estadoActual } });

    await this.registrarConsulta(dte.id, codigo, NIVEL_PUBLICO, null, ip, 'ENCONTRADO', {
      integridadValida: integridad.valida,
    });

    return {
      existe: true,
      idDte: dte.idDte,
      estado: estado?.nombre ?? String(dte.estadoActual),
      estadoCodigo: dte.estadoActual,
      fechaEmision: dte.fechaEmision,
      hashVerificacion: dte.hashVigente ?? undefined,
      integridadValida: integridad.valida,
    };
  }

  async consultaDetallada(dteId: string, usuario: AccessTokenPayload, ip: string | null): Promise<ResultadoDetallado> {
    const dte = await this.dteRepo.findOne({ where: { id: dteId } });
    if (!dte) {
      throw new ErrorDominio('ERR-DTE-404', `DTE inexistente: ${dteId}`);
    }

    const nivelAcceso = await this.resolverNivelAcceso(usuario);
    const relacionado = nivelAcceso < NIVEL_AUTORIDAD ? await this.esRelacionado(dte.id, usuario) : true;
    const otorgaDetalle = nivelAcceso >= NIVEL_AUTORIDAD || (nivelAcceso >= NIVEL_INTERVINIENTE && relacionado);

    const ultimaVersion = await this.xmlVersionRepo.findOne({ where: { dteId: dte.id }, order: { version: 'DESC' } });
    const integridad = ultimaVersion ? await this.verificarIntegridad(dte, ultimaVersion) : { valida: false, motivos: ['Sin versión XML'] };
    const estado = await this.estadoRepo.findOne({ where: { codigo: dte.estadoActual } });

    const base: ResultadoDetallado = {
      existe: true,
      nivelAcceso,
      idDte: dte.idDte,
      estado: estado?.nombre ?? String(dte.estadoActual),
      estadoCodigo: dte.estadoActual,
      fechaEmision: dte.fechaEmision,
      hashVerificacion: dte.hashVigente ?? undefined,
      integridadValida: integridad.valida,
    };

    if (!otorgaDetalle) {
      await this.registrarConsulta(dte.id, dte.idDte, NIVEL_PUBLICO, usuario.sub, ip, 'ENCONTRADO_SIN_RELACION');
      return base;
    }

    const [cadenaHash, eventos, firmas, tenenciaVigente, partes, bloqueoActivo] = await Promise.all([
      this.verificarCadenaHashes(dte.id),
      this.eventoRepo.find({ where: { dteId: dte.id }, order: { secuencia: 'ASC' } }),
      this.firmaRepo.find({ where: { dteId: dte.id }, order: { creadoEn: 'ASC' } }),
      this.tenenciaRepo.findOne({ where: { dteId: dte.id, hasta: IsNull() } }),
      this.parteRepo.find({ where: { dteId: dte.id }, order: { orden: 'ASC' } }),
      this.bloqueoRepo.findOne({ where: { dteId: dte.id, eventoLevantamientoId: IsNull() } }),
    ]);
    const personas = partes.length > 0 ? await this.personaRepo.findBy({ id: In(partes.map((p) => p.personaId)) }) : [];
    const nombrePorPersonaId = new Map(personas.map((p) => [p.id, p.nombresApellidos ?? p.razonSocial ?? p.id]));

    await this.registrarConsulta(dte.id, dte.idDte, Math.min(nivelAcceso, 4), usuario.sub, ip, 'ENCONTRADO', {
      integridadValida: integridad.valida,
      cadenaHashValida: cadenaHash.valida,
    });

    return {
      ...base,
      fechaVencimiento: dte.fechaVencimiento,
      monto: dte.monto,
      monedaCodigo: dte.monedaCodigo,
      saldoPendiente: dte.saldoPendiente,
      montoLetras: dte.montoLetras,
      versionVigente: dte.versionVigente,
      motivosIntegridad: integridad.motivos,
      cadenaHashValida: cadenaHash.valida,
      tenedorActualPersonaId: tenenciaVigente?.personaId ?? null,
      eventos: eventos.map((e) => ({
        id: e.id,
        numeroEvento: e.numeroEvento,
        tipoEvento: e.tipoEvento,
        fechaEvento: e.fechaEvento,
        estadoPrevio: e.estadoPrevio,
        estadoResultante: e.estadoResultante,
        rolActor: e.rolActor,
        actorDescripcion: e.actorDescripcion,
      })),
      firmas: firmas.map((f) => ({
        eventoId: f.eventoId,
        rolFirmante: f.rolFirmante,
        ambito: f.ambito,
        estadoValidacion: f.estadoValidacion,
        signingTime: f.signingTime,
      })),
      partes: partes.map((p) => ({
        personaId: p.personaId,
        nombre: nombrePorPersonaId.get(p.personaId) ?? p.personaId,
        rolParte: p.rolParte,
        condicionFirmante: p.condicionFirmante,
      })),
      bloqueoActivoId: bloqueoActivo?.id ?? null,
    };
  }

  async resolverNivelAcceso(usuario: AccessTokenPayload): Promise<number> {
    if (usuario.roles.length === 0) return NIVEL_PUBLICO;
    const niveles = await Promise.all(
      usuario.roles.map(async (codigo) => {
        const rol = await this.rolRepo.findOne({ where: { codigo } });
        return rol?.nivelAcceso ?? NIVEL_PUBLICO;
      }),
    );
    return niveles.length > 0 ? Math.max(...niveles) : NIVEL_PUBLICO;
  }

  async esRelacionado(dteId: string, usuario: AccessTokenPayload): Promise<boolean> {
    const usuarioRow = await this.usuarioRepo.findOne({ where: { id: usuario.sub } });
    if (!usuarioRow?.personaId) return false;
    const personaId = usuarioRow.personaId;

    const [parte, tenencia, endoso] = await Promise.all([
      this.parteRepo.findOne({ where: { dteId, personaId } }),
      this.tenenciaRepo.findOne({ where: { dteId, personaId } }),
      this.endosoRepo.findOne({ where: { dteId, endosantePersonaId: personaId } }),
    ]);
    if (parte || tenencia || endoso) return true;
    const endosoComoEndosatario = await this.endosoRepo.findOne({ where: { dteId, endosatarioPersonaId: personaId } });
    return Boolean(endosoComoEndosatario);
  }

  /** IDs de DTE en los que la persona vinculada al usuario participa (parte, tenedor o endoso en
   * cualquiera de los dos sentidos) — usado para acotar listados sin repetir `esRelacionado` por fila. */
  async dteIdsRelacionados(usuario: AccessTokenPayload): Promise<string[]> {
    const usuarioRow = await this.usuarioRepo.findOne({ where: { id: usuario.sub } });
    if (!usuarioRow?.personaId) return [];
    const personaId = usuarioRow.personaId;

    const [partes, tenencias, endosante, endosatario] = await Promise.all([
      this.parteRepo.find({ where: { personaId } }),
      this.tenenciaRepo.find({ where: { personaId } }),
      this.endosoRepo.find({ where: { endosantePersonaId: personaId } }),
      this.endosoRepo.find({ where: { endosatarioPersonaId: personaId } }),
    ]);
    return Array.from(
      new Set([
        ...partes.map((p) => p.dteId),
        ...tenencias.map((t) => t.dteId),
        ...endosante.map((e) => e.dteId),
        ...endosatario.map((e) => e.dteId),
      ]),
    );
  }

  private async registrarConsulta(
    dteId: string | null,
    idDteConsultado: string,
    nivelCodigo: number,
    usuarioId: string | null,
    ip: string | null,
    resultado: string,
    detalle?: Record<string, unknown>,
  ): Promise<void> {
    await this.consultaRepo.save(
      this.consultaRepo.create({
        dteId,
        idDteConsultado,
        nivelCodigo,
        usuarioId,
        ip,
        resultado,
        detalle: detalle ?? null,
      }),
    );
  }
}

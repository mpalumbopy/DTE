import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import {
  EventoBloqueoInput,
  EventoLevantamientoBloqueoInput,
  Parse,
  agregarEvento,
  buscarElementoPorId,
  canonicalizarExclusivo,
  serializar,
  sha256Hex,
  validarContraXsd,
  validarFirmaXades,
} from '@psdte/xml-engine';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/config.schema';
import { ProviderFactoryService } from '../integraciones/provider-factory.service';
import { IdDteService } from '../../common/id-dte/id-dte.service';
import { Dte } from '../../entities/dte.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DteBloqueo } from '../../entities/dte-bloqueo.entity';
import { DteEvento } from '../../entities/dte-evento.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { CatCausalBloqueo } from '../../entities/cat-causal-bloqueo.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { Persona } from '../../entities/persona.entity';
import { EventosService } from './eventos.service';
import { EventosComunesService } from './eventos-comunes.service';
import { extraerDetalleFirma } from './firma-xml.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CODIGO_NOTIFICACION_BLOQUEO_APLICADO } from '../notificaciones/plantillas';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const CODIGO_TIPO_EVENTO_BLOQUEO = 2;
const CODIGO_TIPO_EVENTO_LEVANTAMIENTO_BLOQUEO = 7;

export interface ResultadoBloqueo {
  eventoId: string;
  estadoActual: number;
  bloqueoId: string;
}

export interface ResultadoLevantamiento {
  eventoId: string;
  estadoActual: number;
}

@Injectable()
export class BloqueoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventosService: EventosService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly idDteService: IdDteService,
    private readonly eventosComunes: EventosComunesService,
    private readonly notificacionesService: NotificacionesService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @InjectRepository(CatCausalBloqueo) private readonly causalBloqueoRepo: Repository<CatCausalBloqueo>,
    @InjectRepository(Persona) private readonly personaRepo: Repository<Persona>,
  ) {}

  async registrarBloqueo(
    dteId: string,
    callerUsuarioId: string,
    causalCodigo: number,
    autoridad: string,
    numeroOficio: string | null,
    fechaOrden: Date,
    documentoRespaldo: string | null,
  ): Promise<ResultadoBloqueo> {
    const causal = await this.causalBloqueoRepo.findOneOrFail({ where: { codigo: causalCodigo } });
    const { documentoActual, dte, ultimaVersion, idEventoAnterior, idEventoXml, numeroEventoSiguiente } =
      await this.prepararDocumento(dteId);

    const fechaRecepcion = new Date();
    const eventoInput: EventoBloqueoInput = {
      tipo: 'BLOQUEO',
      idEvento: idEventoXml,
      numeroEvento: String(numeroEventoSiguiente).padStart(3, '0'),
      fechaEvento: fechaRecepcion,
      codigoCausalBloqueo: causalCodigo,
      causalBloqueo: causal.nombre,
      autoridad,
      numeroOficio: numeroOficio ?? undefined,
      fechaOrden,
    };

    const { xmlFinal, nodosFirma, hashEvento, hashVigente } = await this.firmarYValidar(
      documentoActual,
      dte,
      idEventoXml,
      idEventoAnterior,
      eventoInput,
    );

    const resultado = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM psdte.dte WHERE id = $1 FOR UPDATE', [dteId]);

      const { eventoId, estadoResultante } = await this.eventosService.aplicarEvento(manager, {
        dteId,
        tipoEvento: CODIGO_TIPO_EVENTO_BLOQUEO,
        idEventoXml,
        numeroEvento: eventoInput.numeroEvento,
        fechaEvento: eventoInput.fechaEvento,
        actorUsuarioId: callerUsuarioId,
        actorDescripcion: `Bloqueo por ${autoridad} (${causal.nombre})`,
        rolActor: 'AUTORIDAD',
        payload: { causalCodigo, autoridad, numeroOficio, fechaOrden },
        hashEvento,
      });

      const bloqueo = await manager.getRepository(DteBloqueo).save(
        manager.getRepository(DteBloqueo).create({
          eventoId,
          dteId,
          causalCodigo,
          autoridad,
          numeroOficio,
          fechaOrden: fechaOrden.toISOString().slice(0, 10),
          fechaRecepcion,
          fechaAplicacion: new Date(),
          eventoLevantamientoId: null,
          documentoRespaldo,
        }),
      );

      await this.persistirVersionYFirmas(manager, dteId, eventoId, ultimaVersion, xmlFinal, hashVigente, nodosFirma);

      return { eventoId, estadoActual: estadoResultante, bloqueoId: bloqueo.id };
    });

    const tenenciaActual = await this.dataSource.getRepository(DteTenencia).findOne({ where: { dteId, hasta: IsNull() } });
    if (tenenciaActual) {
      const tenedor = await this.personaRepo.findOne({ where: { id: tenenciaActual.personaId } });
      if (tenedor?.email) {
        await this.notificacionesService.crear({
          tipoCodigo: CODIGO_NOTIFICACION_BLOQUEO_APLICADO,
          dteId,
          eventoId: resultado.eventoId,
          destinatarioPersonaId: tenedor.id,
          destino: tenedor.email,
          datosPlantilla: { idDte: dte.idDte, autoridad, causal: causal.nombre },
        });
      }
    }

    return resultado;
  }

  async levantarBloqueo(dteId: string, callerUsuarioId: string, bloqueoId: string, motivo: string): Promise<ResultadoLevantamiento> {
    const bloqueoRepo = this.dataSource.getRepository(DteBloqueo);
    const bloqueo = await bloqueoRepo.findOneOrFail({ where: { id: bloqueoId, dteId } });
    if (bloqueo.eventoLevantamientoId !== null) {
      throw new ErrorDominio('ERR-ESTADO-001', 'El bloqueo ya fue levantado');
    }
    const eventoBloqueo = await this.dataSource.getRepository(DteEvento).findOneOrFail({ where: { id: bloqueo.eventoId } });
    const estadoDestino = eventoBloqueo.estadoPrevio;

    const { documentoActual, dte, ultimaVersion, idEventoAnterior, idEventoXml, numeroEventoSiguiente } =
      await this.prepararDocumento(dteId);

    const eventoInput: EventoLevantamientoBloqueoInput = {
      tipo: 'LEVANTAMIENTO_BLOQUEO',
      idEvento: idEventoXml,
      numeroEvento: String(numeroEventoSiguiente).padStart(3, '0'),
      fechaEvento: new Date(),
      motivo,
    };

    const { xmlFinal, nodosFirma, hashEvento, hashVigente } = await this.firmarYValidar(
      documentoActual,
      dte,
      idEventoXml,
      idEventoAnterior,
      eventoInput,
    );

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM psdte.dte WHERE id = $1 FOR UPDATE', [dteId]);

      const { eventoId, estadoResultante } = await this.eventosService.aplicarEvento(manager, {
        dteId,
        tipoEvento: CODIGO_TIPO_EVENTO_LEVANTAMIENTO_BLOQUEO,
        idEventoXml,
        numeroEvento: eventoInput.numeroEvento,
        fechaEvento: eventoInput.fechaEvento,
        actorUsuarioId: callerUsuarioId,
        actorDescripcion: `Levantamiento de bloqueo: ${motivo}`,
        rolActor: 'AUTORIDAD',
        payload: { bloqueoId, motivo },
        hashEvento,
        estadoDestino,
      });

      await manager.getRepository(DteBloqueo).update(bloqueoId, { eventoLevantamientoId: eventoId });

      await this.persistirVersionYFirmas(manager, dteId, eventoId, ultimaVersion, xmlFinal, hashVigente, nodosFirma);

      return { eventoId, estadoActual: estadoResultante };
    });
  }

  private async prepararDocumento(dteId: string) {
    const dte = await this.dataSource.getRepository(Dte).findOneOrFail({ where: { id: dteId } });
    const ultimaVersion = await this.dataSource
      .getRepository(DteXmlVersion)
      .findOne({ where: { dteId }, order: { version: 'DESC' } });
    if (!ultimaVersion?.contenidoXml) {
      throw new ErrorDominio('ERR-SISTEMA-001', 'DTE sin versión XML vigente');
    }
    const ultimoEvento = await this.dataSource
      .getRepository(DteEvento)
      .findOne({ where: { dteId }, order: { secuencia: 'DESC' } });
    const numeroEventoSiguiente = (ultimoEvento?.secuencia ?? 0) + 1;
    const idEventoAnterior = ultimoEvento?.idEventoXml ?? dte.idDatosGenerales;
    const sufijo = this.idDteService.sufijoDesdeIdDte(dte.idDte);
    const idEventoXml = this.idDteService.idEvento(sufijo, numeroEventoSiguiente);
    const documentoActual = Parse(ultimaVersion.contenidoXml);
    return { documentoActual, dte, ultimaVersion, idEventoAnterior, idEventoXml, numeroEventoSiguiente };
  }

  private async firmarYValidar(
    documentoActual: Document,
    dte: Dte,
    idEventoXml: string,
    idEventoAnterior: string,
    eventoInput: EventoBloqueoInput | EventoLevantamientoBloqueoInput,
  ) {
    const { uriEvento } = agregarEvento(documentoActual, dte.idDte, eventoInput);
    const prestador = await this.eventosComunes.resolverPrestadorServicio();
    const firmaProvider = await this.providerFactory.obtenerProveedorFirma();

    // Documento completo, no el fragmento aislado: la referencia I7 a `#${idEventoAnterior}` debe
    // resolver en el mismo documento que recibe el firmante (ver ADR F7 en docs/DECISIONES.md).
    const xmlCanonico = Buffer.from(serializar(documentoActual), 'utf8');
    const resultadoSello = await firmaProvider.solicitarFirma({
      solicitudId: `${idEventoXml}-sello`,
      xmlCanonico,
      referencias: [`#${idEventoAnterior}`],
      uriNodoPrincipal: uriEvento,
      firmante: { documento: prestador.ruc, tipoDocumento: 'RUC', nombre: prestador.nombre },
      rolFirmante: 'PSDTE',
      callbackUrl: '',
      expiraEn: new Date(Date.now() + 15 * 60_000),
    });
    if (resultadoSello.estado !== 'FIRMADA' || !resultadoSello.xadesXml) {
      throw new ErrorDominio('ERR-FIRMA-001', `El PSDTE no pudo sellar el evento de ${eventoInput.tipo}`);
    }

    const xmlFinal = resultadoSello.xadesXml;
    const documentoFinal = Parse(xmlFinal);
    const xsd = validarContraXsd(xmlFinal, this.configService.get('XSD_PATH', { infer: true }));
    if (!xsd.valido) {
      throw new ErrorDominio('ERR-XSD-001', 'El XML final no cumple el esquema del perfil DTE', { errores: xsd.errores });
    }

    const nodoEventoFinal = buscarElementoPorId(documentoFinal, idEventoXml)!;
    const nodosFirma = Array.from(nodoEventoFinal.getElementsByTagNameNS(DS_NS, 'Signature')) as unknown as Element[];
    for (const nodoFirma of nodosFirma) {
      const validacion = await validarFirmaXades(documentoFinal, nodoFirma);
      if (!validacion.valida) {
        throw new ErrorDominio('ERR-FIRMA-001', `Firma XAdES inválida: ${validacion.motivo ?? 'sin motivo'}`);
      }
    }

    const hashEvento = sha256Hex(canonicalizarExclusivo(nodoEventoFinal));
    const hashVigente = sha256Hex(canonicalizarExclusivo(documentoFinal.documentElement));

    return { xmlFinal, nodosFirma, hashEvento, hashVigente, nodoEventoFinal };
  }

  private async persistirVersionYFirmas(
    manager: import('typeorm').EntityManager,
    dteId: string,
    eventoId: string,
    ultimaVersion: DteXmlVersion,
    xmlFinal: string,
    hashVigente: string,
    nodosFirma: Element[],
  ): Promise<void> {
    await manager.getRepository(DteXmlVersion).save(
      manager.getRepository(DteXmlVersion).create({
        dteId,
        version: ultimaVersion.version + 1,
        eventoId,
        hashSha256: hashVigente,
        tamanoBytes: String(Buffer.byteLength(xmlFinal, 'utf8')),
        almacenamiento: 'DB',
        contenidoXml: xmlFinal,
      }),
    );
    await manager.getRepository(Dte).update(dteId, { hashVigente });

    for (const nodoFirma of nodosFirma) {
      const detalle = extraerDetalleFirma(nodoFirma);
      const certificado = await manager.getRepository(Certificado).save(
        manager.getRepository(Certificado).create({
          numeroSerie: detalle.x509.serialNumber,
          subjectDn: detalle.x509.subject,
          issuerDn: detalle.x509.issuer,
          tipo: 'SELLO_PSDTE',
          validoDesde: new Date(detalle.x509.validFrom),
          validoHasta: new Date(detalle.x509.validTo),
          certificadoDer: detalle.certificadoDer,
          enTsl: true,
        }),
      );
      await manager.getRepository(Firma).save(
        manager.getRepository(Firma).create({
          dteId,
          eventoId,
          xmlSignatureId: detalle.xmlSignatureId,
          ambito: 'EVENTO',
          rolFirmante: 'PSDTE',
          certificadoId: certificado.id,
          formato: 'XAdES-T',
          algoritmoFirma: detalle.algoritmoFirma,
          algoritmoDigest: detalle.algoritmoDigest,
          signingTime: detalle.signingTime,
          referencias: detalle.referencias,
          signatureValueHash: detalle.signatureValueHash,
          selloTiempoTsa: detalle.selloTiempoTsa,
          tsaFecha: detalle.selloTiempoTsa ? detalle.signingTime : null,
          estadoValidacion: 'VALIDA',
          validadaEn: new Date(),
        }),
      );
    }
  }
}

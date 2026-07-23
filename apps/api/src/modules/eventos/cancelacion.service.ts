import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import {
  EventoCancelacionInput,
  Parse,
  agregarEvento,
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
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DteCancelacion } from '../../entities/dte-cancelacion.entity';
import { DteEvento } from '../../entities/dte-evento.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { Persona } from '../../entities/persona.entity';
import { EventosService } from './eventos.service';
import { EventosComunesService } from './eventos-comunes.service';
import { extraerDetalleFirma } from './firma-xml.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CODIGO_NOTIFICACION_DTE_CANCELADO } from '../notificaciones/plantillas';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const CODIGO_TIPO_EVENTO_CANCELACION = 1;

export interface ResultadoCancelacion {
  eventoId: string;
  estadoActual: number;
}

/**
 * CANCELACION es terminal (I: estado final CANCELADO): a diferencia de endoso/pago/bloqueo, el
 * `gEvento` de cancelación NO lleva firma propia — en su lugar, el PSDTE aplica un sello final sobre
 * TODO el documento (`URI=""`, enveloped, hermano de `<DTE>` bajo `<rDTE>`), replicando exactamente
 * el patrón observado en el XML de referencia (ver ADR-014 en docs/DECISIONES.md).
 */
@Injectable()
export class CancelacionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventosService: EventosService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly idDteService: IdDteService,
    private readonly eventosComunes: EventosComunesService,
    private readonly notificacionesService: NotificacionesService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @InjectRepository(Persona) private readonly personaRepo: Repository<Persona>,
  ) {}

  async cancelar(dteId: string, callerUsuarioId: string, callerPersonaId: string, motivo: string): Promise<ResultadoCancelacion> {
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
    const sufijo = this.idDteService.sufijoDesdeIdDte(dte.idDte);
    const idEventoXml = this.idDteService.idEvento(sufijo, numeroEventoSiguiente);
    const prestador = await this.eventosComunes.resolverPrestadorServicio();

    const documentoConEvento = Parse(ultimaVersion.contenidoXml);
    const eventoInput: EventoCancelacionInput = {
      tipo: 'CANCELACION',
      idEvento: idEventoXml,
      numeroEvento: String(numeroEventoSiguiente).padStart(3, '0'),
      fechaEvento: new Date(),
      motivo,
    };
    const { nodoEvento } = agregarEvento(documentoConEvento, dte.idDte, eventoInput);
    const hashEventoSinFirma = sha256Hex(canonicalizarExclusivo(nodoEvento as unknown as Element));

    const firmaProvider = await this.providerFactory.obtenerProveedorFirma();
    const xmlCanonicoDocumentoCompleto = Buffer.from(serializar(documentoConEvento), 'utf8');
    const resultadoSello = await firmaProvider.solicitarFirma({
      solicitudId: `${idEventoXml}-sello-final`,
      xmlCanonico: xmlCanonicoDocumentoCompleto,
      referencias: [],
      uriNodoPrincipal: '',
      firmante: { documento: prestador.ruc, tipoDocumento: 'RUC', nombre: prestador.nombre },
      rolFirmante: 'PSDTE',
      callbackUrl: '',
      expiraEn: new Date(Date.now() + 15 * 60_000),
    });
    if (resultadoSello.estado !== 'FIRMADA' || !resultadoSello.xadesXml) {
      throw new ErrorDominio('ERR-FIRMA-001', 'El PSDTE no pudo aplicar el sello final de cancelación');
    }

    const xmlFinal = resultadoSello.xadesXml;
    const documentoFinal = Parse(xmlFinal);
    const xsd = validarContraXsd(xmlFinal, this.configService.get('XSD_PATH', { infer: true }));
    if (!xsd.valido) {
      throw new ErrorDominio('ERR-XSD-001', 'El XML final no cumple el esquema del perfil DTE', { errores: xsd.errores });
    }

    const nodosFirma = Array.from(documentoFinal.getElementsByTagNameNS(DS_NS, 'Signature')) as unknown as Element[];
    const nodoFirmaFinal = nodosFirma[nodosFirma.length - 1];
    const validacion = await validarFirmaXades(documentoFinal, nodoFirmaFinal);
    if (!validacion.valida) {
      throw new ErrorDominio('ERR-FIRMA-001', `Firma XAdES inválida: ${validacion.motivo ?? 'sin motivo'}`);
    }

    const hashVigente = sha256Hex(canonicalizarExclusivo(documentoFinal.documentElement));

    const resultado = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM psdte.dte WHERE id = $1 FOR UPDATE', [dteId]);

      const tenenciaActual = await manager
        .getRepository(DteTenencia)
        .findOne({ where: { dteId, hasta: IsNull() } });
      if (!tenenciaActual || tenenciaActual.personaId !== callerPersonaId) {
        throw new ErrorDominio('ERR-CTRL-001', 'El solicitante no es el tenedor/controlador vigente');
      }

      const { eventoId, estadoResultante } = await this.eventosService.aplicarEvento(manager, {
        dteId,
        tipoEvento: CODIGO_TIPO_EVENTO_CANCELACION,
        idEventoXml,
        numeroEvento: eventoInput.numeroEvento,
        fechaEvento: eventoInput.fechaEvento,
        actorUsuarioId: callerUsuarioId,
        actorDescripcion: `Cancelación: ${motivo}`,
        rolActor: 'TENEDOR',
        payload: { motivo },
        hashEvento: hashEventoSinFirma,
      });

      await manager.getRepository(DteCancelacion).save(
        manager.getRepository(DteCancelacion).create({ eventoId, dteId, motivo }),
      );

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

      const detalle = extraerDetalleFirma(nodoFirmaFinal);
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
          ambito: 'DOCUMENTO',
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

      return { eventoId, estadoActual: estadoResultante };
    });

    const tenedor = await this.personaRepo.findOne({ where: { id: callerPersonaId } });
    if (tenedor?.email) {
      await this.notificacionesService.crear({
        tipoCodigo: CODIGO_NOTIFICACION_DTE_CANCELADO,
        dteId,
        eventoId: resultado.eventoId,
        destinatarioPersonaId: tenedor.id,
        destino: tenedor.email,
        datosPlantilla: { idDte: dte.idDte, motivo },
      });
    }

    return resultado;
  }
}

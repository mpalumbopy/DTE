import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import {
  EventoPagoInput,
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
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DtePago } from '../../entities/dte-pago.entity';
import { DteEvento } from '../../entities/dte-evento.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { EventosService } from './eventos.service';
import { EventosComunesService } from './eventos-comunes.service';
import { extraerDetalleFirma } from './firma-xml.util';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const CODIGO_TIPO_EVENTO_PAGO = 4;
const CODIGO_ESTADO_PAGADO_PARCIAL = 4;
const CODIGO_ESTADO_PAGADO_TOTAL = 5;

export interface ResultadoPago {
  eventoId: string;
  estadoActual: number;
  numeroPago: number;
  saldoPendiente: string;
}

@Injectable()
export class PagoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventosService: EventosService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly idDteService: IdDteService,
    private readonly eventosComunes: EventosComunesService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @InjectRepository(DtePago) private readonly dtePagoRepo: Repository<DtePago>,
  ) {}

  async registrarPago(
    dteId: string,
    callerUsuarioId: string,
    callerPersonaId: string,
    montoPagado: number,
    medioPago: string | null,
    referenciaExterna: string | null,
  ): Promise<ResultadoPago> {
    if (montoPagado <= 0) {
      throw new ErrorDominio('ERR-SEM-002', 'El monto pagado debe ser mayor a cero');
    }

    const dte = await this.dataSource.getRepository(Dte).findOneOrFail({ where: { id: dteId } });
    const saldoActual = Number(dte.saldoPendiente);
    if (montoPagado > saldoActual) {
      throw new ErrorDominio('ERR-SEM-002', `El monto pagado (${montoPagado}) excede el saldo pendiente (${saldoActual})`);
    }
    const saldoNuevo = Math.round((saldoActual - montoPagado) * 100) / 100;
    const estadoDestino = saldoNuevo > 0 ? CODIGO_ESTADO_PAGADO_PARCIAL : CODIGO_ESTADO_PAGADO_TOTAL;

    const ultimaVersion = await this.dataSource
      .getRepository(DteXmlVersion)
      .findOne({ where: { dteId }, order: { version: 'DESC' } });
    if (!ultimaVersion?.contenidoXml) {
      throw new ErrorDominio('ERR-SISTEMA-001', 'DTE sin versión XML vigente');
    }

    const numeroPagoAnterior = await this.dtePagoRepo.count({ where: { dteId } });
    const numeroPagoSiguiente = numeroPagoAnterior + 1;
    const ultimoEvento = await this.dataSource
      .getRepository(DteEvento)
      .findOne({ where: { dteId }, order: { secuencia: 'DESC' } });
    const numeroEventoSiguiente = (ultimoEvento?.secuencia ?? 0) + 1;
    const idEventoAnterior = ultimoEvento?.idEventoXml ?? dte.idDatosGenerales;
    const sufijo = this.idDteService.sufijoDesdeIdDte(dte.idDte);
    const idEventoXml = this.idDteService.idEvento(sufijo, numeroEventoSiguiente);
    const prestador = await this.eventosComunes.resolverPrestadorServicio();

    const documentoActual = Parse(ultimaVersion.contenidoXml);
    const eventoInput: EventoPagoInput = {
      tipo: 'PAGO',
      idEvento: idEventoXml,
      numeroEvento: String(numeroEventoSiguiente).padStart(3, '0'),
      fechaEvento: new Date(),
      numeroPago: String(numeroPagoSiguiente).padStart(2, '0'),
      montoPagado,
      saldoPendiente: saldoNuevo,
    };
    const { uriEvento } = agregarEvento(documentoActual, dte.idDte, eventoInput);

    // Documento completo, no el fragmento aislado: la referencia I7 a `#${idEventoAnterior}` debe
    // resolver en el mismo documento que recibe el firmante (ver ADR F7 en docs/DECISIONES.md).
    const firmaProvider = await this.providerFactory.obtenerProveedorFirma();
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
      throw new ErrorDominio('ERR-FIRMA-001', 'El PSDTE no pudo sellar el evento de pago');
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

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM psdte.dte WHERE id = $1 FOR UPDATE', [dteId]);

      const tenenciaActual = await manager
        .getRepository(DteTenencia)
        .findOne({ where: { dteId, hasta: IsNull() } });
      if (!tenenciaActual || tenenciaActual.personaId !== callerPersonaId) {
        throw new ErrorDominio('ERR-CTRL-001', 'El solicitante no es el tenedor/controlador vigente');
      }

      const { eventoId, estadoResultante } = await this.eventosService.aplicarEvento(manager, {
        dteId,
        tipoEvento: CODIGO_TIPO_EVENTO_PAGO,
        idEventoXml,
        numeroEvento: eventoInput.numeroEvento,
        fechaEvento: eventoInput.fechaEvento,
        actorUsuarioId: callerUsuarioId,
        actorDescripcion: `Pago #${numeroPagoSiguiente} registrado`,
        rolActor: 'TENEDOR',
        payload: { numeroPago: numeroPagoSiguiente, montoPagado, saldoPendiente: saldoNuevo },
        hashEvento,
        estadoDestino,
      });

      await manager.getRepository(DtePago).save(
        manager.getRepository(DtePago).create({
          eventoId,
          dteId,
          numeroPago: numeroPagoSiguiente,
          montoPagado: String(montoPagado),
          saldoPendiente: String(saldoNuevo),
          medioPago,
          referenciaExterna,
        }),
      );

      await manager.getRepository(Dte).update(dteId, { saldoPendiente: String(saldoNuevo), hashVigente });

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

      return { eventoId, estadoActual: estadoResultante, numeroPago: numeroPagoSiguiente, saldoPendiente: String(saldoNuevo) };
    });
  }
}

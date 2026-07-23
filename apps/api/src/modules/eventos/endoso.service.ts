import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import {
  EventoEndosoInput,
  agregarEvento,
  buscarElementoPorId,
  canonicalizarExclusivo,
  construirTextoEndoso,
  Parse,
  serializar,
  sha256Hex,
  validarContraXsd,
  validarFirmaXades,
} from '@psdte/xml-engine';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/config.schema';
import { ProviderFactoryService } from '../integraciones/provider-factory.service';
import { IdDteService } from '../../common/id-dte/id-dte.service';
import { Persona } from '../../entities/persona.entity';
import { Dte } from '../../entities/dte.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DteEndoso } from '../../entities/dte-endoso.entity';
import { DteEvento } from '../../entities/dte-evento.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { EventosService } from './eventos.service';
import { EventosComunesService } from './eventos-comunes.service';
import { extraerDetalleFirma } from './firma-xml.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CODIGO_NOTIFICACION_ENDOSO_REGISTRADO } from '../notificaciones/plantillas';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const CODIGO_TIPO_EVENTO_ENDOSO = 3;

export interface ResultadoEndoso {
  eventoId: string;
  estadoActual: number;
  numeroEndoso: number;
}

@Injectable()
export class EndosoService {
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

  async registrarEndoso(
    dteId: string,
    callerUsuarioId: string,
    callerPersonaId: string,
    endosatarioPersonaId: string,
  ): Promise<ResultadoEndoso> {
    const dte = await this.dataSource.getRepository(Dte).findOneOrFail({ where: { id: dteId } });
    const ultimaVersion = await this.dataSource
      .getRepository(DteXmlVersion)
      .findOne({ where: { dteId }, order: { version: 'DESC' } });
    if (!ultimaVersion?.contenidoXml) {
      throw new ErrorDominio('ERR-SISTEMA-001', 'DTE sin versión XML vigente');
    }

    const [endosantePersona, endosatarioPersona] = await Promise.all([
      this.personaRepo.findOneOrFail({ where: { id: callerPersonaId } }),
      this.personaRepo.findOneOrFail({ where: { id: endosatarioPersonaId } }),
    ]);
    if (endosantePersona.id === endosatarioPersona.id) {
      throw new ErrorDominio('ERR-SEM-002', 'El endosante y el endosatario no pueden ser la misma persona');
    }

    const numeroEndosoAnterior = await this.dataSource.getRepository(DteEndoso).count({ where: { dteId } });
    const numeroEndosoSiguiente = numeroEndosoAnterior + 1;
    const ultimoEvento = await this.dataSource
      .getRepository(DteEvento)
      .findOne({ where: { dteId }, order: { secuencia: 'DESC' } });
    const numeroEventoSiguiente = (ultimoEvento?.secuencia ?? 0) + 1;
    const idEventoAnterior = ultimoEvento?.idEventoXml ?? dte.idDatosGenerales;
    const sufijo = this.idDteService.sufijoDesdeIdDte(dte.idDte);
    const idEventoXml = this.idDteService.idEvento(sufijo, numeroEventoSiguiente);

    const [docEndosante, docEndosatario, prestador] = await Promise.all([
      this.eventosComunes.resolverDocumentoIdentidad(endosantePersona),
      this.eventosComunes.resolverDocumentoIdentidad(endosatarioPersona),
      this.eventosComunes.resolverPrestadorServicio(),
    ]);

    const nombreEndosante = endosantePersona.nombresApellidos ?? endosantePersona.razonSocial ?? '';
    const nombreEndosatario = endosatarioPersona.nombresApellidos ?? endosatarioPersona.razonSocial ?? '';

    const documentoActual = Parse(ultimaVersion.contenidoXml);
    const eventoInput: EventoEndosoInput = {
      tipo: 'ENDOSO',
      idEvento: idEventoXml,
      numeroEvento: String(numeroEventoSiguiente).padStart(3, '0'),
      fechaEvento: new Date(),
      numeroEndoso: String(numeroEndosoSiguiente).padStart(2, '0'),
      endosante: { condicionFirmante: `Endosante-${numeroEndosoSiguiente}`, nombresApellidos: nombreEndosante, documento: docEndosante },
      endosatario: { nombresApellidos: nombreEndosatario, documento: docEndosatario },
    };
    const { uriEvento } = agregarEvento(documentoActual, dte.idDte, eventoInput);

    // Se envía el documento COMPLETO (no solo el fragmento gEvento aislado): la referencia I7 al
    // evento/nodo anterior (`#${idEventoAnterior}`) debe resolver dentro del mismo documento que
    // recibe el firmante — un fragmento aislado no contendría ese nodo (ver ADR F7 en
    // docs/DECISIONES.md). El simulador anida cada `ds:Signature` dentro del nodo referenciado por
    // `uriNodoPrincipal` (no en la raíz), así que el resultado sigue siendo el documento completo.
    const firmaProvider = await this.providerFactory.obtenerProveedorFirma();
    const expiraEn = new Date(Date.now() + 15 * 60_000);
    let xmlCanonico = Buffer.from(serializar(documentoActual), 'utf8');

    const resultadoEndosante = await firmaProvider.solicitarFirma({
      solicitudId: `${idEventoXml}-endosante`,
      xmlCanonico,
      referencias: [`#${idEventoAnterior}`],
      uriNodoPrincipal: uriEvento,
      firmante: { documento: docEndosante.numero, tipoDocumento: docEndosante.tipo, nombre: nombreEndosante },
      rolFirmante: 'ENDOSANTE',
      callbackUrl: '',
      expiraEn,
    });
    if (resultadoEndosante.estado !== 'FIRMADA' || !resultadoEndosante.xadesXml) {
      throw new ErrorDominio('ERR-FIRMA-001', 'No se pudo obtener la firma del endosante');
    }
    xmlCanonico = Buffer.from(resultadoEndosante.xadesXml, 'utf8');

    const resultadoSello = await firmaProvider.solicitarFirma({
      solicitudId: `${idEventoXml}-sello`,
      xmlCanonico,
      referencias: [`#${idEventoAnterior}`],
      uriNodoPrincipal: uriEvento,
      firmante: { documento: prestador.ruc, tipoDocumento: 'RUC', nombre: prestador.nombre },
      rolFirmante: 'PSDTE',
      callbackUrl: '',
      expiraEn,
    });
    if (resultadoSello.estado !== 'FIRMADA' || !resultadoSello.xadesXml) {
      throw new ErrorDominio('ERR-FIRMA-001', 'El PSDTE no pudo sellar el evento de endoso');
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
    const textoEndoso = construirTextoEndoso(eventoInput.endosatario);

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
        tipoEvento: CODIGO_TIPO_EVENTO_ENDOSO,
        idEventoXml,
        numeroEvento: eventoInput.numeroEvento,
        fechaEvento: eventoInput.fechaEvento,
        actorUsuarioId: callerUsuarioId,
        actorDescripcion: `Endoso registrado por ${nombreEndosante}`,
        rolActor: 'TENEDOR',
        payload: { numeroEndoso: numeroEndosoSiguiente, endosatarioPersonaId },
        hashEvento,
      });

      await manager.getRepository(DteEndoso).save(
        manager.getRepository(DteEndoso).create({
          eventoId,
          dteId,
          numeroEndoso: numeroEndosoSiguiente,
          endosantePersonaId: callerPersonaId,
          endosanteCondicion: eventoInput.endosante.condicionFirmante,
          endosatarioPersonaId,
          textoEndoso,
        }),
      );

      await manager
        .getRepository(DteTenencia)
        .update({ dteId, hasta: IsNull() }, { hasta: eventoInput.fechaEvento });
      await manager.getRepository(DteTenencia).save(
        manager.getRepository(DteTenencia).create({
          dteId,
          personaId: endosatarioPersonaId,
          origen: 'ENDOSO',
          eventoId,
          desde: eventoInput.fechaEvento,
        }),
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

      for (const nodoFirma of nodosFirma) {
        const detalle = extraerDetalleFirma(nodoFirma);
        const certificado = await manager.getRepository(Certificado).save(
          manager.getRepository(Certificado).create({
            numeroSerie: detalle.x509.serialNumber,
            subjectDn: detalle.x509.subject,
            issuerDn: detalle.x509.issuer,
            tipo: detalle.x509.subject.includes(prestador.nombre) ? 'SELLO_PSDTE' : 'FIRMA_CUALIFICADA',
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
            rolFirmante: detalle.x509.subject.includes(prestador.nombre) ? 'PSDTE' : 'ENDOSANTE',
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

      return { eventoId, estadoActual: estadoResultante, numeroEndoso: numeroEndosoSiguiente };
    });

    if (endosatarioPersona.email) {
      await this.notificacionesService.crear({
        tipoCodigo: CODIGO_NOTIFICACION_ENDOSO_REGISTRADO,
        dteId,
        eventoId: resultado.eventoId,
        destinatarioPersonaId: endosatarioPersona.id,
        destino: endosatarioPersona.email,
        datosPlantilla: { idDte: dte.idDte, nombreEndosatario: nombreEndosatario, numeroEndoso: numeroEndosoSiguiente },
      });
    }

    return resultado;
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { EnvConfig } from '../../config/config.schema';
import {
  AcreedorInicialInput,
  CoDeudorInput,
  DatosGeneralesDteInput,
  DeudorInput,
  DireccionInput,
  DocumentoIdentidadInput,
  Parse,
  canonicalizarExclusivo,
  construirDatosGeneralesDte,
  montoALetras,
  parsearDte,
  serializar,
  sha256Hex,
  validarContraXsd,
  validarFirmaXades,
  validarSemantica,
} from '@psdte/xml-engine';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { extraerDetalleFirma } from '../eventos/firma-xml.util';
import { IdDteService } from '../../common/id-dte/id-dte.service';
import { ProviderFactoryService } from '../integraciones/provider-factory.service';
import { Persona } from '../../entities/persona.entity';
import { PersonaDireccion } from '../../entities/persona-direccion.entity';
import { CatPais } from '../../entities/cat-pais.entity';
import { CatDepartamento } from '../../entities/cat-departamento.entity';
import { CatDistrito } from '../../entities/cat-distrito.entity';
import { CatCiudad } from '../../entities/cat-ciudad.entity';
import { CatMoneda } from '../../entities/cat-moneda.entity';
import { CatTipoDocumentoIdentidad } from '../../entities/cat-tipo-documento-identidad.entity';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';
import { Dte } from '../../entities/dte.entity';
import { DteParte, RolParte } from '../../entities/dte-parte.entity';
import { DteLugarPago } from '../../entities/dte-lugar-pago.entity';
import { DteCondicion } from '../../entities/dte-condicion.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { Evidencia } from '../../entities/evidencia.entity';
import { Notificacion } from '../../entities/notificacion.entity';
import { SolicitudFirma } from '../../entities/solicitud-firma.entity';
import { BorradorEmisionStore } from './borrador-emision.store';
import { aDatosGeneralesInput, BorradorEmisionState, FirmaParteRecolectada } from './borrador-emision.types';
import { CrearEmisionDto } from './dto/crear-emision.dto';
import { DireccionDto } from './dto/direccion.dto';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const CODIGO_ESTADO_EMITIDO = 1;
const CODIGO_EVIDENCIA_XML_FIRMADO = 1;
const CODIGO_NOTIFICACION_EMISION_CONFIRMADA = 1;

@Injectable()
export class EmisionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly store: BorradorEmisionStore,
    private readonly idDteService: IdDteService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly auditoriaService: AuditoriaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @InjectRepository(Persona) private readonly personaRepo: Repository<Persona>,
    @InjectRepository(PersonaDireccion) private readonly personaDireccionRepo: Repository<PersonaDireccion>,
    @InjectRepository(CatPais) private readonly paisRepo: Repository<CatPais>,
    @InjectRepository(CatDepartamento) private readonly departamentoRepo: Repository<CatDepartamento>,
    @InjectRepository(CatDistrito) private readonly distritoRepo: Repository<CatDistrito>,
    @InjectRepository(CatCiudad) private readonly ciudadRepo: Repository<CatCiudad>,
    @InjectRepository(CatMoneda) private readonly monedaRepo: Repository<CatMoneda>,
    @InjectRepository(CatTipoDocumentoIdentidad) private readonly tipoDocumentoRepo: Repository<CatTipoDocumentoIdentidad>,
    @InjectRepository(ParametroSistema) private readonly parametrosRepo: Repository<ParametroSistema>,
    @InjectRepository(SolicitudFirma) private readonly solicitudFirmaRepo: Repository<SolicitudFirma>,
  ) {}

  async crearBorrador(dto: CrearEmisionDto, usuarioId: string): Promise<{ idDatosGenerales: string; idDte: string }> {
    const fechaEmision = new Date();
    const fechaVencimiento = new Date(dto.fechaVencimiento);
    const codigoMoneda = dto.codigoMoneda ?? 'PYG';

    const [acreedorPersona, deudoresPersonas, codeudoresPersonas, moneda] = await Promise.all([
      this.obtenerPersona(dto.acreedorInicialPersonaId),
      Promise.all(dto.deudores.map((d) => this.obtenerPersona(d.personaId))),
      Promise.all((dto.codeudores ?? []).map((d) => this.obtenerPersona(d.personaId))),
      this.monedaRepo.findOneOrFail({ where: { codigo: codigoMoneda } }),
    ]);

    const [lugarEmision, lugaresPago, acreedorInicial, deudores, codeudores, prestadorServicio] = await Promise.all([
      this.resolverDireccionDesdeCodigos(dto.lugarEmision),
      Promise.all(dto.lugaresPago.map((l) => this.resolverDireccionDesdeCodigos(l))),
      this.resolverAcreedorInicial(acreedorPersona),
      Promise.all(dto.deudores.map((d, i) => this.resolverDeudor(deudoresPersonas[i], d.condicionFirmante))),
      Promise.all((dto.codeudores ?? []).map((d, i) => this.resolverDeudor(codeudoresPersonas[i], d.condicionFirmante))),
      this.resolverPrestadorServicio(),
    ]);

    const { sufijo, secuencial } = await this.idDteService.generarSufijo(fechaEmision);
    const idDte = this.idDteService.idDte(sufijo);
    const idDatosGenerales = this.idDteService.idDatosGenerales(sufijo);
    const enlaceQr = await this.resolverEnlaceQr(idDte);

    const datosGenerales: DatosGeneralesDteInput = {
      idDte,
      idDatosGenerales,
      codigoTipoDte: 1,
      descripcionTipoDte: 'PAGARE A LA ORDEN',
      numeroDte: secuencial,
      fechaEmision,
      fechaVencimiento,
      codigoMoneda,
      descripcionMoneda: moneda.descripcion,
      monto: dto.monto,
      lugarEmision,
      lugaresPago,
      acreedorInicial,
      deudores,
      codeudores,
      condiciones: dto.condiciones,
      prestadorServicio,
      enlaceQr,
    };
    const montoLetras = montoALetras(dto.monto);

    // Construir ahora (aunque el resultado se descarte) valida placeholders/campos requeridos
    // antes de aceptar el borrador — el generador es estricto (ver packages/xml-engine ADR-014).
    construirDatosGeneralesDte(datosGenerales, montoLetras);

    const estado: BorradorEmisionState = {
      estado: 'BORRADOR',
      creadoPor: usuarioId,
      creadoEn: new Date().toISOString(),
      montoLetras,
      datosGenerales: {
        ...datosGenerales,
        fechaEmision: fechaEmision.toISOString(),
        fechaVencimiento: fechaVencimiento.toISOString(),
      },
      acreedorInicialPersonaId: dto.acreedorInicialPersonaId,
      deudores: dto.deudores,
      codeudores: dto.codeudores ?? [],
      firmasPartes: [],
    };
    await this.store.guardar(idDatosGenerales, estado);
    return { idDatosGenerales, idDte };
  }

  async obtenerBorrador(idDatosGenerales: string): Promise<BorradorEmisionState> {
    const estado = await this.store.obtener(idDatosGenerales);
    if (!estado) {
      throw new ErrorDominio('ERR-DTE-404', `Borrador inexistente o expirado: ${idDatosGenerales}`);
    }
    return estado;
  }

  async solicitarFirmas(idDatosGenerales: string): Promise<{ estado: string; firmantesCompletos: number }> {
    const estado = await this.obtenerBorrador(idDatosGenerales);
    if (estado.estado !== 'BORRADOR') {
      throw new ErrorDominio('ERR-ESTADO-001', `El borrador ya no admite solicitar firmas (estado: ${estado.estado})`);
    }

    const datosGenerales = aDatosGeneralesInput(estado.datosGenerales);
    const { nodoDatosGenerales } = construirDatosGeneralesDte(datosGenerales, estado.montoLetras);
    let xmlCanonico = Buffer.from(canonicalizarExclusivo(nodoDatosGenerales), 'utf8');

    const firmaProvider = await this.providerFactory.obtenerProveedorFirma();
    const firmantes: Array<{ personaId: string; condicionFirmante: string; rol: 'DEUDOR' | 'CODEUDOR' }> = [
      ...estado.deudores.map((d) => ({ ...d, rol: 'DEUDOR' as const })),
      ...estado.codeudores.map((d) => ({ ...d, rol: 'CODEUDOR' as const })),
    ];

    const firmasPartes: FirmaParteRecolectada[] = [];
    const expiraEn = new Date(Date.now() + 15 * 60_000);

    for (const firmante of firmantes) {
      const persona = await this.obtenerPersona(firmante.personaId);
      const documento = await this.resolverDocumentoIdentidad(persona);

      const solicitud = await this.solicitudFirmaRepo.save(
        this.solicitudFirmaRepo.create({
          dteId: null,
          ambito: 'DATOS_GENERALES',
          nodoRef: `#${datosGenerales.idDatosGenerales}`,
          firmantePersonaId: firmante.personaId,
          rolFirmante: firmante.rol,
          estado: 'ENVIADA',
          xmlAFirmarHash: sha256Hex(xmlCanonico),
          expiraEn,
        }),
      );

      const resultado = await firmaProvider.solicitarFirma({
        solicitudId: solicitud.id,
        xmlCanonico,
        referencias: [],
        uriNodoPrincipal: `#${datosGenerales.idDatosGenerales}`,
        firmante: {
          documento: documento.numero,
          tipoDocumento: documento.tipo,
          nombre: persona.nombresApellidos ?? persona.razonSocial ?? '',
          email: persona.email ?? undefined,
        },
        rolFirmante: firmante.rol,
        callbackUrl: '',
        expiraEn,
      });

      if (resultado.estado !== 'FIRMADA' || !resultado.xadesXml) {
        solicitud.estado = 'ERROR';
        await this.solicitudFirmaRepo.save(solicitud);
        throw new ErrorDominio('ERR-FIRMA-001', `No se pudo obtener la firma de ${firmante.rol} (${firmante.personaId})`);
      }
      solicitud.estado = 'FIRMADA';
      solicitud.providerRef = resultado.providerRef;
      solicitud.resultado = { xadesXml: resultado.xadesXml };
      await this.solicitudFirmaRepo.save(solicitud);

      firmasPartes.push({
        personaId: firmante.personaId,
        rolFirmante: firmante.rol,
        condicionFirmante: firmante.condicionFirmante,
        solicitudFirmaId: solicitud.id,
      });
      xmlCanonico = Buffer.from(resultado.xadesXml, 'utf8');
    }

    estado.firmasPartes = firmasPartes;
    estado.xmlDatosGeneralesFirmadoParcial = xmlCanonico.toString('utf8');
    estado.estado = 'LISTO_PARA_CONFIRMAR';
    await this.store.guardar(idDatosGenerales, estado);

    return { estado: estado.estado, firmantesCompletos: firmasPartes.length };
  }

  async confirmar(idDatosGenerales: string, usuarioId: string): Promise<{ dteId: string; idDte: string; estadoActual: number }> {
    const estado = await this.obtenerBorrador(idDatosGenerales);
    if (estado.estado !== 'LISTO_PARA_CONFIRMAR' || !estado.xmlDatosGeneralesFirmadoParcial) {
      throw new ErrorDominio('ERR-ESTADO-001', 'Faltan firmas de las partes antes de confirmar');
    }

    const datosGenerales = aDatosGeneralesInput(estado.datosGenerales);
    const prestador = await this.resolverPrestadorServicio();

    // Sello PSDTE: última firma sobre gDatosGeneralesDTE, encadenada a las de las partes.
    const firmaProvider = await this.providerFactory.obtenerProveedorFirma();
    const resultadoSello = await firmaProvider.solicitarFirma({
      solicitudId: `sello-${idDatosGenerales}`,
      xmlCanonico: Buffer.from(estado.xmlDatosGeneralesFirmadoParcial, 'utf8'),
      referencias: [],
      uriNodoPrincipal: `#${datosGenerales.idDatosGenerales}`,
      firmante: { documento: prestador.ruc, tipoDocumento: 'RUC', nombre: prestador.nombre },
      rolFirmante: 'PSDTE',
      callbackUrl: '',
      expiraEn: new Date(Date.now() + 15 * 60_000),
    });
    if (resultadoSello.estado !== 'FIRMADA' || !resultadoSello.xadesXml) {
      throw new ErrorDominio('ERR-FIRMA-001', 'El PSDTE no pudo aplicar el sello sobre el documento');
    }

    const documentoFinal = Parse(
      `<rDTE xmlns="http://acraiz.gov.py/pagare/arhivos-en-xsd"><DTE id="${datosGenerales.idDte}" version="1.0"></DTE></rDTE>`,
    );
    const nodoGDatosGeneralesFirmado = Parse(resultadoSello.xadesXml).documentElement;
    const nodoDte = documentoFinal.getElementsByTagName('DTE')[0] as unknown as Element;
    nodoDte.appendChild(documentoFinal.importNode(nodoGDatosGeneralesFirmado, true));

    const xmlFinal = serializar(documentoFinal);

    const xsd = validarContraXsd(xmlFinal, this.rutaXsd());
    if (!xsd.valido) {
      throw new ErrorDominio('ERR-XSD-001', 'El XML final no cumple el esquema del perfil DTE', {
        errores: xsd.errores,
      });
    }
    const parseo = parsearDte(xmlFinal);
    const erroresSemanticos = validarSemantica(parseo);
    if (erroresSemanticos.length > 0) {
      throw new ErrorDominio(erroresSemanticos[0].codigo, erroresSemanticos[0].mensaje, { errores: erroresSemanticos });
    }

    const nodosFirma = Array.from(documentoFinal.getElementsByTagNameNS(DS_NS, 'Signature')) as unknown as Element[];
    for (const nodoFirma of nodosFirma) {
      const validacion = await validarFirmaXades(documentoFinal, nodoFirma);
      if (!validacion.valida) {
        throw new ErrorDominio('ERR-FIRMA-001', `Firma XAdES inválida: ${validacion.motivo ?? 'sin motivo'}`);
      }
    }

    const hashVigente = sha256Hex(canonicalizarExclusivo(documentoFinal.documentElement));
    const dteCreado = await this.dataSource.transaction(async (manager) => {
      const dteRepo = manager.getRepository(Dte);
      const existente = await dteRepo.findOne({ where: { idDte: datosGenerales.idDte } });
      if (existente) {
        throw new ErrorDominio('ERR-DTE-409', `ID-DTE ya registrado: ${datosGenerales.idDte}`);
      }

      const dte = await dteRepo.save(
        dteRepo.create({
          idDte: datosGenerales.idDte,
          idDatosGenerales: datosGenerales.idDatosGenerales,
          versionPerfil: '1.0',
          codigoTipoDte: datosGenerales.codigoTipoDte,
          descripcionTipoDte: datosGenerales.descripcionTipoDte,
          numeroDte: String(datosGenerales.numeroDte),
          fechaEmision: datosGenerales.fechaEmision,
          fechaVencimiento: datosGenerales.fechaVencimiento,
          monedaCodigo: datosGenerales.codigoMoneda,
          monto: String(datosGenerales.monto),
          montoLetras: estado.montoLetras,
          textoPromesaPago: parseo.datosGenerales.textoPromesaPago ?? '',
          enlaceQr: datosGenerales.enlaceQr,
          estadoActual: CODIGO_ESTADO_EMITIDO,
          saldoPendiente: String(datosGenerales.monto),
          versionVigente: 1,
          hashVigente,
          emisionDireccion: datosGenerales.lugarEmision.direccion,
          emisionNumeroCasa: datosGenerales.lugarEmision.numeroCasa ?? null,
          emisionCiudadCodigo: datosGenerales.lugarEmision.codigoCiudad,
          emisionDistritoCodigo: datosGenerales.lugarEmision.codigoDistrito,
          emisionDepartamentoCodigo: datosGenerales.lugarEmision.codigoDepartamento,
          emisionPaisCodigo: datosGenerales.lugarEmision.codigoPais,
          creadoPor: usuarioId,
        }),
      );

      const lugarPagoRepo = manager.getRepository(DteLugarPago);
      await lugarPagoRepo.save(
        datosGenerales.lugaresPago.map((l, i) =>
          lugarPagoRepo.create({
            dteId: dte.id,
            orden: i + 1,
            direccion: l.direccion,
            numeroCasa: l.numeroCasa ?? null,
            ciudadCodigo: l.codigoCiudad,
            distritoCodigo: l.codigoDistrito,
            departamentoCodigo: l.codigoDepartamento,
            paisCodigo: l.codigoPais,
          }),
        ),
      );

      const condicionRepo = manager.getRepository(DteCondicion);
      await condicionRepo.save(
        datosGenerales.condiciones.map((descripcion, i) =>
          condicionRepo.create({ dteId: dte.id, orden: i + 1, descripcion }),
        ),
      );

      const parteRepo = manager.getRepository(DteParte);
      const partes: Array<{ personaId: string; rolParte: RolParte; condicionFirmante: string | null; orden: number }> = [
        { personaId: estado.acreedorInicialPersonaId, rolParte: 'ACREEDOR_INICIAL', condicionFirmante: null, orden: 1 },
        ...estado.deudores.map((d, i) => ({
          personaId: d.personaId,
          rolParte: 'DEUDOR' as const,
          condicionFirmante: d.condicionFirmante,
          orden: i + 1,
        })),
        ...estado.codeudores.map((d, i) => ({
          personaId: d.personaId,
          rolParte: 'CODEUDOR' as const,
          condicionFirmante: d.condicionFirmante,
          orden: i + 1,
        })),
      ];
      await parteRepo.save(partes.map((p) => parteRepo.create({ dteId: dte.id, ...p })));

      await manager.getRepository(DteTenencia).save(
        manager.getRepository(DteTenencia).create({
          dteId: dte.id,
          personaId: estado.acreedorInicialPersonaId,
          origen: 'EMISION',
          eventoId: null,
          desde: new Date(),
        }),
      );

      const xmlBytes = Buffer.byteLength(xmlFinal, 'utf8');
      await manager.getRepository(DteXmlVersion).save(
        manager.getRepository(DteXmlVersion).create({
          dteId: dte.id,
          version: 1,
          eventoId: null,
          hashSha256: hashVigente,
          tamanoBytes: String(xmlBytes),
          almacenamiento: 'DB',
          contenidoXml: xmlFinal,
        }),
      );

      const certificadoRepo = manager.getRepository(Certificado);
      const firmaRepo = manager.getRepository(Firma);
      const rolesPorFirma = [...estado.firmasPartes.map((f) => f.rolFirmante), 'PSDTE'];
      const personaIdPorFirma = [...estado.firmasPartes.map((f) => f.personaId), null];
      for (let i = 0; i < nodosFirma.length; i += 1) {
        const detalle = extraerDetalleFirma(nodosFirma[i]);
        const certificado = await certificadoRepo.save(
          certificadoRepo.create({
            numeroSerie: detalle.x509.serialNumber,
            subjectDn: detalle.x509.subject,
            issuerDn: detalle.x509.issuer,
            tipo: rolesPorFirma[i] === 'PSDTE' ? 'SELLO_PSDTE' : 'FIRMA_CUALIFICADA',
            personaId: personaIdPorFirma[i],
            validoDesde: new Date(detalle.x509.validFrom),
            validoHasta: new Date(detalle.x509.validTo),
            certificadoDer: detalle.certificadoDer,
            enTsl: true,
          }),
        );
        await firmaRepo.save(
          firmaRepo.create({
            dteId: dte.id,
            eventoId: null,
            xmlSignatureId: detalle.xmlSignatureId,
            ambito: 'DATOS_GENERALES',
            rolFirmante: rolesPorFirma[i],
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

      await manager.getRepository(Evidencia).save(
        manager.getRepository(Evidencia).create({
          dteId: dte.id,
          eventoId: null,
          tipoCodigo: CODIGO_EVIDENCIA_XML_FIRMADO,
          hashSha256: hashVigente,
          metadatos: { version: 1 },
        }),
      );

      await manager.getRepository(Notificacion).save(
        manager.getRepository(Notificacion).create({
          tipoCodigo: CODIGO_NOTIFICACION_EMISION_CONFIRMADA,
          dteId: dte.id,
          eventoId: null,
          destinatarioPersonaId: estado.acreedorInicialPersonaId,
          destino: (await this.obtenerPersona(estado.acreedorInicialPersonaId)).email ?? 'sin-email@psdte.local',
          asunto: `Pagaré ${datosGenerales.idDte} emitido`,
          cuerpo: `El pagaré ${datosGenerales.idDte} fue emitido y registrado.`,
          estado: 'PENDIENTE',
        }),
      );

      const idsSolicitudFirma = estado.firmasPartes.map((f) => f.solicitudFirmaId);
      if (idsSolicitudFirma.length > 0) {
        await manager
          .getRepository(SolicitudFirma)
          .createQueryBuilder()
          .update()
          .set({ dteId: dte.id })
          .whereInIds(idsSolicitudFirma)
          .execute();
      }

      return dte;
    });

    await this.auditoriaService.registrar({
      accion: 'DTE_EMITIDO',
      entidad: 'dte',
      entidadId: dteCreado.id,
      usuarioId,
      detalle: { idDte: dteCreado.idDte, monto: dteCreado.monto },
    });

    await this.store.eliminar(idDatosGenerales);
    return { dteId: dteCreado.id, idDte: dteCreado.idDte, estadoActual: dteCreado.estadoActual };
  }

  private rutaXsd(): string {
    return this.configService.get('XSD_PATH', { infer: true });
  }

  private async obtenerPersona(personaId: string): Promise<Persona> {
    return this.personaRepo.findOneOrFail({ where: { id: personaId } });
  }

  private async resolverDocumentoIdentidad(persona: Persona): Promise<DocumentoIdentidadInput> {
    const [tipoDocumento, pais] = await Promise.all([
      this.tipoDocumentoRepo.findOneOrFail({ where: { codigo: persona.tipoDocumento } }),
      this.paisRepo.findOneOrFail({ where: { codigo: persona.paisDocumento } }),
    ]);
    return {
      codigoTipo: persona.tipoDocumento,
      tipo: tipoDocumento.sigla,
      numero: persona.numeroDocumento,
      codigoPais: persona.paisDocumento,
      pais: pais.nombre,
    };
  }

  private async resolverDireccionDesdeCodigos(dto: DireccionDto): Promise<DireccionInput> {
    const [ciudad, distrito, departamento, pais] = await Promise.all([
      this.ciudadRepo.findOneOrFail({ where: { codigo: dto.codigoCiudad } }),
      this.distritoRepo.findOneOrFail({ where: { codigo: dto.codigoDistrito } }),
      this.departamentoRepo.findOneOrFail({ where: { codigo: dto.codigoDepartamento } }),
      this.paisRepo.findOneOrFail({ where: { codigo: dto.codigoPais } }),
    ]);
    return {
      direccion: dto.direccion,
      numeroCasa: dto.numeroCasa,
      codigoCiudad: dto.codigoCiudad,
      ciudad: ciudad.nombre,
      codigoDistrito: dto.codigoDistrito,
      distrito: distrito.nombre,
      codigoDepartamento: dto.codigoDepartamento,
      departamento: departamento.nombre,
      codigoPais: dto.codigoPais,
      pais: pais.nombre,
    };
  }

  private async resolverDireccionPersona(personaId: string): Promise<DireccionInput> {
    const direccion = await this.personaDireccionRepo.findOne({ where: { personaId, principal: true } });
    if (!direccion || direccion.ciudadCodigo === null || direccion.distritoCodigo === null ||
        direccion.departamentoCodigo === null || direccion.paisCodigo === null) {
      throw new ErrorDominio('ERR-SEM-002', `La persona ${personaId} no tiene una dirección principal completa registrada`);
    }
    return this.resolverDireccionDesdeCodigos({
      direccion: direccion.direccion,
      numeroCasa: direccion.numeroCasa ?? undefined,
      codigoCiudad: direccion.ciudadCodigo,
      codigoDistrito: direccion.distritoCodigo,
      codigoDepartamento: direccion.departamentoCodigo,
      codigoPais: direccion.paisCodigo,
    });
  }

  private async resolverAcreedorInicial(persona: Persona): Promise<AcreedorInicialInput> {
    if (persona.tipoPersona !== 1) {
      throw new ErrorDominio('ERR-SEM-002', 'Solo se admite persona física (tipoPersona=1) como acreedor inicial');
    }
    return {
      nombresApellidos: persona.nombresApellidos ?? '',
      documento: await this.resolverDocumentoIdentidad(persona),
      email: persona.email ?? undefined,
      telefono: persona.telefono ?? undefined,
      direcciones: [await this.resolverDireccionPersona(persona.id)],
    };
  }

  private async resolverDeudor(persona: Persona, condicionFirmante: string): Promise<DeudorInput & CoDeudorInput> {
    if (persona.tipoPersona !== 1) {
      throw new ErrorDominio('ERR-SEM-002', `Solo se admite persona física (tipoPersona=1): ${persona.id}`);
    }
    return {
      condicionFirmante,
      nombresApellidos: persona.nombresApellidos ?? '',
      documento: await this.resolverDocumentoIdentidad(persona),
      email: persona.email ?? undefined,
      telefono: persona.telefono ?? undefined,
      direccion: await this.resolverDireccionPersona(persona.id),
    };
  }

  private async resolverPrestadorServicio() {
    const parametro = await this.parametrosRepo.findOneOrFail({ where: { clave: 'psdte.datos' } });
    const valor = parametro.valor as {
      nombre: string;
      nombre_fantasia: string;
      ruc: string;
      resolucion_mic: string;
      telefono: string;
      email: string;
      sitio_web: string;
    };
    return {
      nombre: valor.nombre,
      nombreFantasia: valor.nombre_fantasia,
      ruc: valor.ruc,
      resolucionMic: valor.resolucion_mic,
      telefono: valor.telefono,
      email: valor.email,
      sitioWeb: valor.sitio_web,
    };
  }

  private async resolverEnlaceQr(idDte: string): Promise<string> {
    const parametro = await this.parametrosRepo.findOne({ where: { clave: 'verificacion.base_url' } });
    const base = (parametro?.valor as string | undefined) ?? 'http://localhost:3000/verificar';
    return `${base}?codigo=${idDte}`;
  }
}

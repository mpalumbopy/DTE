import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { connect } from 'net';
import { ErrorDominio } from '@psdte/shared';
import {
  ConfigAuth,
  ConfigIntegracionResuelta,
  PruebaConexionResultado,
  crearProveedorFirma,
  crearProveedorRevocacion,
  crearProveedorTsa,
} from '@psdte/crypto-providers';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Usuario } from '../../entities/usuario.entity';
import { IntegracionWs, TipoIntegracionWs } from '../../entities/integracion-ws.entity';
import { IntegracionWsHistorial } from '../../entities/integracion-ws-historial.entity';
import { PkiSimuladaService } from './pki-simulada.service';
import { ProviderFactoryService } from './provider-factory.service';
import { ConfigurarIntegracionDto, CredencialesIntegracionDto } from './dto/configurar-integracion.dto';

const VENTANA_TEST_VALIDO_MS = 15 * 60_000;

export interface IntegracionSerializada {
  id: string;
  tipo: TipoIntegracionWs;
  nombre: string;
  modo: string;
  baseUrl: string | null;
  endpoints: Record<string, string>;
  authTipo: string;
  credencialesEnmascaradas: string | null;
  headersExtra: Record<string, string>;
  timeoutMs: number;
  reintentos: number;
  backoffMs: number;
  mapeoPayload: Record<string, unknown>;
  verificarTls: boolean;
  activo: boolean;
  ultimoTest: Record<string, unknown> | null;
  actualizadoPor: string | null;
  actualizadoEn: Date;
}

/**
 * Servicio de administración de `integracion_ws` (docs/PLAN.md sección 6.5, requisito explícito
 * del usuario). Nunca expone credenciales en claro fuera de este archivo (se cifran al escribir,
 * se enmascaran al leer) y nunca crea adaptadores directamente: siempre construye
 * `ConfigIntegracionResuelta` y delega en las mismas fábricas de `@psdte/crypto-providers` que usa
 * `ProviderFactoryService` en producción, para que "probar conexión" pruebe exactamente lo que se
 * usará al operar.
 */
@Injectable()
export class IntegracionesAdminService {
  constructor(
    @InjectRepository(IntegracionWs) private readonly integracionRepo: Repository<IntegracionWs>,
    @InjectRepository(IntegracionWsHistorial) private readonly historialRepo: Repository<IntegracionWsHistorial>,
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
    private readonly aesGcm: AesGcmService,
    private readonly pkiSimulada: PkiSimuladaService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async listar(): Promise<IntegracionSerializada[]> {
    const filas = await this.integracionRepo.find({ order: { tipo: 'ASC', nombre: 'ASC' } });
    return filas.map((f) => this.serializar(f));
  }

  async obtener(id: string): Promise<IntegracionSerializada> {
    const fila = await this.integracionRepo.findOneOrFail({ where: { id } });
    return this.serializar(fila);
  }

  /** Estado global para el banner "MODO SIMULADOR" (sección 6.5/10). */
  async estadoGlobal() {
    return this.providerFactory.estadoSimuladorCritico();
  }

  async historial(id: string): Promise<IntegracionWsHistorial[]> {
    return this.historialRepo.find({ where: { integracionId: id }, order: { ocurridoEn: 'DESC' } });
  }

  async actualizar(id: string, dto: ConfigurarIntegracionDto, usuarioId: string): Promise<IntegracionSerializada> {
    const fila = await this.integracionRepo.findOneOrFail({ where: { id } });
    const modoAnterior = fila.modo;

    // El pasaje A REAL solo puede ocurrir a través de POST /:id/conmutar (exige test previo +
    // contraseña — sección 6.5): permitirlo aquí también dejaría ese candado sin efecto.
    if (dto.modo === 'REAL' && modoAnterior !== 'REAL') {
      throw new ErrorDominio('ERR-ESTADO-001', 'Conmutar a REAL requiere POST /:id/conmutar (test previo + contraseña)');
    }

    fila.modo = dto.modo;
    fila.baseUrl = dto.baseUrl ?? null;
    fila.endpoints = dto.endpoints;
    fila.authTipo = dto.authTipo;
    fila.headersExtra = dto.headersExtra;
    fila.timeoutMs = dto.timeoutMs;
    fila.reintentos = dto.reintentos;
    fila.backoffMs = dto.backoffMs;
    fila.mapeoPayload = dto.mapeoPayload;
    fila.verificarTls = dto.verificarTls;
    fila.actualizadoPor = usuarioId;

    if (dto.credenciales) {
      this.aplicarCredenciales(fila, dto.authTipo, dto.credenciales);
    }

    // "persiste en ultimo_test al guardar" (sección 6.5): cada guardado revalida contra la config
    // recién escrita, así ultimo_test nunca refleja una prueba obsoleta.
    const configGuardada = this.resolverConfigDesdeFila(fila);
    const resultadoPrueba = await this.ejecutarPrueba(fila.tipo, configGuardada);
    fila.ultimoTest = { ...resultadoPrueba, fecha: new Date().toISOString() } as unknown as Record<string, unknown>;

    const guardada = await this.integracionRepo.save(fila);
    this.providerFactory.invalidarCache(fila.tipo);

    await this.historialRepo.save(
      this.historialRepo.create({
        integracionId: id,
        cambio: {
          accion: 'ACTUALIZAR',
          modoAnterior,
          modoNuevo: dto.modo,
          credencialesRotadas: Boolean(dto.credenciales),
        },
        usuarioId,
      }),
    );
    await this.auditoriaService.registrar({
      accion: 'INTEGRACION_ACTUALIZADA',
      entidad: 'integracion_ws',
      entidadId: id,
      usuarioId,
      detalle: { tipo: fila.tipo, modoAnterior, modoNuevo: dto.modo },
    });

    return this.serializar(guardada);
  }

  /** Prueba la conexión con la config DEL FORMULARIO (sin guardar) — sección 6.5. */
  async probarConexionFormulario(id: string, dto: ConfigurarIntegracionDto): Promise<PruebaConexionResultado> {
    const fila = await this.integracionRepo.findOneOrFail({ where: { id } });
    const config = this.resolverConfigDesdeDto(fila, dto);
    return this.ejecutarPrueba(fila.tipo, config);
  }

  /** Prueba la conexión con la config YA GUARDADA (para refrescar `ultimo_test` sin editar). */
  async probarConexionGuardada(id: string): Promise<PruebaConexionResultado> {
    const fila = await this.integracionRepo.findOneOrFail({ where: { id } });
    const config = this.resolverConfigDesdeFila(fila);
    const resultado = await this.ejecutarPrueba(fila.tipo, config);
    fila.ultimoTest = { ...resultado, fecha: new Date().toISOString() } as unknown as Record<string, unknown>;
    await this.integracionRepo.save(fila);
    return resultado;
  }

  /**
   * Conmutación de modo (sección 6.5): pasar a REAL exige un test exitoso reciente (≤ 15 min) Y
   * re-ingreso de contraseña del admin — MFA verificada ya la exige `@RequiereMfa` en el
   * controller. Volver a SIMULADOR/DESHABILITADO no tiene esas exigencias (es la opción segura).
   */
  async conmutar(id: string, modoDestino: 'SIMULADOR' | 'REAL' | 'DESHABILITADO', passwordAdmin: string | undefined, usuarioId: string): Promise<IntegracionSerializada> {
    const fila = await this.integracionRepo.findOneOrFail({ where: { id } });
    const modoAnterior = fila.modo;

    if (modoDestino === 'REAL') {
      const ultimoTest = fila.ultimoTest as { ok?: boolean; fecha?: string } | null;
      const testVigente =
        ultimoTest?.ok === true && ultimoTest.fecha && Date.now() - new Date(ultimoTest.fecha).getTime() <= VENTANA_TEST_VALIDO_MS;
      if (!testVigente) {
        throw new ErrorDominio('ERR-ESTADO-001', 'Conmutar a REAL exige una prueba de conexión exitosa en los últimos 15 minutos');
      }
      if (!passwordAdmin) {
        throw new ErrorDominio('ERR-AUTH-001', 'Se requiere re-ingresar la contraseña para conmutar a REAL');
      }
      const usuario = await this.usuarioRepo.findOneOrFail({ where: { id: usuarioId } });
      const passwordValida = usuario.passwordHash ? await argon2.verify(usuario.passwordHash, passwordAdmin) : false;
      if (!passwordValida) {
        throw new ErrorDominio('ERR-AUTH-001', 'Contraseña incorrecta');
      }
    }

    fila.modo = modoDestino;
    fila.actualizadoPor = usuarioId;
    const guardada = await this.integracionRepo.save(fila);
    this.providerFactory.invalidarCache(fila.tipo);

    await this.historialRepo.save(
      this.historialRepo.create({
        integracionId: id,
        cambio: { accion: 'CONMUTAR', modoAnterior, modoNuevo: modoDestino },
        usuarioId,
      }),
    );
    await this.auditoriaService.registrar({
      accion: 'INTEGRACION_CONMUTADA',
      entidad: 'integracion_ws',
      entidadId: id,
      usuarioId,
      detalle: { tipo: fila.tipo, modoAnterior, modoNuevo: modoDestino },
    });

    return this.serializar(guardada);
  }

  private async ejecutarPrueba(tipo: TipoIntegracionWs, config: ConfigIntegracionResuelta): Promise<PruebaConexionResultado> {
    switch (tipo) {
      case 'FIRMA': {
        const [autoridad, tsaProvider] = await Promise.all([this.pkiSimulada.obtenerAutoridad(), this.providerFactory.obtenerProveedorTsa()]);
        return crearProveedorFirma(config, autoridad, tsaProvider).probarConexion();
      }
      case 'TSA': {
        const autoridad = await this.pkiSimulada.obtenerAutoridad();
        return crearProveedorTsa(config, autoridad).probarConexion();
      }
      case 'OCSP':
      case 'CRL':
      case 'TSL':
        return crearProveedorRevocacion(config).probarConexion();
      case 'NOTIF_EMAIL':
        return this.probarConexionSmtp(config.baseUrl);
      default:
        return { ok: false, latenciaMs: 0, detalle: `Tipo de integración desconocido: ${tipo}` };
    }
  }

  private async probarConexionSmtp(baseUrl: string | undefined): Promise<PruebaConexionResultado> {
    if (!baseUrl) {
      return { ok: false, latenciaMs: 0, detalle: 'Falta base_url (smtp://host:puerto)' };
    }
    const inicio = Date.now();
    try {
      const url = new URL(baseUrl);
      const host = url.hostname;
      const puerto = Number(url.port) || 25;
      await new Promise<void>((resolve, reject) => {
        const socket = connect({ host, port: puerto, timeout: 5000 });
        socket.once('connect', () => {
          socket.end();
          resolve();
        });
        socket.once('timeout', () => {
          socket.destroy();
          reject(new Error('timeout'));
        });
        socket.once('error', reject);
      });
      return { ok: true, latenciaMs: Date.now() - inicio, detalle: `Conectado a ${host}:${puerto}` };
    } catch (err) {
      return { ok: false, latenciaMs: Date.now() - inicio, detalle: err instanceof Error ? err.message : String(err) };
    }
  }

  private resolverConfigDesdeFila(fila: IntegracionWs): ConfigIntegracionResuelta {
    return {
      nombre: fila.nombre,
      modo: fila.modo,
      baseUrl: fila.baseUrl ?? undefined,
      endpoints: fila.endpoints,
      auth: this.resolverAuthDesdeFila(fila),
      headersExtra: fila.headersExtra,
      timeoutMs: fila.timeoutMs,
      reintentos: fila.reintentos,
      backoffMs: fila.backoffMs,
      mapeoPayload: fila.mapeoPayload as ConfigIntegracionResuelta['mapeoPayload'],
      verificarTls: fila.verificarTls,
    };
  }

  private resolverConfigDesdeDto(fila: IntegracionWs, dto: ConfigurarIntegracionDto): ConfigIntegracionResuelta {
    return {
      nombre: fila.nombre,
      modo: dto.modo,
      baseUrl: dto.baseUrl,
      endpoints: dto.endpoints,
      auth: this.resolverAuthDesdeDto(fila, dto),
      headersExtra: dto.headersExtra,
      timeoutMs: dto.timeoutMs,
      reintentos: dto.reintentos,
      backoffMs: dto.backoffMs,
      mapeoPayload: dto.mapeoPayload as ConfigIntegracionResuelta['mapeoPayload'],
      verificarTls: dto.verificarTls,
    };
  }

  /** Si el formulario no envió credenciales nuevas (probar sin rotar), usa las ya guardadas. */
  private resolverAuthDesdeDto(fila: IntegracionWs, dto: ConfigurarIntegracionDto): ConfigAuth {
    if (dto.credenciales) {
      return this.credencialesATransito(dto.authTipo, dto.credenciales);
    }
    if (dto.authTipo === fila.authTipo) {
      return this.resolverAuthDesdeFila(fila);
    }
    return { tipo: 'NONE' };
  }

  private credencialesATransito(authTipo: ConfigurarIntegracionDto['authTipo'], c: CredencialesIntegracionDto): ConfigAuth {
    switch (authTipo) {
      case 'BASIC':
        return { tipo: 'BASIC', usuario: c.usuario ?? '', clave: c.clave ?? '' };
      case 'BEARER':
        return { tipo: 'BEARER', token: c.token ?? '' };
      case 'API_KEY':
        return { tipo: 'API_KEY', apiKeyHeader: c.apiKeyHeader ?? '', apiKeyValor: c.apiKeyValor ?? '' };
      case 'MTLS':
        return { tipo: 'MTLS', mtlsCertPem: c.mtlsCertPem, mtlsKeyPem: c.mtlsKeyPem };
      case 'NONE':
      default:
        return { tipo: 'NONE' };
    }
  }

  private aplicarCredenciales(fila: IntegracionWs, authTipo: ConfigurarIntegracionDto['authTipo'], c: CredencialesIntegracionDto): void {
    switch (authTipo) {
      case 'BASIC':
        fila.credencialesCifradas = this.aesGcm.cifrar(JSON.stringify({ usuario: c.usuario ?? '', clave: c.clave ?? '' }));
        break;
      case 'BEARER':
        fila.credencialesCifradas = this.aesGcm.cifrar(JSON.stringify({ token: c.token ?? '' }));
        break;
      case 'API_KEY':
        fila.credencialesCifradas = this.aesGcm.cifrar(
          JSON.stringify({ apiKeyHeader: c.apiKeyHeader ?? '', apiKeyValor: c.apiKeyValor ?? '' }),
        );
        break;
      case 'MTLS':
        fila.mtlsCertCifrado = c.mtlsCertPem ? this.aesGcm.cifrar(c.mtlsCertPem) : null;
        fila.mtlsKeyCifrada = c.mtlsKeyPem ? this.aesGcm.cifrar(c.mtlsKeyPem) : null;
        break;
      case 'NONE':
      default:
        fila.credencialesCifradas = null;
        break;
    }
  }

  private resolverAuthDesdeFila(fila: IntegracionWs): ConfigAuth {
    switch (fila.authTipo) {
      case 'BASIC': {
        const { usuario, clave } = this.descifrarJson<{ usuario: string; clave: string }>(fila.credencialesCifradas);
        return { tipo: 'BASIC', usuario, clave };
      }
      case 'BEARER': {
        const { token } = this.descifrarJson<{ token: string }>(fila.credencialesCifradas);
        return { tipo: 'BEARER', token };
      }
      case 'API_KEY': {
        const { apiKeyHeader, apiKeyValor } = this.descifrarJson<{ apiKeyHeader: string; apiKeyValor: string }>(
          fila.credencialesCifradas,
        );
        return { tipo: 'API_KEY', apiKeyHeader, apiKeyValor };
      }
      case 'MTLS':
        return {
          tipo: 'MTLS',
          mtlsCertPem: fila.mtlsCertCifrado ? this.aesGcm.descifrar(fila.mtlsCertCifrado) : undefined,
          mtlsKeyPem: fila.mtlsKeyCifrada ? this.aesGcm.descifrar(fila.mtlsKeyCifrada) : undefined,
        };
      case 'NONE':
      default:
        return { tipo: 'NONE' };
    }
  }

  private descifrarJson<T>(valorCifrado: string | null): T {
    if (!valorCifrado) return {} as T;
    return JSON.parse(this.aesGcm.descifrar(valorCifrado)) as T;
  }

  private serializar(fila: IntegracionWs): IntegracionSerializada {
    return {
      id: fila.id,
      tipo: fila.tipo,
      nombre: fila.nombre,
      modo: fila.modo,
      baseUrl: fila.baseUrl,
      endpoints: fila.endpoints,
      authTipo: fila.authTipo,
      credencialesEnmascaradas: fila.authTipo !== 'NONE' ? '********' : null,
      headersExtra: fila.headersExtra,
      timeoutMs: fila.timeoutMs,
      reintentos: fila.reintentos,
      backoffMs: fila.backoffMs,
      mapeoPayload: fila.mapeoPayload,
      verificarTls: fila.verificarTls,
      activo: fila.activo,
      ultimoTest: fila.ultimoTest,
      actualizadoPor: fila.actualizadoPor,
      actualizadoEn: fila.actualizadoEn,
    };
  }
}

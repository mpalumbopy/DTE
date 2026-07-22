import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { randomBytes, randomUUID, createHash } from 'crypto';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { ErrorDominio } from '@psdte/shared';
import { Usuario } from '../../entities/usuario.entity';
import { Sesion } from '../../entities/sesion.entity';
import { UsuarioRol } from '../../entities/usuario-rol.entity';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { LoginDto } from './dto/login.dto';
import { esRolCritico } from './roles-criticos.constant';

const ACCESS_TOKEN_TTL = '15m';
const MFA_PENDING_TTL = '5m';
const REFRESH_TTL_MS = 8 * 60 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface RequerimientoMfa {
  requiereMfa: true;
  mfaPendingToken: string;
}

export interface SesionEmitida {
  requiereMfa: false;
  accessToken: string;
  refreshToken: string;
  refreshExpiraEn: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Sesion) private readonly sesiones: Repository<Sesion>,
    @InjectRepository(UsuarioRol) private readonly usuarioRoles: Repository<UsuarioRol>,
    private readonly jwtService: JwtService,
    private readonly aesGcmService: AesGcmService,
  ) {}

  private async obtenerRoles(usuarioId: string): Promise<string[]> {
    const filas = await this.usuarioRoles.find({ where: { usuarioId } });
    return filas.map((fila) => fila.rolCodigo);
  }

  private hashRefresh(tokenPlano: string): string {
    return createHash('sha256').update(tokenPlano).digest('hex');
  }

  async login(
    dto: LoginDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<RequerimientoMfa | SesionEmitida> {
    const usuario = await this.usuarios.findOne({ where: { username: dto.username } });
    if (!usuario || !usuario.activo || !usuario.passwordHash) {
      throw new ErrorDominio('ERR-AUTH-001', 'Credenciales inválidas');
    }
    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
      throw new ErrorDominio('ERR-AUTH-005', 'Usuario bloqueado por intentos fallidos');
    }

    const passwordValida = await argon2.verify(usuario.passwordHash, dto.password);
    if (!passwordValida) {
      usuario.intentosFallidos += 1;
      if (usuario.intentosFallidos >= LOCKOUT_THRESHOLD) {
        usuario.bloqueadoHasta = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }
      await this.usuarios.save(usuario);
      throw new ErrorDominio('ERR-AUTH-001', 'Credenciales inválidas');
    }

    if (usuario.intentosFallidos > 0 || usuario.bloqueadoHasta) {
      usuario.intentosFallidos = 0;
      usuario.bloqueadoHasta = null;
      await this.usuarios.save(usuario);
    }

    const roles = await this.obtenerRoles(usuario.id);
    const mfaRequerida = roles.some(esRolCritico);

    if (mfaRequerida) {
      const mfaPendingToken = this.jwtService.sign(
        { sub: usuario.id, tipo: 'mfa_pendiente' },
        { expiresIn: MFA_PENDING_TTL },
      );
      return { requiereMfa: true, mfaPendingToken };
    }

    const { sesionId, ...resto } = await this.emitirSesion(usuario.id, roles, false, ip, userAgent);
    void sesionId;
    return { requiereMfa: false, ...resto };
  }

  async verificarMfa(
    mfaPendingToken: string,
    codigo: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<SesionEmitida> {
    let payload: { sub: string; tipo: string };
    try {
      payload = this.jwtService.verify(mfaPendingToken);
    } catch {
      throw new ErrorDominio('ERR-AUTH-002', 'Sesión inválida, expirada o revocada');
    }
    if (payload.tipo !== 'mfa_pendiente') {
      throw new ErrorDominio('ERR-AUTH-002', 'Sesión inválida, expirada o revocada');
    }

    const usuario = await this.usuarios.findOne({ where: { id: payload.sub } });
    if (!usuario || !usuario.mfaSecretoCifrado) {
      throw new ErrorDominio('ERR-AUTH-003', 'MFA no enrolada para este usuario');
    }

    const secreto = this.aesGcmService.descifrar(usuario.mfaSecretoCifrado);
    const valido = authenticator.check(codigo, secreto);
    if (!valido) {
      throw new ErrorDominio('ERR-AUTH-003', 'Código MFA inválido');
    }

    const roles = await this.obtenerRoles(usuario.id);
    const { sesionId, ...resto } = await this.emitirSesion(usuario.id, roles, true, ip, userAgent);
    void sesionId;
    return { requiereMfa: false, ...resto };
  }

  private async emitirSesion(
    usuarioId: string,
    roles: string[],
    mfaVerificada: boolean,
    ip: string | null,
    userAgent: string | null,
    familiaId?: string,
  ): Promise<{ sesionId: string; accessToken: string; refreshToken: string; refreshExpiraEn: Date }> {
    const refreshTokenPlano = randomBytes(32).toString('hex');
    const sesion = this.sesiones.create({
      usuarioId,
      tokenHash: this.hashRefresh(refreshTokenPlano),
      ip,
      userAgent,
      mfaVerificada,
      expiraEn: new Date(Date.now() + REFRESH_TTL_MS),
      familiaId: familiaId ?? randomUUID(),
      revocadaEn: null,
      reemplazadaPorId: null,
    });
    await this.sesiones.save(sesion);

    const accessToken = this.jwtService.sign(
      { sub: usuarioId, roles, sesionId: sesion.id, mfaVerificada },
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    return { sesionId: sesion.id, accessToken, refreshToken: refreshTokenPlano, refreshExpiraEn: sesion.expiraEn };
  }

  async refrescar(refreshTokenPlano: string, ip: string | null, userAgent: string | null): Promise<SesionEmitida> {
    const tokenHash = this.hashRefresh(refreshTokenPlano);
    const sesionActual = await this.sesiones.findOne({ where: { tokenHash } });

    if (!sesionActual) {
      throw new ErrorDominio('ERR-AUTH-002', 'Sesión inválida, expirada o revocada');
    }

    if (sesionActual.revocadaEn || sesionActual.reemplazadaPorId) {
      // Reuso de un refresh ya rotado/revocado: se revoca toda la familia (ADR-007).
      await this.sesiones.update({ familiaId: sesionActual.familiaId }, { revocadaEn: new Date() });
      throw new ErrorDominio('ERR-AUTH-002', 'Sesión inválida, expirada o revocada');
    }

    if (sesionActual.expiraEn.getTime() < Date.now()) {
      throw new ErrorDominio('ERR-AUTH-002', 'Sesión inválida, expirada o revocada');
    }

    const roles = await this.obtenerRoles(sesionActual.usuarioId);
    const { sesionId, ...resto } = await this.emitirSesion(
      sesionActual.usuarioId,
      roles,
      sesionActual.mfaVerificada,
      ip,
      userAgent,
      sesionActual.familiaId,
    );

    sesionActual.reemplazadaPorId = sesionId;
    sesionActual.revocadaEn = new Date();
    await this.sesiones.save(sesionActual);

    return { requiereMfa: false, ...resto };
  }

  async logout(refreshTokenPlano: string): Promise<void> {
    const tokenHash = this.hashRefresh(refreshTokenPlano);
    const sesionActual = await this.sesiones.findOne({ where: { tokenHash } });
    if (sesionActual && !sesionActual.revocadaEn) {
      sesionActual.revocadaEn = new Date();
      await this.sesiones.save(sesionActual);
    }
  }

  async enrolarMfa(usuarioId: string): Promise<{ secreto: string; otpauthUrl: string; qrDataUrl: string }> {
    const usuario = await this.usuarios.findOneOrFail({ where: { id: usuarioId } });
    const secreto = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(usuario.email, 'PSDTE', secreto);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    usuario.mfaSecretoCifrado = this.aesGcmService.cifrar(secreto);
    usuario.mfaHabilitado = true;
    await this.usuarios.save(usuario);

    return { secreto, otpauthUrl, qrDataUrl };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { ErrorDominio } from '@psdte/shared';
import { Usuario } from '../../entities/usuario.entity';
import { UsuarioRol } from '../../entities/usuario-rol.entity';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarRolesDto } from './dto/actualizar-roles.dto';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export interface UsuarioConRoles {
  id: string;
  username: string;
  email: string;
  activo: boolean;
  mfaHabilitado: boolean;
  roles: string[];
  creadoEn: Date;
}

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioRol) private readonly usuarioRoles: Repository<UsuarioRol>,
  ) {}

  private async conRoles(usuario: Usuario): Promise<UsuarioConRoles> {
    const roles = await this.usuarioRoles.find({ where: { usuarioId: usuario.id } });
    return {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      activo: usuario.activo,
      mfaHabilitado: usuario.mfaHabilitado,
      roles: roles.map((r) => r.rolCodigo),
      creadoEn: usuario.creadoEn,
    };
  }

  async listar(): Promise<UsuarioConRoles[]> {
    const filas = await this.usuarios.find({ order: { creadoEn: 'ASC' } });
    return Promise.all(filas.map((f) => this.conRoles(f)));
  }

  async obtener(id: string): Promise<UsuarioConRoles> {
    const usuario = await this.usuarios.findOne({ where: { id } });
    if (!usuario) {
      throw new ErrorDominio('ERR-DTE-404', 'Usuario inexistente');
    }
    return this.conRoles(usuario);
  }

  async crear(dto: CrearUsuarioDto): Promise<UsuarioConRoles> {
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);
    const usuario = this.usuarios.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
    });
    await this.usuarios.save(usuario);

    await this.usuarioRoles.save(
      dto.roles.map((rolCodigo) => this.usuarioRoles.create({ usuarioId: usuario.id, rolCodigo })),
    );

    return this.conRoles(usuario);
  }

  async actualizarRoles(id: string, dto: ActualizarRolesDto, otorgadoPor: string): Promise<UsuarioConRoles> {
    const usuario = await this.usuarios.findOne({ where: { id } });
    if (!usuario) {
      throw new ErrorDominio('ERR-DTE-404', 'Usuario inexistente');
    }
    await this.usuarioRoles.delete({ usuarioId: id });
    await this.usuarioRoles.save(
      dto.roles.map((rolCodigo) => this.usuarioRoles.create({ usuarioId: id, rolCodigo, otorgadoPor })),
    );
    return this.conRoles(usuario);
  }
}

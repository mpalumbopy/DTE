import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { Usuario } from '../../entities/usuario.entity';
import { Sesion } from '../../entities/sesion.entity';
import { UsuarioRol } from '../../entities/usuario-rol.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// JwtModule se registra globalmente en AppModule (RS256, ver config/config.schema.ts).
@Module({
  imports: [TypeOrmModule.forFeature([Usuario, Sesion, UsuarioRol])],
  controllers: [AuthController],
  providers: [AuthService, AesGcmService],
})
export class AuthModule {}

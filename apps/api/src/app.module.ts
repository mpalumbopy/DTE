import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from './config/config.module';
import { LoggerModule } from './common/logging/logger.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { SaludModule } from './modules/salud/salud.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { CatalogosModule } from './modules/catalogos/catalogos.module';
import { PersonasModule } from './modules/personas/personas.module';
import { ParametrosModule } from './modules/parametros/parametros.module';
import { IntegracionesModule } from './modules/integraciones/integraciones.module';
import { EmisionModule } from './modules/emision/emision.module';
import { EventosModule } from './modules/eventos/eventos.module';
import { VerificacionModule } from './modules/verificacion/verificacion.module';
import { ExportacionModule } from './modules/exportacion/exportacion.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { CatalogoErrorService } from './common/filters/catalogo-error.service';
import { CatalogoErrorFilter } from './common/filters/catalogo-error.filter';
import { AuditoriaInterceptor } from './common/interceptors/auditoria.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MfaGuard } from './common/guards/mfa.guard';
import { CatError } from './entities/cat-error.entity';
import { decodificarPem, EnvConfig } from './config/config.schema';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    RedisModule,
    TypeOrmModule.forFeature([CatError]),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        privateKey: decodificarPem(configService.get('JWT_PRIVATE_KEY', { infer: true })),
        publicKey: decodificarPem(configService.get('JWT_PUBLIC_KEY', { infer: true })),
        signOptions: { algorithm: 'RS256' },
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
    AuditoriaModule,
    AuthModule,
    UsuariosModule,
    SaludModule,
    CatalogosModule,
    PersonasModule,
    ParametrosModule,
    IntegracionesModule,
    EmisionModule,
    EventosModule,
    VerificacionModule,
    ExportacionModule,
  ],
  controllers: [AppController],
  providers: [
    CatalogoErrorService,
    { provide: APP_FILTER, useClass: CatalogoErrorFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: MfaGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { EnvConfig } from './config/config.schema';
import { ProviderFactoryService } from './modules/integraciones/provider-factory.service';

/**
 * Candado de producción (ver docs/PLAN.md sección 6.2): sin fallback automático a simulador en
 * prod. Si ALLOW_SIMULATOR=false y alguna integración crítica (FIRMA/TSA/OCSP) sigue en modo
 * SIMULADOR, el arranque falla con un mensaje claro en vez de servir tráfico degradado.
 */
export async function verificarCandadoSimulador(
  app: INestApplication,
  configService: ConfigService<EnvConfig, true>,
): Promise<void> {
  const esProduccion = configService.get('NODE_ENV', { infer: true }) === 'production';
  const permiteSimulador = configService.get('ALLOW_SIMULATOR', { infer: true });
  if (!esProduccion || permiteSimulador) {
    return;
  }
  const providerFactory = app.get(ProviderFactoryService);
  const { enSimulador, tipos } = await providerFactory.estadoSimuladorCritico();
  if (enSimulador) {
    throw new Error(
      `Arranque bloqueado: ALLOW_SIMULATOR=false pero las integraciones críticas [${tipos.join(', ')}] ` +
        'siguen en modo SIMULADOR. Configúralas en modo REAL o DESHABILITADO desde /admin/integraciones ' +
        'antes de desplegar a producción.',
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<EnvConfig, true>);
  await verificarCandadoSimulador(app, configService);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: configService.get('PUBLIC_BASE_URL', { infer: true }),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (configService.get('NODE_ENV', { infer: true }) !== 'production') {
    const documento = new DocumentBuilder()
      .setTitle('PSDTE API')
      .setDescription('Pagaré electrónico — Paraguay (ver docs/PLAN.md)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, documento);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

// `require.main === module` evita arrancar la app (y su app.listen) cuando este archivo se importa
// desde un test (p. ej. para reusar verificarCandadoSimulador) en vez de ejecutarse directamente.
if (require.main === module) {
  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

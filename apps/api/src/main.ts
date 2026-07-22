import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { EnvConfig } from './config/config.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<EnvConfig, true>);

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

bootstrap();

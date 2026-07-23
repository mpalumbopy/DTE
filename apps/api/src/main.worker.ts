import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

/** Entrypoint del proceso worker (`infra/docker/Dockerfile.api-worker`, CMD distinto del de la API
 * — mismo build, mismo dist, otro comando). Sin HTTP: `createApplicationContext` instancia los
 * providers (incluye los `@Processor` de JobsModule) sin levantar un listener. */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

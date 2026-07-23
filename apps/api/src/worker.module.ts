import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { LoggerModule } from './common/logging/logger.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { JobsModule } from './jobs/jobs.module';

/**
 * Módulo raíz del proceso worker (`PROCESS_ROLE=worker`, ver main.worker.ts) — deliberadamente NO
 * importa `AppModule`: los controllers/guards HTTP no tienen sentido en un proceso sin listener, y
 * cargar los `@Processor` de JobsModule dentro del proceso api (vía AppModule) haría que cada
 * réplica de la API también consumiera las colas, duplicando el trabajo del deployment dedicado a
 * worker en K8s (infra/k8s/worker-deployment.yaml).
 */
@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, RedisModule, JobsModule],
})
export class WorkerModule {}

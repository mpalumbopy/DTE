import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvConfig } from '../config/config.schema';
import * as entities from '../entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        type: 'postgres' as const,
        url: configService.get('DATABASE_URL', { infer: true }),
        entities: Object.values(entities),
        synchronize: false,
        logging: configService.get('NODE_ENV', { infer: true }) === 'development' ? ['error', 'warn'] : ['error'],
        extra: {
          max: configService.get('PROCESS_ROLE', { infer: true }) === 'worker' ? 5 : 10,
          statement_timeout: configService.get('PROCESS_ROLE', { infer: true }) === 'worker' ? 120000 : 15000,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}

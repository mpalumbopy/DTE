import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EnvConfig } from '../../config/config.schema';

export const REDIS_CLIENT = 'REDIS_CLIENT';

class RedisShutdownHook implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) =>
        new Redis(configService.get('REDIS_URL', { infer: true }), { lazyConnect: false, maxRetriesPerRequest: 2 }),
    },
    RedisShutdownHook,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

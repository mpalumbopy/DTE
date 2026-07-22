import { Module } from '@nestjs/common';
import { LoggerModule as NestjsPinoModule } from 'nestjs-pino';
import { obtenerRequestId } from '../context/request-context';

@Module({
  imports: [
    NestjsPinoModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.credenciales'],
        customProps: () => ({ requestId: obtenerRequestId() }),
        formatters: {
          level: (label) => ({ level: label }),
        },
      },
    }),
  ],
  exports: [NestjsPinoModule],
})
export class LoggerModule {}

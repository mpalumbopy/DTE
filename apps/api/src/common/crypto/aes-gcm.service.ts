import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cifrarAesGcm, descifrarAesGcm } from '@psdte/shared';
import { EnvConfig } from '../../config/config.schema';

@Injectable()
export class AesGcmService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  cifrar(textoPlano: string): string {
    return cifrarAesGcm(textoPlano, this.configService.get('APP_ENCRYPTION_KEY', { infer: true }));
  }

  descifrar(valorCifrado: string): string {
    return descifrarAesGcm(valorCifrado, this.configService.get('APP_ENCRYPTION_KEY', { infer: true }));
  }
}

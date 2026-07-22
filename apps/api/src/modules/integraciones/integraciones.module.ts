import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { IntegracionWs } from '../../entities/integracion-ws.entity';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';
import { PkiSimuladaService } from './pki-simulada.service';
import { ProviderFactoryService } from './provider-factory.service';

@Module({
  imports: [TypeOrmModule.forFeature([IntegracionWs, ParametroSistema])],
  providers: [AesGcmService, PkiSimuladaService, ProviderFactoryService],
  exports: [ProviderFactoryService],
})
export class IntegracionesModule {}

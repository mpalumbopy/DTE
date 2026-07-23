import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { IntegracionWs } from '../../entities/integracion-ws.entity';
import { IntegracionWsHistorial } from '../../entities/integracion-ws-historial.entity';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';
import { Usuario } from '../../entities/usuario.entity';
import { PkiSimuladaService } from './pki-simulada.service';
import { ProviderFactoryService } from './provider-factory.service';
import { IntegracionesAdminService } from './integraciones-admin.service';
import { IntegracionesAdminController } from './integraciones-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegracionWs, IntegracionWsHistorial, ParametroSistema, Usuario]),
    AuditoriaModule,
  ],
  controllers: [IntegracionesAdminController],
  providers: [AesGcmService, PkiSimuladaService, ProviderFactoryService, IntegracionesAdminService],
  exports: [ProviderFactoryService],
})
export class IntegracionesModule {}

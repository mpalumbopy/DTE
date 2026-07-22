import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaLog } from '../../entities/auditoria-log.entity';
import { HashChainService } from '../../common/crypto/hash-chain.service';
import { AuditoriaService } from './auditoria.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditoriaLog])],
  providers: [AuditoriaService, HashChainService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}

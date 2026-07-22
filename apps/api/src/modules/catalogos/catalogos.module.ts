import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatEstadoDte } from '../../entities/cat-estado-dte.entity';
import { CatTipoEvento } from '../../entities/cat-tipo-evento.entity';
import { CatTransicion } from '../../entities/cat-transicion.entity';
import { CatRol } from '../../entities/cat-rol.entity';
import { CatActoExterno } from '../../entities/cat-acto-externo.entity';
import { CatCausalBloqueo } from '../../entities/cat-causal-bloqueo.entity';
import { CatTipoEvidencia } from '../../entities/cat-tipo-evidencia.entity';
import { CatNivelConsulta } from '../../entities/cat-nivel-consulta.entity';
import { CatTipoNotificacion } from '../../entities/cat-tipo-notificacion.entity';
import { CatError } from '../../entities/cat-error.entity';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CatEstadoDte,
      CatTipoEvento,
      CatTransicion,
      CatRol,
      CatActoExterno,
      CatCausalBloqueo,
      CatTipoEvidencia,
      CatNivelConsulta,
      CatTipoNotificacion,
      CatError,
    ]),
  ],
  controllers: [CatalogosController],
  providers: [CatalogosService],
  exports: [CatalogosService],
})
export class CatalogosModule {}

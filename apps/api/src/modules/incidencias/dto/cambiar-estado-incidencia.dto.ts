import { IsIn } from 'class-validator';

export class CambiarEstadoIncidenciaDto {
  @IsIn(['ABIERTA', 'EN_ANALISIS', 'RESUELTA', 'CERRADA'])
  estado!: 'ABIERTA' | 'EN_ANALISIS' | 'RESUELTA' | 'CERRADA';
}

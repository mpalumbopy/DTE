import { IsIn } from 'class-validator';

export class GenerarExportacionDto {
  @IsIn(['CONTENEDOR', 'PDF_A'])
  tipo!: 'CONTENEDOR' | 'PDF_A';
}

import { IsISO8601, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RegistrarBloqueoDto {
  @IsInt()
  @Min(1)
  causalCodigo!: number;

  @IsString()
  autoridad!: string;

  @IsOptional()
  @IsString()
  numeroOficio?: string;

  @IsISO8601()
  fechaOrden!: string;

  @IsOptional()
  @IsString()
  documentoRespaldo?: string;
}

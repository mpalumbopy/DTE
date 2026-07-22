import { IsInt, IsOptional, IsString } from 'class-validator';

export class DireccionDto {
  @IsString()
  direccion!: string;

  @IsOptional()
  @IsString()
  numeroCasa?: string;

  @IsInt()
  codigoCiudad!: number;

  @IsInt()
  codigoDistrito!: number;

  @IsInt()
  codigoDepartamento!: number;

  @IsInt()
  codigoPais!: number;
}

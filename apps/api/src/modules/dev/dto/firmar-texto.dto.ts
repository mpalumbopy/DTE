import { IsOptional, IsString, MinLength } from 'class-validator';

export class FirmarTextoDto {
  @IsString()
  @MinLength(1)
  texto!: string;

  @IsOptional()
  @IsString()
  nombreFirmante?: string;

  @IsOptional()
  @IsString()
  documentoFirmante?: string;
}

import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RegistrarPagoDto {
  @IsNumber()
  @IsPositive()
  montoPagado!: number;

  @IsOptional()
  @IsString()
  medioPago?: string;

  @IsOptional()
  @IsString()
  referenciaExterna?: string;
}

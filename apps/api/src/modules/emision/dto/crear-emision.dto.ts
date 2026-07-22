import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DireccionDto } from './direccion.dto';
import { ParteDto } from './parte.dto';

export class CrearEmisionDto {
  @IsISO8601()
  fechaVencimiento!: string;

  @IsNumber()
  @IsPositive()
  monto!: number;

  @IsOptional()
  @IsString()
  codigoMoneda?: string;

  @ValidateNested()
  @Type(() => DireccionDto)
  lugarEmision!: DireccionDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DireccionDto)
  lugaresPago!: DireccionDto[];

  @IsUUID()
  acreedorInicialPersonaId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ParteDto)
  deudores!: ParteDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParteDto)
  codeudores?: ParteDto[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  condiciones!: string[];
}

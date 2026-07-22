import { IsEmail, IsIn, IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CrearPersonaDto {
  @IsIn([1, 2])
  tipoPersona!: 1 | 2;

  @ValidateIf((dto) => dto.tipoPersona === 1)
  @IsString()
  nombresApellidos?: string;

  @ValidateIf((dto) => dto.tipoPersona === 2)
  @IsString()
  razonSocial?: string;

  @IsInt()
  tipoDocumento!: number;

  @IsString()
  numeroDocumento!: string;

  @IsInt()
  paisDocumento!: number;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;
}

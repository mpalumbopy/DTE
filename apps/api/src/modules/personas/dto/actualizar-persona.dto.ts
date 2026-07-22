import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ActualizarPersonaDto {
  @IsOptional()
  @IsString()
  nombresApellidos?: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;

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

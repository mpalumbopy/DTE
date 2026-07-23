import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';

export class CredencialesIntegracionDto {
  @IsOptional()
  @IsString()
  usuario?: string;

  @IsOptional()
  @IsString()
  clave?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  apiKeyHeader?: string;

  @IsOptional()
  @IsString()
  apiKeyValor?: string;

  @IsOptional()
  @IsString()
  mtlsCertPem?: string;

  @IsOptional()
  @IsString()
  mtlsKeyPem?: string;
}

export class ConfigurarIntegracionDto {
  @IsIn(['SIMULADOR', 'REAL', 'DESHABILITADO'])
  modo!: 'SIMULADOR' | 'REAL' | 'DESHABILITADO';

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsObject()
  endpoints!: Record<string, string>;

  @IsIn(['NONE', 'BASIC', 'BEARER', 'API_KEY', 'MTLS'])
  authTipo!: 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY' | 'MTLS';

  /** Omitido: conserva las credenciales ya guardadas. Presente: las reemplaza (rotación). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CredencialesIntegracionDto)
  credenciales?: CredencialesIntegracionDto;

  @IsObject()
  headersExtra!: Record<string, string>;

  @IsInt()
  @IsPositive()
  timeoutMs!: number;

  @IsInt()
  reintentos!: number;

  @IsInt()
  backoffMs!: number;

  @IsObject()
  mapeoPayload!: Record<string, unknown>;

  @IsBoolean()
  verificarTls!: boolean;
}

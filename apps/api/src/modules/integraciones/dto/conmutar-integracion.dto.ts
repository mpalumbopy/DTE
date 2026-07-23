import { IsIn, IsOptional, IsString } from 'class-validator';

export class ConmutarIntegracionDto {
  @IsIn(['SIMULADOR', 'REAL', 'DESHABILITADO'])
  modoDestino!: 'SIMULADOR' | 'REAL' | 'DESHABILITADO';

  /** Requerida al conmutar a REAL (re-ingreso de contraseña del admin — sección 6.5). */
  @IsOptional()
  @IsString()
  passwordAdmin?: string;
}

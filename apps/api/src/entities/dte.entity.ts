import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'dte', schema: 'psdte' })
export class Dte {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'id_dte', type: 'varchar' })
  idDte!: string;

  @Column({ name: 'id_datos_generales', type: 'varchar' })
  idDatosGenerales!: string;

  @Column({ name: 'version_perfil', type: 'varchar' })
  versionPerfil!: string;

  @Column({ name: 'codigo_tipo_dte', type: 'smallint' })
  codigoTipoDte!: number;

  @Column({ name: 'descripcion_tipo_dte', type: 'varchar' })
  descripcionTipoDte!: string;

  @Column({ name: 'numero_dte', type: 'bigint' })
  numeroDte!: string;

  @Column({ name: 'fecha_emision', type: 'timestamptz' })
  fechaEmision!: Date;

  @Column({ name: 'fecha_vencimiento', type: 'timestamptz' })
  fechaVencimiento!: Date;

  @Column({ name: 'moneda_codigo', type: 'char' })
  monedaCodigo!: string;

  @Column({ type: 'numeric' })
  monto!: string;

  @Column({ name: 'monto_letras', type: 'varchar' })
  montoLetras!: string;

  @Column({ name: 'texto_promesa_pago', type: 'text' })
  textoPromesaPago!: string;

  @Column({ name: 'enlace_qr', type: 'text', nullable: true })
  enlaceQr!: string | null;

  @Column({ name: 'estado_actual', type: 'smallint' })
  estadoActual!: number;

  @Column({ name: 'saldo_pendiente', type: 'numeric' })
  saldoPendiente!: string;

  @Column({ name: 'version_vigente', type: 'int' })
  versionVigente!: number;

  @Column({ name: 'hash_vigente', type: 'char', nullable: true })
  hashVigente!: string | null;

  @Column({ name: 'emision_direccion', type: 'varchar' })
  emisionDireccion!: string;

  @Column({ name: 'emision_numero_casa', type: 'varchar', nullable: true })
  emisionNumeroCasa!: string | null;

  @Column({ name: 'emision_ciudad_codigo', type: 'smallint', nullable: true })
  emisionCiudadCodigo!: number | null;

  @Column({ name: 'emision_distrito_codigo', type: 'smallint', nullable: true })
  emisionDistritoCodigo!: number | null;

  @Column({ name: 'emision_departamento_codigo', type: 'smallint', nullable: true })
  emisionDepartamentoCodigo!: number | null;

  @Column({ name: 'emision_pais_codigo', type: 'smallint', nullable: true })
  emisionPaisCodigo!: number | null;

  @Column({ name: 'creado_por', type: 'uuid' })
  creadoPor!: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn!: Date;
}

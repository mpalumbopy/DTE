import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AmbitoFirma = 'DATOS_GENERALES' | 'EVENTO' | 'DOCUMENTO';
export type EstadoValidacionFirma = 'PENDIENTE' | 'VALIDA' | 'INVALIDA' | 'INDETERMINADA';

@Entity({ name: 'firma', schema: 'psdte' })
export class Firma {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'evento_id', type: 'uuid', nullable: true })
  eventoId!: string | null;

  @Column({ name: 'xml_signature_id', type: 'varchar' })
  xmlSignatureId!: string;

  @Column({ type: 'varchar' })
  ambito!: AmbitoFirma;

  @Column({ name: 'rol_firmante', type: 'varchar' })
  rolFirmante!: string;

  @Column({ name: 'certificado_id', type: 'uuid' })
  certificadoId!: string;

  @Column({ type: 'varchar', default: 'XAdES-T' })
  formato!: string;

  @Column({ name: 'algoritmo_firma', type: 'varchar' })
  algoritmoFirma!: string;

  @Column({ name: 'algoritmo_digest', type: 'varchar' })
  algoritmoDigest!: string;

  @Column({ name: 'signing_time', type: 'timestamptz' })
  signingTime!: Date;

  @Column({ type: 'jsonb' })
  referencias!: string[];

  @Column({ name: 'signature_value_hash', type: 'char' })
  signatureValueHash!: string;

  @Column({ name: 'sello_tiempo_tsa', type: 'text', nullable: true })
  selloTiempoTsa!: string | null;

  @Column({ name: 'tsa_fecha', type: 'timestamptz', nullable: true })
  tsaFecha!: Date | null;

  @Column({ name: 'estado_validacion', type: 'varchar', default: 'PENDIENTE' })
  estadoValidacion!: EstadoValidacionFirma;

  @Column({ name: 'validada_en', type: 'timestamptz', nullable: true })
  validadaEn!: Date | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;
}

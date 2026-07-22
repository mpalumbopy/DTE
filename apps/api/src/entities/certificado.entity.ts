import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type TipoCertificado = 'FIRMA_CUALIFICADA' | 'SELLO_PSDTE' | 'TSA' | 'CA';

@Entity({ name: 'certificado', schema: 'psdte' })
export class Certificado {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'numero_serie', type: 'varchar' })
  numeroSerie!: string;

  @Column({ name: 'subject_dn', type: 'text' })
  subjectDn!: string;

  @Column({ name: 'issuer_dn', type: 'text' })
  issuerDn!: string;

  @Column({ type: 'varchar' })
  tipo!: TipoCertificado;

  @Column({ type: 'varchar', nullable: true })
  nivel!: string | null;

  @Column({ name: 'documento_titular', type: 'varchar', nullable: true })
  documentoTitular!: string | null;

  @Column({ name: 'persona_id', type: 'uuid', nullable: true })
  personaId!: string | null;

  @Column({ name: 'valido_desde', type: 'timestamptz' })
  validoDesde!: Date;

  @Column({ name: 'valido_hasta', type: 'timestamptz' })
  validoHasta!: Date;

  @Column({ name: 'certificado_der', type: 'bytea' })
  certificadoDer!: Buffer;

  @Column({ name: 'en_tsl', default: false })
  enTsl!: boolean;

  @Column({ default: false })
  revocado!: boolean;

  @Column({ name: 'fecha_revocacion', type: 'timestamptz', nullable: true })
  fechaRevocacion!: Date | null;
}

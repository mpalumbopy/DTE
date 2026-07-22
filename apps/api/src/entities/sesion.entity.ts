import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sesion', schema: 'psdte' })
export class Sesion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'mfa_verificada', default: false })
  mfaVerificada!: boolean;

  @CreateDateColumn({ name: 'creada_en' })
  creadaEn!: Date;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn!: Date;

  @Column({ name: 'revocada_en', type: 'timestamptz', nullable: true })
  revocadaEn!: Date | null;

  @Column({ name: 'familia_id', type: 'uuid' })
  familiaId!: string;

  @Column({ name: 'reemplazada_por_id', type: 'uuid', nullable: true })
  reemplazadaPorId!: string | null;
}

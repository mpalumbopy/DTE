import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'usuario', schema: 'psdte' })
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  username!: string;

  @Column()
  email!: string;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'mfa_habilitado', default: false })
  mfaHabilitado!: boolean;

  @Column({ name: 'mfa_secreto_cifrado', type: 'text', nullable: true })
  mfaSecretoCifrado!: string | null;

  @Column({ name: 'persona_id', type: 'uuid', nullable: true })
  personaId!: string | null;

  @Column({ default: true })
  activo!: boolean;

  @Column({ name: 'intentos_fallidos', default: 0 })
  intentosFallidos!: number;

  @Column({ name: 'bloqueado_hasta', type: 'timestamptz', nullable: true })
  bloqueadoHasta!: Date | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn!: Date;
}

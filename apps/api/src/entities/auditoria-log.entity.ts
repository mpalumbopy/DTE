import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'auditoria_log', schema: 'psdte' })
export class AuditoriaLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @CreateDateColumn({ name: 'ocurrido_en' })
  ocurridoEn!: Date;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId!: string | null;

  @Column()
  accion!: string;

  @Column({ type: 'varchar', nullable: true })
  entidad!: string | null;

  @Column({ name: 'entidad_id', type: 'text', nullable: true })
  entidadId!: string | null;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detalle!: Record<string, unknown> | null;

  @Column({ name: 'hash_registro', type: 'char', length: 64 })
  hashRegistro!: string;

  @Column({ name: 'hash_anterior', type: 'char', length: 64, nullable: true })
  hashAnterior!: string | null;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type EstadoNotificacion = 'PENDIENTE' | 'ENVIADA' | 'ENTREGADA' | 'FALLIDA' | 'ACUSADA';

@Entity({ name: 'notificacion', schema: 'psdte' })
export class Notificacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tipo_codigo', type: 'smallint' })
  tipoCodigo!: number;

  @Column({ name: 'dte_id', type: 'uuid', nullable: true })
  dteId!: string | null;

  @Column({ name: 'evento_id', type: 'uuid', nullable: true })
  eventoId!: string | null;

  @Column({ name: 'destinatario_persona_id', type: 'uuid', nullable: true })
  destinatarioPersonaId!: string | null;

  @Column({ type: 'varchar' })
  destino!: string;

  @Column({ type: 'varchar', nullable: true })
  asunto!: string | null;

  @Column({ type: 'text', nullable: true })
  cuerpo!: string | null;

  @Column({ type: 'varchar', default: 'PENDIENTE' })
  estado!: EstadoNotificacion;

  @Column({ type: 'smallint', default: 0 })
  intentos!: number;

  @Column({ name: 'enviada_en', type: 'timestamptz', nullable: true })
  enviadaEn!: Date | null;

  @Column({ name: 'acusada_en', type: 'timestamptz', nullable: true })
  acusadaEn!: Date | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;
}

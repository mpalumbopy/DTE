import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SeveridadIncidencia = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type EstadoIncidencia = 'ABIERTA' | 'EN_ANALISIS' | 'RESUELTA' | 'CERRADA';

@Entity({ name: 'incidencia', schema: 'psdte' })
export class Incidencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'error_codigo', type: 'varchar', nullable: true })
  errorCodigo!: string | null;

  @Column({ name: 'dte_id', type: 'uuid', nullable: true })
  dteId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  endpoint!: string | null;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detalle!: Record<string, unknown> | null;

  @Column({ type: 'varchar', default: 'MEDIA' })
  severidad!: SeveridadIncidencia;

  @Column({ type: 'varchar', default: 'ABIERTA' })
  estado!: EstadoIncidencia;

  @CreateDateColumn({ name: 'ocurrido_en' })
  ocurridoEn!: Date;

  @Column({ name: 'resuelto_en', type: 'timestamptz', nullable: true })
  resueltoEn!: Date | null;
}

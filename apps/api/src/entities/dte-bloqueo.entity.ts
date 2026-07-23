import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'dte_bloqueo', schema: 'psdte' })
export class DteBloqueo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'causal_codigo', type: 'smallint' })
  causalCodigo!: number;

  @Column({ type: 'varchar' })
  autoridad!: string;

  @Column({ name: 'numero_oficio', type: 'varchar', nullable: true })
  numeroOficio!: string | null;

  @Column({ name: 'fecha_orden', type: 'date' })
  fechaOrden!: string;

  @Column({ name: 'fecha_recepcion', type: 'timestamptz' })
  fechaRecepcion!: Date;

  @Column({ name: 'fecha_aplicacion', type: 'timestamptz' })
  fechaAplicacion!: Date;

  @Column({ name: 'evento_levantamiento_id', type: 'uuid', nullable: true })
  eventoLevantamientoId!: string | null;

  @Column({ name: 'documento_respaldo', type: 'text', nullable: true })
  documentoRespaldo!: string | null;
}

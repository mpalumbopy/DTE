import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'dte_evento', schema: 'psdte' })
export class DteEvento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'id_evento_xml', type: 'varchar' })
  idEventoXml!: string;

  @Column({ type: 'int' })
  secuencia!: number;

  @Column({ name: 'numero_evento', type: 'varchar' })
  numeroEvento!: string;

  @Column({ name: 'tipo_evento', type: 'smallint' })
  tipoEvento!: number;

  @Column({ name: 'fecha_evento', type: 'timestamptz' })
  fechaEvento!: Date;

  @CreateDateColumn({ name: 'fecha_registro' })
  fechaRegistro!: Date;

  @Column({ name: 'actor_usuario_id', type: 'uuid', nullable: true })
  actorUsuarioId!: string | null;

  @Column({ name: 'actor_descripcion', type: 'varchar' })
  actorDescripcion!: string;

  @Column({ name: 'rol_actor', type: 'varchar' })
  rolActor!: string;

  @Column({ name: 'estado_previo', type: 'smallint' })
  estadoPrevio!: number;

  @Column({ name: 'estado_resultante', type: 'smallint' })
  estadoResultante!: number;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'hash_evento', type: 'char' })
  hashEvento!: string;

  @Column({ name: 'hash_anterior', type: 'char', nullable: true })
  hashAnterior!: string | null;

  @Column({ name: 'ip_origen', type: 'inet', nullable: true })
  ipOrigen!: string | null;
}

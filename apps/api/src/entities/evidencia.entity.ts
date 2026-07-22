import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'evidencia', schema: 'psdte' })
export class Evidencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid', nullable: true })
  dteId!: string | null;

  @Column({ name: 'evento_id', type: 'uuid', nullable: true })
  eventoId!: string | null;

  @Column({ name: 'tipo_codigo', type: 'smallint' })
  tipoCodigo!: number;

  @Column({ name: 'hash_sha256', type: 'char' })
  hashSha256!: string;

  @Column({ type: 'bytea', nullable: true })
  contenido!: Buffer | null;

  @Column({ name: 'uri_objeto', type: 'text', nullable: true })
  uriObjeto!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadatos!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;
}

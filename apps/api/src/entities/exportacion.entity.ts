import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type TipoExportacion = 'PDF_A' | 'CONTENEDOR';

@Entity({ name: 'exportacion', schema: 'psdte' })
export class Exportacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'xml_version_id', type: 'uuid' })
  xmlVersionId!: string;

  @Column({ type: 'varchar' })
  tipo!: TipoExportacion;

  @Column({ name: 'hash_sha256', type: 'char' })
  hashSha256!: string;

  @Column({ type: 'jsonb' })
  manifiesto!: Record<string, unknown>;

  @Column({ name: 'uri_objeto', type: 'text' })
  uriObjeto!: string;

  @Column({ name: 'solicitado_por', type: 'uuid', nullable: true })
  solicitadoPor!: string | null;

  @CreateDateColumn({ name: 'generado_en' })
  generadoEn!: Date;
}

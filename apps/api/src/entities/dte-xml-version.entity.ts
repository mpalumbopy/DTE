import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'dte_xml_version', schema: 'psdte' })
export class DteXmlVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'evento_id', type: 'uuid', nullable: true })
  eventoId!: string | null;

  @Column({ name: 'hash_sha256', type: 'char' })
  hashSha256!: string;

  @Column({ name: 'tamano_bytes', type: 'bigint' })
  tamanoBytes!: string;

  @Column({ type: 'varchar', default: 'DB' })
  almacenamiento!: 'DB' | 'OBJECT_STORE';

  @Column({ name: 'contenido_xml', type: 'xml', nullable: true })
  contenidoXml!: string | null;

  @Column({ name: 'uri_objeto', type: 'text', nullable: true })
  uriObjeto!: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;
}

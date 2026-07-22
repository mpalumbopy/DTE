import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_tipo_evento', schema: 'psdte' })
export class CatTipoEvento {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ name: 'requiere_firma_endosante', default: false })
  requiereFirmaEndosante!: boolean;

  @Column({ name: 'requiere_firma_endosatario', default: false })
  requiereFirmaEndosatario!: boolean;

  @Column({ name: 'requiere_firma_psdte', default: true })
  requiereFirmaPsdte!: boolean;

  @Column({ name: 'version_catalogo', default: '1.0' })
  versionCatalogo!: string;

  @Column({ default: true })
  vigente!: boolean;
}

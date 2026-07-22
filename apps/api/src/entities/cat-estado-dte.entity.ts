import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_estado_dte', schema: 'psdte' })
export class CatEstadoDte {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ name: 'es_final', default: false })
  esFinal!: boolean;

  @Column({ name: 'permite_endoso', default: false })
  permiteEndoso!: boolean;

  @Column({ name: 'permite_pago', default: false })
  permitePago!: boolean;

  @Column({ name: 'version_catalogo', default: '1.0' })
  versionCatalogo!: string;

  @Column({ default: true })
  vigente!: boolean;
}

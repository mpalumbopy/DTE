import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_tipo_evidencia', schema: 'psdte' })
export class CatTipoEvidencia {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ default: true })
  vigente!: boolean;
}

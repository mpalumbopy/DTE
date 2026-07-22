import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_nivel_consulta', schema: 'psdte' })
export class CatNivelConsulta {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ name: 'campos_visibles', type: 'jsonb' })
  camposVisibles!: string[];

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;
}

import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_distrito', schema: 'psdte' })
export class CatDistrito {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ name: 'departamento_codigo', type: 'smallint' })
  departamentoCodigo!: number;
}

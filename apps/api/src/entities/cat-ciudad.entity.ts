import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_ciudad', schema: 'psdte' })
export class CatCiudad {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ name: 'distrito_codigo', type: 'smallint' })
  distritoCodigo!: number;
}

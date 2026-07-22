import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_pais', schema: 'psdte' })
export class CatPais {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;
}

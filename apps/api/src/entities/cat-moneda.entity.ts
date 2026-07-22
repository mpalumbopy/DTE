import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_moneda', schema: 'psdte' })
export class CatMoneda {
  @PrimaryColumn({ type: 'char' })
  codigo!: string;

  @Column()
  descripcion!: string;
}

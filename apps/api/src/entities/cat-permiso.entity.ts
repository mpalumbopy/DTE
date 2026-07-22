import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_permiso', schema: 'psdte' })
export class CatPermiso {
  @PrimaryColumn({ type: 'varchar' })
  codigo!: string;

  @Column({ type: 'text' })
  descripcion!: string;
}

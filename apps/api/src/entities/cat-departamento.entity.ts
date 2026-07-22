import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_departamento', schema: 'psdte' })
export class CatDepartamento {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ name: 'pais_codigo', type: 'smallint' })
  paisCodigo!: number;
}

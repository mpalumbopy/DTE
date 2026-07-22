import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_rol', schema: 'psdte' })
export class CatRol {
  @PrimaryColumn({ type: 'varchar' })
  codigo!: string;

  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ name: 'nivel_acceso' })
  nivelAcceso!: number;

  @Column({ default: true })
  vigente!: boolean;
}

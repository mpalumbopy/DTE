import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_acto_externo', schema: 'psdte' })
export class CatActoExterno {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ name: 'requiere_autoridad', default: true })
  requiereAutoridad!: boolean;

  @Column({ default: true })
  vigente!: boolean;
}

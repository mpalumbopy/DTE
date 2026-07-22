import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_causal_bloqueo', schema: 'psdte' })
export class CatCausalBloqueo {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column()
  origen!: string;

  @Column({ default: true })
  vigente!: boolean;
}

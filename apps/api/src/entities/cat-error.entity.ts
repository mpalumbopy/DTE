import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_error', schema: 'psdte' })
export class CatError {
  @PrimaryColumn({ type: 'varchar' })
  codigo!: string;

  @Column({ name: 'http_status' })
  httpStatus!: number;

  @Column()
  mensaje!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column()
  categoria!: string;

  @Column({ default: true })
  vigente!: boolean;
}

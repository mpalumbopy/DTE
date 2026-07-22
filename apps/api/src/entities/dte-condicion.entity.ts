import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'dte_condicion', schema: 'psdte' })
export class DteCondicion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ type: 'smallint' })
  orden!: number;

  @Column({ type: 'text' })
  descripcion!: string;
}

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'dte_cancelacion', schema: 'psdte' })
export class DteCancelacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ type: 'text' })
  motivo!: string;
}

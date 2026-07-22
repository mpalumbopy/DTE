import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type OrigenTenencia = 'EMISION' | 'ENDOSO' | 'ORDEN_AUTORIDAD';

@Entity({ name: 'dte_tenencia', schema: 'psdte' })
export class DteTenencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'persona_id', type: 'uuid' })
  personaId!: string;

  @Column({ type: 'varchar' })
  origen!: OrigenTenencia;

  @Column({ name: 'evento_id', type: 'uuid', nullable: true })
  eventoId!: string | null;

  @Column({ type: 'timestamptz' })
  desde!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  hasta!: Date | null;
}

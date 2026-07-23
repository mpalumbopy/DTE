import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'dte_pago', schema: 'psdte' })
export class DtePago {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'numero_pago', type: 'smallint' })
  numeroPago!: number;

  @Column({ name: 'monto_pagado', type: 'numeric' })
  montoPagado!: string;

  @Column({ name: 'saldo_pendiente', type: 'numeric' })
  saldoPendiente!: string;

  @Column({ name: 'medio_pago', type: 'varchar', nullable: true })
  medioPago!: string | null;

  @Column({ name: 'referencia_externa', type: 'varchar', nullable: true })
  referenciaExterna!: string | null;
}

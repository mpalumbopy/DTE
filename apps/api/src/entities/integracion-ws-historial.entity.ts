import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'integracion_ws_historial', schema: 'psdte' })
export class IntegracionWsHistorial {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'integracion_id', type: 'uuid' })
  integracionId!: string;

  @Column({ type: 'jsonb' })
  cambio!: Record<string, unknown>;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId!: string | null;

  @CreateDateColumn({ name: 'ocurrido_en' })
  ocurridoEn!: Date;
}

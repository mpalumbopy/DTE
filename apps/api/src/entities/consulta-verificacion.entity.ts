import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'consulta_verificacion', schema: 'psdte' })
export class ConsultaVerificacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid', nullable: true })
  dteId!: string | null;

  @Column({ name: 'id_dte_consultado', type: 'varchar' })
  idDteConsultado!: string;

  @Column({ name: 'nivel_codigo', type: 'smallint' })
  nivelCodigo!: number;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId!: string | null;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'varchar' })
  resultado!: string;

  @Column({ type: 'jsonb', nullable: true })
  detalle!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'consultado_en' })
  consultadoEn!: Date;
}

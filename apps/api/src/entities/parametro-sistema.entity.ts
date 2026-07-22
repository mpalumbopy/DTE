import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'parametro_sistema', schema: 'psdte' })
export class ParametroSistema {
  @PrimaryColumn({ type: 'varchar' })
  clave!: string;

  @Column({ type: 'jsonb' })
  valor!: unknown;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ default: true })
  editable!: boolean;

  @Column({ name: 'actualizado_por', type: 'uuid', nullable: true })
  actualizadoPor!: string | null;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn!: Date;
}

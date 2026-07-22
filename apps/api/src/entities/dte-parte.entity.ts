import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type RolParte = 'ACREEDOR_INICIAL' | 'DEUDOR' | 'CODEUDOR' | 'AVALISTA' | 'ENDOSANTE' | 'ENDOSATARIO' | 'TENEDOR';

@Entity({ name: 'dte_parte', schema: 'psdte' })
export class DteParte {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'persona_id', type: 'uuid' })
  personaId!: string;

  @Column({ name: 'rol_parte', type: 'varchar' })
  rolParte!: RolParte;

  @Column({ name: 'condicion_firmante', type: 'varchar', nullable: true })
  condicionFirmante!: string | null;

  @Column({ type: 'smallint', default: 1 })
  orden!: number;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;
}

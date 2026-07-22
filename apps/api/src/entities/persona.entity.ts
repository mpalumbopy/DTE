import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'persona', schema: 'psdte' })
export class Persona {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tipo_persona', type: 'smallint' })
  tipoPersona!: number;

  @Column({ name: 'nombres_apellidos', type: 'varchar', nullable: true })
  nombresApellidos!: string | null;

  @Column({ name: 'razon_social', type: 'varchar', nullable: true })
  razonSocial!: string | null;

  @Column({ name: 'tipo_documento', type: 'smallint' })
  tipoDocumento!: number;

  @Column({ name: 'numero_documento' })
  numeroDocumento!: string;

  @Column({ name: 'pais_documento', type: 'smallint' })
  paisDocumento!: number;

  @Column({ type: 'varchar', nullable: true })
  ruc!: string | null;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  telefono!: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn!: Date;
}

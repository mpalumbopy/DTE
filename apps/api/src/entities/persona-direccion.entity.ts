import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'persona_direccion', schema: 'psdte' })
export class PersonaDireccion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'persona_id', type: 'uuid' })
  personaId!: string;

  @Column()
  direccion!: string;

  @Column({ name: 'numero_casa', type: 'varchar', nullable: true })
  numeroCasa!: string | null;

  @Column({ name: 'ciudad_codigo', type: 'smallint', nullable: true })
  ciudadCodigo!: number | null;

  @Column({ name: 'distrito_codigo', type: 'smallint', nullable: true })
  distritoCodigo!: number | null;

  @Column({ name: 'departamento_codigo', type: 'smallint', nullable: true })
  departamentoCodigo!: number | null;

  @Column({ name: 'pais_codigo', type: 'smallint', nullable: true })
  paisCodigo!: number | null;

  @Column({ default: true })
  principal!: boolean;
}

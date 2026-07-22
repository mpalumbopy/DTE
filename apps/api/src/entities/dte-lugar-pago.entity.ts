import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'dte_lugar_pago', schema: 'psdte' })
export class DteLugarPago {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ type: 'smallint', default: 1 })
  orden!: number;

  @Column({ type: 'varchar' })
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
}

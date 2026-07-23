import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'resellado_ltv', schema: 'psdte' })
export class ReselladoLtv {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'xml_version_id', type: 'uuid' })
  xmlVersionId!: string;

  @Column({ name: 'token_tsa', type: 'bytea' })
  tokenTsa!: Buffer;

  @Column({ type: 'varchar' })
  algoritmo!: string;

  @Column({ name: 'aplicado_en', type: 'timestamptz' })
  aplicadoEn!: Date;

  @Column({ name: 'proximo_resellado', type: 'timestamptz' })
  proximoResellado!: Date;
}

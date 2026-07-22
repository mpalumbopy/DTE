import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_tipo_documento_identidad', schema: 'psdte' })
export class CatTipoDocumentoIdentidad {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  sigla!: string;

  @Column()
  descripcion!: string;
}

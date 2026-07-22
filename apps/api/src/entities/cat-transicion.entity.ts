import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'cat_transicion', schema: 'psdte' })
export class CatTransicion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'estado_origen', type: 'smallint' })
  estadoOrigen!: number;

  @Column({ name: 'tipo_evento', type: 'smallint' })
  tipoEvento!: number;

  @Column({ name: 'estado_destino', type: 'smallint' })
  estadoDestino!: number;

  @Column({ type: 'text', nullable: true })
  condicion!: string | null;

  @Column({ name: 'version_catalogo', default: '1.0' })
  versionCatalogo!: string;

  @Column({ default: true })
  vigente!: boolean;
}

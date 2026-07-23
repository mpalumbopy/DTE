import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'dte_endoso', schema: 'psdte' })
export class DteEndoso {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId!: string;

  @Column({ name: 'dte_id', type: 'uuid' })
  dteId!: string;

  @Column({ name: 'numero_endoso', type: 'smallint' })
  numeroEndoso!: number;

  @Column({ name: 'endosante_persona_id', type: 'uuid' })
  endosantePersonaId!: string;

  @Column({ name: 'endosante_condicion', type: 'varchar', nullable: true })
  endosanteCondicion!: string | null;

  @Column({ name: 'endosatario_persona_id', type: 'uuid' })
  endosatarioPersonaId!: string;

  @Column({ name: 'texto_endoso', type: 'text' })
  textoEndoso!: string;
}

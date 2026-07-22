import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_tipo_notificacion', schema: 'psdte' })
export class CatTipoNotificacion {
  @PrimaryColumn({ type: 'smallint' })
  codigo!: number;

  @Column()
  nombre!: string;

  @Column()
  canal!: string;

  @Column({ type: 'text', nullable: true })
  plantilla!: string | null;

  @Column({ name: 'requiere_acuse', default: false })
  requiereAcuse!: boolean;

  @Column({ default: true })
  vigente!: boolean;
}

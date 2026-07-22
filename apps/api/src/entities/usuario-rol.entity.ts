import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'usuario_rol', schema: 'psdte' })
export class UsuarioRol {
  @PrimaryColumn({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  @PrimaryColumn({ name: 'rol_codigo', type: 'varchar' })
  rolCodigo!: string;

  @Column({ name: 'otorgado_por', type: 'uuid', nullable: true })
  otorgadoPor!: string | null;

  @CreateDateColumn({ name: 'otorgado_en' })
  otorgadoEn!: Date;
}

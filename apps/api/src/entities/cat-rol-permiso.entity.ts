import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'cat_rol_permiso', schema: 'psdte' })
export class CatRolPermiso {
  @PrimaryColumn({ name: 'rol_codigo', type: 'varchar' })
  rolCodigo!: string;

  @PrimaryColumn({ name: 'permiso_codigo', type: 'varchar' })
  permisoCodigo!: string;
}

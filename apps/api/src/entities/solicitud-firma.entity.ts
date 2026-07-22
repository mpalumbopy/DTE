import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type EstadoSolicitudFirma = 'PENDIENTE' | 'ENVIADA' | 'FIRMADA' | 'RECHAZADA' | 'EXPIRADA' | 'ERROR';

@Entity({ name: 'solicitud_firma', schema: 'psdte' })
export class SolicitudFirma {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** NULL hasta confirmar (el DTE aún no existe mientras se recolectan firmas — ver ADR en DECISIONES.md). */
  @Column({ name: 'dte_id', type: 'uuid', nullable: true })
  dteId!: string | null;

  @Column({ type: 'varchar' })
  ambito!: string;

  /** URI del nodo a firmar (p. ej. "#dDTE..."). */
  @Column({ name: 'nodo_ref', type: 'varchar' })
  nodoRef!: string;

  @Column({ name: 'firmante_persona_id', type: 'uuid' })
  firmantePersonaId!: string;

  @Column({ name: 'rol_firmante', type: 'varchar' })
  rolFirmante!: string;

  @Column({ type: 'varchar', default: 'PENDIENTE' })
  estado!: EstadoSolicitudFirma;

  @Column({ name: 'provider_ref', type: 'text', nullable: true })
  providerRef!: string | null;

  @Column({ name: 'xml_a_firmar_hash', type: 'char' })
  xmlAFirmarHash!: string;

  @Column({ type: 'jsonb', nullable: true })
  resultado!: { xadesXml?: string } | null;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn!: Date;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn!: Date;
}

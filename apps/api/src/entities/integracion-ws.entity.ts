import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type TipoIntegracionWs = 'FIRMA' | 'TSA' | 'OCSP' | 'CRL' | 'TSL' | 'NOTIF_EMAIL';
export type ModoIntegracionWs = 'SIMULADOR' | 'REAL' | 'DESHABILITADO';
export type AuthTipoIntegracionWs = 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY' | 'MTLS';

@Entity({ name: 'integracion_ws', schema: 'psdte' })
export class IntegracionWs {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  tipo!: TipoIntegracionWs;

  @Column({ type: 'varchar' })
  nombre!: string;

  @Column({ type: 'varchar' })
  modo!: ModoIntegracionWs;

  @Column({ name: 'base_url', type: 'text', nullable: true })
  baseUrl!: string | null;

  @Column({ type: 'jsonb' })
  endpoints!: Record<string, string>;

  @Column({ name: 'auth_tipo', type: 'varchar' })
  authTipo!: AuthTipoIntegracionWs;

  @Column({ name: 'credenciales_cifradas', type: 'text', nullable: true })
  credencialesCifradas!: string | null;

  @Column({ name: 'mtls_cert_cifrado', type: 'text', nullable: true })
  mtlsCertCifrado!: string | null;

  @Column({ name: 'mtls_key_cifrada', type: 'text', nullable: true })
  mtlsKeyCifrada!: string | null;

  @Column({ name: 'headers_extra', type: 'jsonb' })
  headersExtra!: Record<string, string>;

  @Column({ name: 'timeout_ms', type: 'int' })
  timeoutMs!: number;

  @Column({ type: 'smallint' })
  reintentos!: number;

  @Column({ name: 'backoff_ms', type: 'int' })
  backoffMs!: number;

  @Column({ name: 'mapeo_payload', type: 'jsonb' })
  mapeoPayload!: Record<string, unknown>;

  @Column({ name: 'verificar_tls', type: 'boolean' })
  verificarTls!: boolean;

  @Column({ type: 'boolean' })
  activo!: boolean;

  @Column({ name: 'ultimo_test', type: 'jsonb', nullable: true })
  ultimoTest!: Record<string, unknown> | null;

  @Column({ name: 'actualizado_por', type: 'uuid', nullable: true })
  actualizadoPor!: string | null;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn!: Date;
}

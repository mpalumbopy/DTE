// Puertos estables (ver docs/PLAN.md sección 6.1). El resto del sistema depende SOLO de estas
// interfaces; los adaptadores concretos (simulador o HTTP genérico) los resuelve ProviderFactory.

export interface FirmanteInfo {
  documento: string;
  tipoDocumento: string;
  nombre: string;
  email?: string;
}

export interface SolicitarFirmaRequest {
  solicitudId: string;
  /** Nodo a firmar, ya canonicalizado (C14N exclusivo). */
  xmlCanonico: Buffer;
  /** URIs adicionales a referenciar (encadenamiento de firmas, I7), p. ej. ['#eDTE...-002']. */
  referencias: string[];
  firmante: FirmanteInfo;
  rolFirmante: string;
  callbackUrl: string;
  expiraEn: Date;
}

export type EstadoSolicitudFirma = 'PENDIENTE' | 'ENVIADA' | 'FIRMADA' | 'RECHAZADA' | 'EXPIRADA';

export interface SolicitarFirmaResultado {
  providerRef: string;
  estado: 'ENVIADA' | 'FIRMADA';
  xadesXml?: string;
}

export interface ConsultarEstadoResultado {
  estado: EstadoSolicitudFirma;
  xadesXml?: string;
  detalle?: string;
}

export interface ValidacionFirma {
  valida: boolean;
  motivo?: string;
  firmante?: { documento?: string; nombre?: string };
  fechaFirma?: Date;
}

export interface PruebaConexionResultado {
  ok: boolean;
  latenciaMs: number;
  detalle: string;
}

export interface FirmaProviderPort {
  /** Inicia una solicitud de firma XAdES-T sobre un nodo XML canónico. Puede ser asíncrono. */
  solicitarFirma(req: SolicitarFirmaRequest): Promise<SolicitarFirmaResultado>;
  consultarEstado(providerRef: string): Promise<ConsultarEstadoResultado>;
  validarFirma(xadesXml: string, xmlContexto: Buffer): Promise<ValidacionFirma>;
  probarConexion(): Promise<PruebaConexionResultado>;
}

export interface SellarHashResultado {
  tokenTsrDer: Buffer;
  fecha: Date;
  tsaSubject: string;
}

export interface TsaProviderPort {
  /** Sella un hash SHA-256 (RFC 3161). */
  sellarHash(hashSha256: Buffer): Promise<SellarHashResultado>;
  probarConexion(): Promise<PruebaConexionResultado>;
}

export interface VerificarCertificadoResultado {
  resultado: 'GOOD' | 'REVOKED' | 'UNKNOWN';
  via: 'OCSP' | 'CRL';
  evidenciaRaw: Buffer;
  enTsl: boolean;
  cadenaOk: boolean;
}

export interface TslSnapshot {
  xml: Buffer;
  fecha: Date;
}

export interface RevocacionProviderPort {
  verificarCertificado(certDer: Buffer): Promise<VerificarCertificadoResultado>;
  obtenerTslSnapshot(): Promise<TslSnapshot>;
  probarConexion(): Promise<PruebaConexionResultado>;
}

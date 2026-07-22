import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export type TipoAuth = 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY' | 'MTLS';

export interface ConfigAuth {
  tipo: TipoAuth;
  usuario?: string;
  clave?: string;
  token?: string;
  apiKeyHeader?: string;
  apiKeyValor?: string;
  mtlsCertPem?: string;
  mtlsKeyPem?: string;
}

export interface ConfigClienteHttp {
  baseUrl: string;
  auth: ConfigAuth;
  headersExtra?: Record<string, string>;
  timeoutMs?: number;
  reintentos?: number;
  backoffMs?: number;
  verificarTls?: boolean;
}

export interface RespuestaHttp {
  status: number;
  cuerpo: unknown;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_REINTENTOS = 3;
const DEFAULT_BACKOFF_MS = 2000;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function construirHeadersAuth(auth: ConfigAuth): Record<string, string> {
  switch (auth.tipo) {
    case 'BASIC': {
      const credencial = Buffer.from(`${auth.usuario ?? ''}:${auth.clave ?? ''}`).toString('base64');
      return { Authorization: `Basic ${credencial}` };
    }
    case 'BEARER':
      return { Authorization: `Bearer ${auth.token ?? ''}` };
    case 'API_KEY':
      return auth.apiKeyHeader ? { [auth.apiKeyHeader]: auth.apiKeyValor ?? '' } : {};
    case 'MTLS':
    case 'NONE':
    default:
      return {};
  }
}

/** Error HTTP con el status de la respuesta, para que el llamador decida cómo mapearlo. */
export class ErrorHttpIntegracion extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cuerpo?: unknown,
  ) {
    super(message);
    this.name = 'ErrorHttpIntegracion';
  }
}

/**
 * Cliente HTTP genérico para integraciones externas (ver docs/PLAN.md sección 6.4): auth
 * NONE/BASIC/BEARER/API_KEY/MTLS, timeout, reintentos con backoff fijo. Sin dependencias externas
 * (usa http/https nativos de Node) para poder configurar mTLS con certificado/clave por integración.
 */
export class ClienteHttp {
  constructor(private readonly config: ConfigClienteHttp) {}

  async solicitar(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<RespuestaHttp> {
    const intentosMax = (this.config.reintentos ?? DEFAULT_REINTENTOS) + 1;
    let ultimoError: unknown;

    for (let intento = 1; intento <= intentosMax; intento += 1) {
      try {
        return await this.solicitarUnaVez(ruta, opciones);
      } catch (err) {
        ultimoError = err;
        if (intento < intentosMax) {
          await esperar(this.config.backoffMs ?? DEFAULT_BACKOFF_MS);
        }
      }
    }
    throw ultimoError;
  }

  private solicitarUnaVez(ruta: string, opciones: { metodo?: string; cuerpo?: unknown }): Promise<RespuestaHttp> {
    return new Promise((resolve, reject) => {
      const url = new URL(ruta, this.config.baseUrl);
      const esHttps = url.protocol === 'https:';
      const cuerpoJson = opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...construirHeadersAuth(this.config.auth),
        ...(this.config.headersExtra ?? {}),
      };
      if (cuerpoJson) {
        headers['Content-Length'] = String(Buffer.byteLength(cuerpoJson));
      }

      const opcionesRequest: https.RequestOptions = {
        method: opciones.metodo ?? (cuerpoJson ? 'POST' : 'GET'),
        headers,
        timeout: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      };

      if (esHttps) {
        opcionesRequest.rejectUnauthorized = this.config.verificarTls !== false;
        if (this.config.auth.tipo === 'MTLS') {
          opcionesRequest.cert = this.config.auth.mtlsCertPem;
          opcionesRequest.key = this.config.auth.mtlsKeyPem;
        }
      }

      const request = (esHttps ? https : http).request(url, opcionesRequest, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const texto = Buffer.concat(chunks).toString('utf8');
          let cuerpo: unknown = texto;
          try {
            cuerpo = texto ? JSON.parse(texto) : undefined;
          } catch {
            // respuesta no-JSON: se deja el texto crudo
          }
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve({ status, cuerpo });
          } else {
            reject(new ErrorHttpIntegracion(`HTTP ${status}`, status, cuerpo));
          }
        });
      });

      request.on('timeout', () => request.destroy(new ErrorHttpIntegracion('Timeout de la integración HTTP')));
      request.on('error', (err) => reject(err));

      if (cuerpoJson) {
        request.write(cuerpoJson);
      }
      request.end();
    });
  }
}

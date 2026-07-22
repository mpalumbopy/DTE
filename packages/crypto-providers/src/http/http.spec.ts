import * as http from 'http';
import { AddressInfo } from 'net';
import { ClienteHttp, ErrorHttpIntegracion } from './cliente-http';
import { FirmaHttpAdapter } from './firma-http.adapter';
import { TsaHttpAdapter } from './tsa-http.adapter';

interface ServidorPrueba {
  url: string;
  cerrar: () => Promise<void>;
  peticiones: Array<{ metodo: string; ruta: string; headers: http.IncomingHttpHeaders; cuerpo: unknown }>;
}

function iniciarServidorPrueba(manejador: http.RequestListener): Promise<ServidorPrueba> {
  return new Promise((resolve) => {
    const peticiones: ServidorPrueba['peticiones'] = [];
    const servidor = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const texto = Buffer.concat(chunks).toString('utf8');
        let cuerpo: unknown;
        try {
          cuerpo = texto ? JSON.parse(texto) : undefined;
        } catch {
          cuerpo = texto;
        }
        peticiones.push({ metodo: req.method ?? '', ruta: req.url ?? '', headers: req.headers, cuerpo });
        manejador(req, res);
      });
    });
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        peticiones,
        cerrar: () => new Promise((res) => servidor.close(() => res())),
      });
    });
  });
}

function responderJson(res: http.ServerResponse, status: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(texto);
}

describe('ClienteHttp (auth, mapeo, reintentos, timeout — F5 DoD)', () => {
  it('BASIC: envía el header Authorization correcto', async () => {
    const servidor = await iniciarServidorPrueba((_req, res) => responderJson(res, 200, { ok: true }));
    try {
      const cliente = new ClienteHttp({ baseUrl: servidor.url, auth: { tipo: 'BASIC', usuario: 'user', clave: 'pass' } });
      await cliente.solicitar('/x', { cuerpo: {} });
      const esperado = `Basic ${Buffer.from('user:pass').toString('base64')}`;
      expect(servidor.peticiones[0].headers.authorization).toBe(esperado);
    } finally {
      await servidor.cerrar();
    }
  });

  it('BEARER: envía el token correcto', async () => {
    const servidor = await iniciarServidorPrueba((_req, res) => responderJson(res, 200, { ok: true }));
    try {
      const cliente = new ClienteHttp({ baseUrl: servidor.url, auth: { tipo: 'BEARER', token: 'abc123' } });
      await cliente.solicitar('/x', { cuerpo: {} });
      expect(servidor.peticiones[0].headers.authorization).toBe('Bearer abc123');
    } finally {
      await servidor.cerrar();
    }
  });

  it('API_KEY: envía el header configurado', async () => {
    const servidor = await iniciarServidorPrueba((_req, res) => responderJson(res, 200, { ok: true }));
    try {
      const cliente = new ClienteHttp({
        baseUrl: servidor.url,
        auth: { tipo: 'API_KEY', apiKeyHeader: 'x-api-key', apiKeyValor: 'clave-secreta' },
      });
      await cliente.solicitar('/x', { cuerpo: {} });
      expect(servidor.peticiones[0].headers['x-api-key']).toBe('clave-secreta');
    } finally {
      await servidor.cerrar();
    }
  });

  it('NONE: no agrega header de autorización', async () => {
    const servidor = await iniciarServidorPrueba((_req, res) => responderJson(res, 200, { ok: true }));
    try {
      const cliente = new ClienteHttp({ baseUrl: servidor.url, auth: { tipo: 'NONE' } });
      await cliente.solicitar('/x', { cuerpo: {} });
      expect(servidor.peticiones[0].headers.authorization).toBeUndefined();
    } finally {
      await servidor.cerrar();
    }
  });

  it('reintenta con backoff ante fallas y eventualmente tiene éxito', async () => {
    let intentos = 0;
    const servidor = await iniciarServidorPrueba((_req, res) => {
      intentos += 1;
      if (intentos < 3) {
        res.writeHead(503);
        res.end();
        return;
      }
      responderJson(res, 200, { ok: true, intentos });
    });
    try {
      const cliente = new ClienteHttp({
        baseUrl: servidor.url,
        auth: { tipo: 'NONE' },
        reintentos: 3,
        backoffMs: 10,
      });
      const { cuerpo } = await cliente.solicitar('/x', { cuerpo: {} });
      expect((cuerpo as { intentos: number }).intentos).toBe(3);
    } finally {
      await servidor.cerrar();
    }
  });

  it('agota los reintentos y lanza el último error', async () => {
    const servidor = await iniciarServidorPrueba((_req, res) => {
      res.writeHead(500);
      res.end();
    });
    try {
      const cliente = new ClienteHttp({ baseUrl: servidor.url, auth: { tipo: 'NONE' }, reintentos: 1, backoffMs: 5 });
      await expect(cliente.solicitar('/x', { cuerpo: {} })).rejects.toThrow(ErrorHttpIntegracion);
    } finally {
      await servidor.cerrar();
    }
  });

  it('respeta el timeout configurado', async () => {
    const servidor = await iniciarServidorPrueba((_req, res) => {
      setTimeout(() => responderJson(res, 200, { ok: true }), 500);
    });
    try {
      const cliente = new ClienteHttp({ baseUrl: servidor.url, auth: { tipo: 'NONE' }, timeoutMs: 50, reintentos: 0 });
      await expect(cliente.solicitar('/x', { cuerpo: {} })).rejects.toThrow();
    } finally {
      await servidor.cerrar();
    }
  }, 10000);
});

describe('Adaptadores HTTP genéricos (mapeo de payload — F5 DoD)', () => {
  it('FirmaHttpAdapter arma el request desde la plantilla y mapea la respuesta (con map_estado)', async () => {
    const servidor = await iniciarServidorPrueba((_req, res) => {
      responderJson(res, 200, { data: { transactionId: 'tx-001', status: 'SIGNED' } });
    });
    try {
      const adapter = new FirmaHttpAdapter({
        cliente: { baseUrl: servidor.url, auth: { tipo: 'NONE' } },
        endpoints: { solicitarFirma: '/v1/sign', consultarEstado: '/v1/status/{providerRef}', validarFirma: '/v1/validate', probarConexion: '/v1/health' },
        mapeoPayload: {
          solicitarFirma: {
            request: { documento: '{{firmante.documento}}', refs: '{{referenciasCsv}}' },
            response: {
              providerRef: '$.data.transactionId',
              estado: '$.data.status',
              map_estado: { SIGNED: 'FIRMADA', WAITING: 'ENVIADA' },
            },
          },
        },
      });

      const resultado = await adapter.solicitarFirma({
        solicitudId: 'sol-1',
        xmlCanonico: Buffer.from('<x/>'),
        referencias: ['#a', '#b'],
        firmante: { documento: '123', tipoDocumento: 'CI', nombre: 'N' },
        rolFirmante: 'DEUDOR',
        callbackUrl: 'https://x',
        expiraEn: new Date(),
      });

      expect(resultado.providerRef).toBe('tx-001');
      expect(resultado.estado).toBe('FIRMADA');
      expect(servidor.peticiones[0].cuerpo).toEqual({ documento: '123', refs: '#a,#b' });
    } finally {
      await servidor.cerrar();
    }
  });

  it('TsaHttpAdapter mapea tokenB64 a Buffer', async () => {
    const tokenOriginal = Buffer.from('token-rfc3161-de-prueba');
    const servidor = await iniciarServidorPrueba((_req, res) => {
      responderJson(res, 200, { token: tokenOriginal.toString('base64') });
    });
    try {
      const adapter = new TsaHttpAdapter({
        cliente: { baseUrl: servidor.url, auth: { tipo: 'NONE' } },
        endpoints: { sellarHash: '/v1/tsa', probarConexion: '/v1/health' },
        mapeoPayload: {
          sellarHash: { request: { hashHex: '{{hashHex}}' }, response: { tokenB64: '$.token' } },
        },
      });
      const resultado = await adapter.sellarHash(Buffer.from('hash-simulado'));
      expect(resultado.tokenTsrDer.equals(tokenOriginal)).toBe(true);
    } finally {
      await servidor.cerrar();
    }
  });
});

import { ErrorDominio } from '@psdte/shared';
import { FirmaProviderPort, RevocacionProviderPort, TsaProviderPort } from './ports';

/** Rechaza toda operación con ERR-PKI-503 (ver docs/PLAN.md sección 6.2: modo DESHABILITADO). */
export class ProveedorDeshabilitado implements FirmaProviderPort, TsaProviderPort, RevocacionProviderPort {
  constructor(private readonly nombreIntegracion: string) {}

  private rechazar(): never {
    throw new ErrorDominio('ERR-PKI-503', `Integración "${this.nombreIntegracion}" deshabilitada`);
  }

  solicitarFirma(): never {
    return this.rechazar();
  }

  consultarEstado(): never {
    return this.rechazar();
  }

  validarFirma(): never {
    return this.rechazar();
  }

  sellarHash(): never {
    return this.rechazar();
  }

  verificarCertificado(): never {
    return this.rechazar();
  }

  obtenerTslSnapshot(): never {
    return this.rechazar();
  }

  async probarConexion() {
    return { ok: false, latenciaMs: 0, detalle: `Integración "${this.nombreIntegracion}" deshabilitada` };
  }
}

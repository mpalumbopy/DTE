/** Formato uniforme de error de la API (ver plan sección 5.2). Códigos concretos llegan en F1-F3 desde CAT-DTE-10. */
export interface ErrorApiPsdte {
  error: string;
  mensaje: string;
  detalle?: Record<string, unknown>;
  requestId: string;
  timestamp: string;
}

export class ErrorDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly detalle?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}

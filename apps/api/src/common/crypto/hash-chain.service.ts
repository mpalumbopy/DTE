import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

function stringificarEstable(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor);
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(stringificarEstable).join(',')}]`;
  }
  const claves = Object.keys(valor as Record<string, unknown>).sort();
  const cuerpo = claves
    .map((clave) => `${JSON.stringify(clave)}:${stringificarEstable((valor as Record<string, unknown>)[clave])}`)
    .join(',');
  return `{${cuerpo}}`;
}

/**
 * Calcula el hash encadenado (I5) usado por auditoria_log y, más adelante, por dte_evento.
 * hash_registro = SHA-256(hash_anterior || JSON-canónico(registro)).
 */
@Injectable()
export class HashChainService {
  calcularHash(registro: Record<string, unknown>, hashAnterior: string | null): string {
    const hash = createHash('sha256');
    hash.update(hashAnterior ?? '');
    hash.update(stringificarEstable(registro));
    return hash.digest('hex');
  }
}

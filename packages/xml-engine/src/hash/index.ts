import { createHash } from 'crypto';

/** SHA-256 en hexadecimal (64 caracteres) — formato usado por hash_evento/hash_registro/hash_sha256 en BD. */
export function sha256Hex(datos: string | Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}

/** SHA-256 en base64 — formato usado por ds:DigestValue en XML-DSig. */
export function sha256Base64(datos: string | Buffer): string {
  return createHash('sha256').update(datos).digest('base64');
}

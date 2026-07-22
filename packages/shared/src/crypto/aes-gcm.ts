import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITMO = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function cargarClave(claveBase64: string): Buffer {
  const clave = Buffer.from(claveBase64, 'base64');
  if (clave.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY debe decodificar a exactamente 32 bytes (AES-256)');
  }
  return clave;
}

/** Cifra un texto plano con AES-256-GCM. Salida: base64(iv || authTag || ciphertext). */
export function cifrarAesGcm(textoPlano: string, claveBase64: string): string {
  const clave = cargarClave(claveBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, cifrado]).toString('base64');
}

/** Descifra un valor producido por cifrarAesGcm. Lanza si la clave o el authTag no coinciden. */
export function descifrarAesGcm(valorCifrado: string, claveBase64: string): string {
  const clave = cargarClave(claveBase64);
  const buffer = Buffer.from(valorCifrado, 'base64');
  const iv = buffer.subarray(0, IV_BYTES);
  const authTag = buffer.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const cifrado = buffer.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITMO, clave, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
}

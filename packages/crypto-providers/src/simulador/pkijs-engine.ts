import { webcrypto } from 'crypto';
import { setEngine } from 'pkijs';

let inicializado = false;

/** Registra el motor WebCrypto nativo de Node en pkijs (idempotente). */
export function asegurarMotorPkijs(): void {
  if (inicializado) {
    return;
  }
  setEngine('nodejs', webcrypto as unknown as Crypto, webcrypto as unknown as SubtleCrypto);
  inicializado = true;
}

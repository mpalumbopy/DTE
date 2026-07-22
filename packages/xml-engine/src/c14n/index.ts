import { XmlCanonicalizer } from 'xmldsigjs';
import { asegurarEntornoNodeXml } from '../bootstrap-node';

/**
 * Canonicalización C14N exclusiva sin comentarios (la única usada en este perfil, ver
 * docs/PLAN.md sección 7). Devuelve el string canónico; `Buffer.from(resultado, 'utf8')` para
 * hashear/firmar.
 */
export function canonicalizarExclusivo(nodo: Node): string {
  asegurarEntornoNodeXml();
  const canonicalizador = new XmlCanonicalizer(false, true);
  return canonicalizador.Canonicalize(nodo);
}

import { webcrypto } from 'crypto';
import * as xmldom from '@xmldom/xmldom';
import * as xpath from 'xpath';
import { Application, setNodeDependencies } from 'xadesjs';

let inicializado = false;

/**
 * Registra el motor WebCrypto nativo de Node y el DOM/XPath usados por xmldsigjs/xadesjs.
 * Debe llamarse antes de cualquier Parse/Sign/Verify (idempotente).
 */
export function asegurarEntornoNodeXml(): void {
  if (inicializado) {
    return;
  }
  setNodeDependencies({
    XMLSerializer: xmldom.XMLSerializer,
    DOMParser: xmldom.DOMParser,
    DOMImplementation: xmldom.DOMImplementation,
    xpath,
  } as never);
  Application.setEngine('NodeJS', webcrypto as never);
  inicializado = true;
}

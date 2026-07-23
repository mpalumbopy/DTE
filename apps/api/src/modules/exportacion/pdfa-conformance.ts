export interface ResultadoConformidadPdfA {
  conforme: boolean;
  motivos: string[];
  herramienta: string;
}

export interface PdfaConformanceChecker {
  verificar(pdfBytes: Buffer): Promise<ResultadoConformidadPdfA>;
}

/**
 * Chequeo PDF/A **estructural**, no un reemplazo de veraPDF (el plan lo nombra explícitamente —
 * ver docs/PLAN.md sección 9): valida cabecera PDF, presencia de `/OutputIntent` (perfil de color
 * de salida, obligatorio en PDF/A) y de metadata XMP `pdfaid:part`/`pdfaid:conformance`, y ausencia
 * de cifrado (prohibido en PDF/A). No verifica el árbol completo de conformidad ISO 19005 (fuentes
 * embebidas, transparencia, etc.) — eso requiere el validador real. Simulador conmutable, mismo
 * patrón que `packages/crypto-providers` para firma/TSA/OCSP: se reemplaza por un adaptador que
 * invoque el binario real de veraPDF cuando esté disponible en la imagen del worker (F13), sin
 * tocar el resto de `ExportacionService` (ver ADR en docs/DECISIONES.md).
 */
export class VerificadorPdfaEstructural implements PdfaConformanceChecker {
  async verificar(pdfBytes: Buffer): Promise<ResultadoConformidadPdfA> {
    const motivos: string[] = [];
    const texto = pdfBytes.toString('latin1');

    if (!texto.startsWith('%PDF-')) {
      motivos.push('No es un PDF válido: falta la cabecera %PDF-');
    }
    if (!texto.includes('/OutputIntent')) {
      motivos.push('Falta /OutputIntent: PDF/A exige declarar el perfil de color de salida');
    }
    if (!texto.includes('pdfaid:part') || !texto.includes('pdfaid:conformance')) {
      motivos.push('Falta metadata XMP pdfaid:part/pdfaid:conformance');
    }
    if (/\/Encrypt\s/.test(texto)) {
      motivos.push('PDF/A no permite documentos cifrados');
    }

    return Promise.resolve({ conforme: motivos.length === 0, motivos, herramienta: 'SIMULADOR_ESTRUCTURAL' });
  }
}

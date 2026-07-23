'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCodigo({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    QRCode.toDataURL(url, { margin: 1, width: 160 })
      .then((resultado) => {
        if (!cancelado) setDataUrl(resultado);
      })
      .catch(() => {
        if (!cancelado) setDataUrl(null);
      });
    return () => {
      cancelado = true;
    };
  }, [url]);

  if (!dataUrl) return null;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt={`Código QR de verificación: ${url}`} width={160} height={160} data-testid="qr-verificacion" />;
}

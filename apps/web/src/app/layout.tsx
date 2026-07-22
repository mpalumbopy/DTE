import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PSDTE — Pagaré Electrónico',
  description: 'Prestador de Servicios de DTE — Pagaré Electrónico (Paraguay)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PY">
      <body>{children}</body>
    </html>
  );
}

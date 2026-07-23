#!/usr/bin/env node
import { readFileSync } from 'fs';
import { verificarContenedorOffline } from '../contenedor';

async function main(): Promise<void> {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error('Uso: pnpm verificar <contenedor.zip>');
    process.exit(1);
  }
  const zip = readFileSync(ruta);
  const resultado = await verificarContenedorOffline(zip);
  console.log(JSON.stringify(resultado, null, 2));
  process.exit(resultado.valido ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

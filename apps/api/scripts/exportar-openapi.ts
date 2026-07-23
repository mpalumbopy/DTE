import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

/**
 * F14 DoD (docs/PLAN.md sección 12/13): "exportar OpenAPI a docs/API.md". Reusa la MISMA
 * `DocumentBuilder` que `main.ts` monta en `/api/docs` para no mantener dos definiciones — este
 * script solo levanta la app sin `.listen()`, genera el documento y lo vuelca a Markdown.
 * Requiere DATABASE_URL/REDIS_URL alcanzables (arranca la app real, TypeOrmModule se conecta al
 * bootstrapear) — pensado para correr en dev/CI, no en el build de producción.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const documento = new DocumentBuilder()
    .setTitle('PSDTE API')
    .setDescription('Pagaré electrónico — Paraguay (ver docs/PLAN.md)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const openapi = SwaggerModule.createDocument(app, documento);

  const rutaJson = join(__dirname, '../../../docs/openapi.json');
  writeFileSync(rutaJson, JSON.stringify(openapi, null, 2));

  const rutaMd = join(__dirname, '../../../docs/API.md');
  writeFileSync(rutaMd, generarMarkdown(openapi));

  // eslint-disable-next-line no-console
  console.log(`Exportado: ${rutaJson} y ${rutaMd}`);
  await app.close();
  process.exit(0);
}

const METODOS_ORDEN = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Ningún controller usa `@ApiTags()` todavía, así que se infiere una categoría razonable del
 * primer segmento de ruta significativo (ignora el prefijo de versión `v1`) — mejor que agrupar
 * todo bajo "Sin categoría". */
function inferirTagDesdeRuta(ruta: string): string {
  const segmentos = ruta.split('/').filter(Boolean);
  const util = segmentos.filter((s) => !['api', 'v1'].includes(s) && !s.startsWith('{'));
  return util[0] ?? 'raiz';
}

function generarMarkdown(openapi: OpenAPIObject): string {
  const lineas: string[] = [];
  lineas.push('# API — PSDTE (OpenAPI exportado)');
  lineas.push('');
  lineas.push(
    `Generado automáticamente por \`apps/api/scripts/exportar-openapi.ts\` (\`pnpm --filter @psdte/api docs:openapi\`) a partir de los decoradores de NestJS/Swagger — no editar a mano, se sobreescribe en cada corrida. El documento completo (JSON) queda en \`docs/openapi.json\`; la UI interactiva vive en \`/api/docs\` cuando \`NODE_ENV !== 'production'\`.`,
  );
  lineas.push('');
  lineas.push(
    'Nota: ningún controller usa todavía `@ApiOperation`/`@ApiResponse`/`@ApiTags` — las categorías de abajo se infieren del primer segmento de ruta, y las descripciones de respuesta quedan vacías más allá del código HTTP. Agregar esos decoradores es una mejora de documentación pendiente, no bloqueante de ningún DoD.',
  );
  lineas.push('');
  lineas.push(`**Versión:** ${openapi.info.version} · **Título:** ${openapi.info.title}`);
  lineas.push('');

  const porTag = new Map<string, Array<{ path: string; method: string; op: NonNullable<OpenAPIObject['paths'][string]['get']> }>>();
  for (const [ruta, operaciones] of Object.entries(openapi.paths)) {
    for (const metodo of METODOS_ORDEN) {
      const op = (operaciones as Record<string, unknown>)[metodo] as NonNullable<OpenAPIObject['paths'][string]['get']> | undefined;
      if (!op) continue;
      const tag = op.tags?.[0] ?? inferirTagDesdeRuta(ruta);
      if (!porTag.has(tag)) porTag.set(tag, []);
      porTag.get(tag)!.push({ path: ruta, method: metodo, op });
    }
  }

  for (const tag of Array.from(porTag.keys()).sort()) {
    lineas.push(`## ${tag}`);
    lineas.push('');
    for (const { path, method, op } of porTag.get(tag)!) {
      lineas.push(`### \`${method.toUpperCase()} ${path}\``);
      if (op.summary) lineas.push(op.summary);
      if (op.description) lineas.push(op.description);
      lineas.push('');
      if (op.parameters?.length) {
        lineas.push('**Parámetros:**');
        lineas.push('');
        lineas.push('| Nombre | En | Requerido | Descripción |');
        lineas.push('|---|---|---|---|');
        for (const parametro of op.parameters as unknown as Array<Record<string, unknown>>) {
          lineas.push(
            `| \`${parametro.name}\` | ${parametro.in} | ${parametro.required ? 'sí' : 'no'} | ${parametro.description ?? ''} |`,
          );
        }
        lineas.push('');
      }
      const respuestas = Object.entries(op.responses ?? {});
      if (respuestas.length) {
        lineas.push('**Respuestas:** ' + respuestas.map(([codigo, r]) => `\`${codigo}\` ${(r as { description?: string }).description ?? ''}`).join(' · '));
        lineas.push('');
      }
    }
  }

  return lineas.join('\n');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});

# CLAUDE.md — Resumen operativo (PSDTE / Pagaré Electrónico)

Este archivo resume `docs/PLAN.md` para trabajo día a día. Ante cualquier duda de detalle, el
plan completo manda.

## Qué es esto

Sistema PSDTE (Prestador de Servicios de DTE) para pagaré electrónico (Paraguay, Ley 6822/2021).
Servicios núcleo: emisión, registro, custodia, consulta/verificación, endoso, pagos, bloqueos por
autoridad, cancelación, exportación probatoria y preservación ≥10 años con resellado LTV.

El **XML firmado** es la fuente de verdad jurídica; PostgreSQL es la proyección operativa.

Los web services reales de firma digital/TSA/OCSP-CRL-TSL **no existen aún**. Todo se desarrolla
contra un **SIMULADOR** conmutable (`packages/crypto-providers`), con una UI de administración
(`/admin/integraciones`) para cargar los reales cuando estén disponibles, sin recompilar.

## Invariantes críticas (NO NEGOCIABLES — nunca degradar para pasar un test)

| # | Invariante | Cómo se garantiza |
|---|---|---|
| I1 | ID-DTE único, jamás reutilizado | `UNIQUE(id_dte)`; nunca DELETE de `dte` |
| I2 | Un solo tenedor vigente por DTE | índice único parcial + `EXCLUDE gist` |
| I3 | Anti doble disposición | toda mutación pasa por `fn_aplicar_evento` con `FOR UPDATE`; `EventosService` es la única puerta |
| I4 | Append-only (eventos, versiones XML, evidencias, auditoría) | triggers rechazan UPDATE/DELETE |
| I5 | Trazabilidad por hash encadenado | `dte_evento.hash_evento/hash_anterior`, `auditoria_log` |
| I6 | Transiciones válidas | validadas contra `cat_transicion` dentro de `fn_aplicar_evento` |
| I7 | Encadenamiento de firmas | firma del evento N referencia `#evento_N` y `#evento_N-1` |
| I8 | El XML manda | job de reconciliación XML↔BD; discrepancia → incidencia |
| I9 | Sin claves privadas de terceros | firma vía provider externo o simulador, nunca custodiada |
| I10 | Operaciones nunca a medias | transacción completa o `PENDIENTE_*`; idempotencia por `Idempotency-Key` |

## Reglas de ejecución

1. Fases en orden estricto F0→F14 (`docs/PLAN.md` sección 13). Cada fase cierra con su DoD en verde.
2. Commit por fase: `git add -A && git commit -m "feat(F<N>): <resumen>"`.
3. Ante ambigüedad: decisiones por defecto (sección 0.4 del plan). No bloquearse esperando respuesta.
4. El código de producción **nunca** importa el simulador directamente — solo vía `ProviderFactory`.
5. Node 20 LTS, pnpm 9, TypeScript estricto en todo el monorepo.
6. Sustituciones de librería → documentar ADR corto en `docs/DECISIONES.md`.
7. Actualizar `docs/ESTADO.md` al cierre de cada fase.

## Comandos

```bash
pnpm install
docker compose -f infra/dev/docker-compose.yml up -d   # postgres, redis, mailhog
pnpm db:reset      # migraciones + seeds
pnpm dev           # api + web en paralelo
pnpm build && pnpm lint && pnpm typecheck && pnpm test:cov
```

## Estructura

Ver `docs/PLAN.md` sección 0.3. Resumen: `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared`,
`packages/xml-engine`, `packages/crypto-providers`, `db/migrations`, `infra/k8s`.

## Estado y decisiones

- Progreso y DoD ejecutado por fase: `docs/ESTADO.md`.
- ADRs / sustituciones de librerías: `docs/DECISIONES.md`.

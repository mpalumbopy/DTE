# ESTADO DEL PROYECTO — PSDTE / Pagaré Electrónico

Bitácora de fases. Se actualiza al cierre de cada fase (ver `docs/PLAN.md` sección 0.1.10).

## F0 — Scaffolding del monorepo

- **Fecha:** 2026-07-22
- **Estado:** ✅ completa
- **DoD ejecutado:**
  - Estructura de monorepo pnpm workspaces + turbo creada según sección 0.3 del plan.
  - `apps/api` (NestJS 10), `apps/web` (Next.js 14 App Router), `packages/shared|xml-engine|crypto-providers` (esqueletos compilables).
  - `infra/dev/docker-compose.yml` (postgres:15, redis:7, mailhog) — ver ADR-002 sobre Docker no disponible en este sandbox.
  - CI base (`.github/workflows/ci.yml`): install → lint → typecheck → build → test → audit.
  - `CLAUDE.md` generado con resumen operativo.
  - `pnpm install && pnpm build && pnpm lint && pnpm typecheck && pnpm test:cov` → verde (8/8 tareas, 5 paquetes).
  - Servicios de desarrollo verificados sanos (Postgres 16 y Redis nativos, ver ADR-002; `docker compose` queda listo para una máquina con Docker funcional).
  - Commit `feat(F0): scaffolding del monorepo`.
- **Pendiente:** ninguno para F0. F1 (BD) y F4 (xml-engine) esperan los insumos de referencia (ver sección "Insumos de referencia").

## Insumos de referencia

- `db/modelo_datos_psdte.sql` (DDL de referencia) y el XML firmado de referencia del pagaré **no estaban incluidos** en el material provisto junto al plan. El usuario indicó que los subiría antes de F1/F4. Hasta que lleguen, F1 y F4 quedan bloqueados; el resto de las fases de F0 (scaffolding) no dependen de ellos y se ejecutan igual.

## Próximos pasos

- F1 (Base de datos): pendiente de recibir `db/modelo_datos_psdte.sql`.
- F4 (xml-engine): pendiente de recibir el XML de referencia firmado.

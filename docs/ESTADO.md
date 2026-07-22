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

## F1 — Base de datos

- **Fecha:** 2026-07-22
- **Estado:** ✅ completa
- **DoD ejecutado:**
  - `db/modelo_datos_psdte.sql` (DDL de referencia, provisto por el usuario) convertido en 15 migraciones
    ordenadas `db/migrations/001..015` (extensiones → catálogos → seguridad → personas → núcleo DTE →
    tenencia → eventos → detalle de eventos → probatoria → operación → auditoría/incidencias →
    `fn_aplicar_evento` → integraciones, sección 4.1 del plan), formato `-- Up/Down Migration` de
    node-pg-migrate, todo bajo esquema `psdte` con objetos completamente calificados.
  - Seeds idempotentes `db/seeds/data/01..05` (catálogos CAT-DTE-01..10, geografía mínima, roles/permisos
    propios — ADR-003 —, `parametro_sistema`, `integracion_ws` en modo SIMULADOR por tipo) + `run-seeds.ts`
    (paquete `@psdte/db-seeds`) que además siembra usuarios demo (`SEED_DEMO=true`) con password Argon2id
    y secreto MFA cifrado con AES-256-GCM (`packages/shared/src/crypto/aes-gcm.ts`, nuevo, con tests).
  - `pnpm db:reset` (dev) y `pnpm db:reset:test` (test) corren limpios de punta a punta.
  - Tests de invariantes `apps/api/test/db/invariantes-f1.e2e-spec.ts` (Jest + `pg` directo, ver ADR-006):
    doble tenencia vigente rechazada (I2), UPDATE/DELETE sobre `dte_evento` rechazado (I4), transición no
    seedeada → `ERR-ESTADO-001`, `fn_aplicar_evento` camino feliz con encadenamiento de hashes (I5) y
    actualización del estado vigente — 4/4 verde.
  - CI actualizado: crea `psdte_test`, corre `db:reset:test` y `test:e2e`.
  - `pnpm build/lint/typecheck/test:cov` siguen en verde con los 2 paquetes nuevos (`@psdte/db-seeds`,
    más `packages/shared/src/crypto`).
- **Decisiones registradas:** ADR-003 (roles/permisos y geografía propios), ADR-004 (ambigüedad de
  `fn_aplicar_evento` en transiciones de PAGO — acción pendiente en F7), ADR-005 (escenario demo completo
  diferido a F7), ADR-006 (tests de integración sin Testcontainers).
- **Pendiente:** el escenario demo completo (1 DTE emitido+endosado+pagado/cancelado) queda para el cierre
  de F7 (ADR-005). El XML de referencia firmado sigue sin recibirse: F4 continúa bloqueada.

## F2 — Config, salud, auth y usuarios

- **Fecha:** 2026-07-22
- **Estado:** ✅ completa
- **DoD ejecutado:**
  - Config validada con zod (`config/config.schema.ts`) vía `@nestjs/config`; `.env`/`.env.test` cargados
    según `NODE_ENV`. Claves JWT RS256 y `APP_ENCRYPTION_KEY` generadas para desarrollo/test.
  - pino estructurado (`nestjs-pino`) + `requestId` vía `AsyncLocalStorage`
    (`common/context/request-context.ts` + `RequestIdMiddleware`), presente en cada línea de log y en el
    header `X-Request-Id` de cada respuesta.
  - `CatalogoErrorFilter` global: toda excepción (`ErrorDominio`, `HttpException` o error no controlado) se
    responde con el formato uniforme de la sección 5.2 del plan, resolviendo `http_status`/`mensaje` contra
    `cat_error` (cache 5 min).
  - `GET /healthz`, `/readyz` (BD + Redis; el chequeo del ProviderFactory se agrega en F5) y `/metrics`
    (Prometheus vía `prom-client`), sin versión de URI (`VERSION_NEUTRAL`) — se detectó y corrigió un bug
    real donde quedaban bajo `/api/v1/` por el versionado global.
  - `AuthModule` completo: `POST /auth/login` (con rate-limit 5/min/IP), `POST /auth/mfa/verify`,
    `POST /auth/refresh` (rotación con detección de reuso y revocación de familia completa, ADR-007),
    `POST /auth/logout`, `POST /auth/mfa/enrol` (TOTP + QR). Guards `JwtAuthGuard`/`RolesGuard`/`MfaGuard` +
    decoradores `@Publico`/`@Roles`/`@RequiereMfa`/`@UsuarioActual`.
  - `UsuariosModule` (CRUD + gestión de roles, `ADMIN_PSDTE` únicamente).
  - `AuditoriaInterceptor` + `AuditoriaService`: cada mutación HTTP (exitosa o rechazada) queda en
    `auditoria_log` con hash encadenado, serializado con `SELECT ... FOR UPDATE` sobre la última fila (la
    tabla de referencia no tiene una función equivalente a `fn_aplicar_evento` para esto).
  - Tests: unitarios (`hash-chain.service.spec.ts`, más los de F1) y e2e reales contra `psdte_test`
    (`apps/api/test/auth/auth-flow.e2e-spec.ts`, 6 casos): login admin exige MFA → TOTP correcto emite
    tokens y accede a `/usuarios`; credenciales inválidas → `ERR-AUTH-001`; TOTP inválido → `ERR-AUTH-003`;
    rol no crítico sin MFA; rotación de refresh + reuso revoca la familia completa; `auditoria_log`
    encadena hashes correctamente — 10/10 verde (junto con los 4 de F1).
  - Verificado manualmente contra el servidor real (`node dist/main.js`): `/healthz`, `/readyz`, `/metrics`,
    `/api/docs` (Swagger) y el flujo de login responden como se espera.
  - `pnpm build/lint/typecheck/test:cov` en verde.
- **Decisiones registradas:** ADR-007 (columnas de familia de sesión, no están en el DDL de referencia),
  ADR-008 (bug de caché incremental de TypeScript entre `build` y `typecheck`, resuelto quitando
  `incremental` del tsconfig base), ADR-009 (`.env.test` commiteado a propósito).
- **Pendiente:** ninguno para F2. El chequeo de integraciones activas en `/readyz` y el candado
  `ALLOW_SIMULATOR` llegan con F5.

## F3 — Catálogos, personas, parámetros

- **Fecha:** 2026-07-22
- **Estado:** ✅ completa
- **DoD ejecutado:**
  - `CatalogosModule`: `GET /catalogos/:codigo` (autenticado, cualquier rol) resuelve CAT-DTE-01..10 contra
    sus tablas reales, cache de 5 min en memoria, header `X-Catalogos-Version`. Entidades TypeORM nuevas
    para los catálogos que aún no las tenían (`cat_estado_dte`, `cat_tipo_evento`, `cat_transicion`,
    `cat_acto_externo`, `cat_causal_bloqueo`, `cat_tipo_evidencia`, `cat_nivel_consulta`,
    `cat_tipo_notificacion`, `cat_permiso`, `cat_rol_permiso`).
  - `PersonasModule`: CRUD + búsqueda por documento (`GET /personas?documento=`), unicidad
    `(tipo_documento, numero_documento, pais_documento)` mapeada a `ERR-PERSONA-409` ante violación;
    restringido a `ADMIN_PSDTE`/`OPERADOR_EMISION`.
  - `ParametrosModule`: `GET /parametros`, `PUT /parametros/:clave` (respeta `editable`, `ERR-PARAM-403`/
    `ERR-PARAM-404`), solo `ADMIN_PSDTE`.
  - Tipos compartidos generados desde los seeds: `db/seeds/generar-tipos-compartidos.ts` (nuevo script,
    corre automáticamente al final de `pnpm db:seed`) vuelca `CAT_ESTADO_DTE`, `CAT_TIPO_EVENTO`,
    `CAT_ROL_CODIGOS`, `CAT_ERROR_CODIGOS` y `CAT_PERMISO_CODIGOS` a
    `packages/shared/src/generated/catalogos.generated.ts` (commiteado; se regenera con cada seed).
  - Tests e2e reales (`apps/api/test/catalogos-personas/catalogos-personas.e2e-spec.ts`, 8 casos):
    catálogos requieren auth, `GET /catalogos/CAT-DTE-03` responde la matriz sembrada (incluye el DoD
    explícito de la fase), `CAT-DTE-01`, catálogo inexistente → `ERR-DTE-404`, alta/duplicado/búsqueda de
    persona, rol sin permiso → 403, listar/actualizar parámetros y sus errores. 18/18 verde junto con F1/F2.
  - `pnpm build/lint/typecheck/test:cov` en verde.
- **Bugs reales encontrados y corregidos en el camino:**
  - `ActualizarParametroDto.valor` sin ningún decorador de `class-validator` quedaba fuera del whitelist
    global (`whitelist:true` + `forbidNonWhitelisted:true`) y toda actualización de parámetro devolvía 400.
    Corregido con `@IsDefined()`.
  - Condición de carrera real en `AuditoriaService` con `auditoria_log` vacía (ver ADR-010): el
    `FOR UPDATE` sobre "la última fila" no sirve de nada si no hay ninguna fila. Corregido con
    `pg_advisory_xact_lock`.
- **Decisiones registradas:** ADR-010 (advisory lock en auditoría).
- **Pendiente:** ninguno para F3.

## F4 — xml-engine (parcial: C14N, hash, XAdES-T)

- **Fecha:** 2026-07-22
- **Estado:** 🟡 parcial (ver ADR-011) — `builder`/`validator`/XSD provisional siguen bloqueados por el
  XML de referencia
- **Hecho:**
  - `packages/xml-engine/src/hash`: SHA-256 hex/base64.
  - `packages/xml-engine/src/c14n`: canonicalización C14N exclusiva (vía `xmldsigjs`).
  - `packages/xml-engine/src/xades`: `firmarNodoXadesBes` + `completarConSelloTiempo` (XAdES-T real:
    SignedProperties, SigningTime, referencias múltiples incluyendo encadenamiento a otro nodo por Id —
    I7 —, y `xades:SignatureTimeStamp` embebido) + `validarFirmaXades`, sobre el WebCrypto nativo de
    Node 20 (sin dependencias de `@peculiar/webcrypto`).
  - Tests reales (no mocks): firma válida, detección de alteración del contenido firmado, detección de
    alteración de un nodo referenciado (I7), presencia del sello de tiempo embebido, determinismo de
    C14N+hash. 8/8 verde, 92 % cobertura.
- **Pendiente:** `builder/` (genera el XML del perfil desde objetos de dominio), `validator/` (XSD +
  semántica) y `schema/pagare-dte.provisional.xsd` (ingeniería inversa del XML de referencia) — bloqueados
  hasta recibir el XML correcto del pagaré.
- **Decisiones registradas:** ADR-011.

## Insumos de referencia

- `db/modelo_datos_psdte.sql`: **recibido** (2026-07-22), usado en F1.
- XML firmado de referencia del pagaré: **pendiente**. Un primer intento de subida (2026-07-22) resultó
  ser un archivo no relacionado (un "Diploma Digital" del MEC de Brasil, namespace
  `http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd`) — se avisó al usuario y se descartó sin
  usarlo. El resto de F4 (builder/validator/XSD) sigue bloqueado hasta recibir el XML correcto.

## Próximos pasos

- F4 (xml-engine): builder/validator/XSD pendientes de recibir el XML de referencia firmado del pagaré.
- F5 (crypto-providers/simulador): no depende de insumos externos, en curso.

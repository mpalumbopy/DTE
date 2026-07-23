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

## F4 — xml-engine

- **Fecha:** 2026-07-22
- **Estado:** ✅ completa (cerrada tras recibir el XML de referencia — ver ADR-014)
- **Hecho (parte genérica, cerrada primero — ver ADR-011):**
  - `packages/xml-engine/src/hash`: SHA-256 hex/base64.
  - `packages/xml-engine/src/c14n`: canonicalización C14N exclusiva (vía `xmldsigjs`).
  - `packages/xml-engine/src/xades`: `firmarNodoXadesBes` + `completarConSelloTiempo` (XAdES-T real:
    SignedProperties, SigningTime, referencias múltiples incluyendo encadenamiento a otro nodo por Id —
    I7 —, y `xades:SignatureTimeStamp` embebido) + `validarFirmaXades`, sobre el WebCrypto nativo de
    Node 20 (sin dependencias de `@peculiar/webcrypto`). Extendido luego (ADR-015) con
    `uriNodoPrincipal`/`nodoDestino` para firmar un nodo anidado específico, no solo la raíz.
- **Hecho (perfil pagaré-DTE real, tras recibir el XML de referencia — ver ADR-014):**
  - `packages/xml-engine/test/fixtures/pagare-referencia-firmado.xml`: copia verbatim (MD5 verificado)
    del XML de referencia provisto por el usuario.
  - `packages/xml-engine/schema/pagare-dte.provisional.xsd`: XSD reverse-engineered de la estructura real
    (elementos, orden, cardinalidades, incluidas las asimetrías de nombres observadas), con los puntos a
    confirmar documentados en el propio archivo — sin `xs:import` a esquemas remotos (ADR-017).
  - `packages/xml-engine/src/modelo/tipos.ts`: modelo de dominio (persona física únicamente — jurídica y
    BLOQUEO quedan fuera, no demostrados en la referencia).
  - `packages/xml-engine/src/monto-letras`: conversor monto→letras es-PY (soporta hasta 999.999.999.999,
    fracción "con NN/100"), 25 casos de test.
  - `packages/xml-engine/src/builder`: `construirDatosGeneralesDte` + `agregarEvento` (ENDOSO/PAGO/
    CANCELACION), con resolución obligatoria de placeholders `[Clave]` (`ErrorPlaceholderSinResolver` si
    sobrevive alguno) — reproduce byte a byte el patrón de campos observado en el XML real, incluidas sus
    inconsistencias de nomenclatura (se preservan, no se "corrigen": I8, el XML manda).
  - `packages/xml-engine/src/parser`: `parsearDte`, tolerante — lee el XML de referencia real completo (9
    firmas, 4 eventos), extrae el modelo de negocio, y reporta las inconsistencias conocidas
    (`numeroEvento` no secuencial, placeholders sin resolver) como `avisos`, nunca como error.
  - `packages/xml-engine/src/validator`: `validarContraXsd` (libxmljs2, `{nonet:true, noent:false,
    dtdload:false}`) + `validarSemantica` (monto↔letras, vencimiento > emisión, `condicionFirmante`
    única, coherencia temporal de eventos).
  - Test de integración (`builder/firma-integracion.spec.ts`): construye datos generales + un evento de
    endoso, firma 3+2 veces con `xades` directamente (sin mocks), sobre nodos anidados distintos, y
    verifica que las 5 firmas validan de forma independiente y que alterar el evento no invalida las
    firmas de emisión — reproduce el patrón exacto del XML real.
  - `pnpm --filter xml-engine test` → 50/50 verde, 90.3 % cobertura de statements (≥85 % exigido).
  - `pnpm build/lint/typecheck` en verde en todo el monorepo; `pnpm test:cov` y `pnpm test:e2e` de
    `apps/api` (24/24) siguen verdes tras la extensión de `xades`.
- **Bugs reales encontrados y corregidos en el camino:**
  - `xades`: `firmarNodoXadesBes`/`completarConSelloTiempo` solo soportaban firmar/adjuntar en la raíz del
    documento — el perfil real necesita apilar firmas en nodos anidados (`gDatosGeneralesDTE`, cada
    `gEvento`). Extendido de forma retrocompatible (ADR-015), verificado ANTES de escribir el builder
    completo con un test dedicado de firmas apiladas en un nodo anidado.
  - Parser: un `RegExp` con bandera `g` reutilizado entre varias llamadas a `.test()` perdía coincidencias
    de forma intermitente por `lastIndex` (ADR-016) — detectado por el propio test contra el XML real
    ("esperaba ≥3 avisos, recibió 2").
  - XSD: un primer borrador importaba el XSD oficial de xmldsig-core desde una URL — violaba la
    restricción de "sin red garantizada en runtime"; reemplazado por `xs:any` del namespace xmldsig
    (ADR-017).
- **Fuera de alcance (documentado, no adivinado):** persona jurídica (`codigoTipoPersona=2`) y `gEvento`
  de tipo BLOQUEO — ninguno está demostrado en el XML de referencia; BLOQUEO se modela en F7.
- **Decisiones registradas:** ADR-011, ADR-014, ADR-015, ADR-016, ADR-017.

## F5 — crypto-providers + simulador + ProviderFactory

- **Fecha:** 2026-07-22
- **Estado:** ✅ completa
- **DoD ejecutado (docs/PLAN.md sección 13):**
  - Puertos estables (`FirmaProviderPort`, `TsaProviderPort`, `RevocacionProviderPort`,
    `packages/crypto-providers/src/ports.ts`) — sección 6.1.
  - Simulador (sección 6.3): CA raíz + TSA intermedia efímeras (`node-forge`), `FirmaSimulador` (emite
    certificado F3-like al vuelo, firma XAdES-T real vía `@psdte/xml-engine`), `TsaSimulador` (token RFC
    3161 real con `pkijs`/`asn1js`), `RevocacionSimulador` (GOOD/enTsl:true por defecto,
    OU=REVOCADO-TEST → REVOKED para QA). Firma simulada sobre un nodo de prueba **valida
    criptográficamente** con un verificador XAdES independiente; el token TSA parsea sus campos
    (genTime/policy/hashedMessage/certificado) como RFC 3161. 7/7 tests verdes.
  - Adaptadores HTTP genéricos (sección 6.4): `ClienteHttp` (auth NONE/BASIC/BEARER/API_KEY/MTLS,
    reintentos con backoff, timeout, sin dependencias externas — `http`/`https` nativos para poder
    configurar mTLS), plantillas `{{a.b.c}}` para request y JSONPath mínimo + `map_estado` para response,
    adaptadores `FirmaHttpAdapter`/`TsaHttpAdapter`/`RevocacionHttpAdapter`. Pasan contra un servidor mock
    local (los 4 tipos de auth, mapeo con `map_estado`, reintentos, timeout). 9/9 tests verdes.
  - `ProviderFactory` (sección 6.2, `provider-factory.ts`): funciones puras
    `crearProveedorFirma/Tsa/Revocacion` que resuelven SIMULADOR/REAL/DESHABILITADO — ningún adaptador
    concreto se importa fuera de acá.
  - Lado NestJS (`apps/api/src/modules/integraciones/`): `IntegracionWs` entity (mapea la tabla real),
    `PkiSimuladaService` (genera la CA/TSA una única vez y las persiste cifradas — AES-256-GCM — en
    `parametro_sistema['simulador.pki']`, con `ON CONFLICT DO NOTHING` para que dos procesos concurrentes
    no generen autoridades distintas), `ProviderFactoryService` (lee `integracion_ws` con cache de 60s por
    tipo, invalidable con `invalidarCache()`, descifra credenciales/mTLS antes de armar el adaptador HTTP).
  - Candado `ALLOW_SIMULATOR` (`apps/api/src/main.ts`, `verificarCandadoSimulador`): con
    `NODE_ENV=production` y `ALLOW_SIMULATOR=false`, si FIRMA/TSA/OCSP siguen en modo SIMULADOR el
    arranque falla (`bootstrap().catch(...)` con mensaje claro y `process.exit(1)`) antes de escuchar en
    el puerto; en desarrollo o con `ALLOW_SIMULATOR=true` no bloquea.
  - Test e2e nuevo (`apps/api/test/integraciones/provider-factory.e2e-spec.ts`, 6 casos, contra
    Postgres/Redis reales): `ProviderFactoryService.obtenerProveedorFirma()` resuelto desde la BD (seed en
    SIMULADOR) produce una firma que valida criptográficamente; `obtenerProveedorTsa()` produce un token
    RFC3161 válido; `estadoSimuladorCritico()` refleja el seed; `verificarCandadoSimulador` no bloquea en
    dev ni con `ALLOW_SIMULATOR=true`, y bloquea en prod si falta configurar las integraciones críticas.
  - `pnpm build/lint/typecheck` en verde en todo el monorepo; `pnpm test:cov` (unitarios) y
    `pnpm test:e2e` (4 suites, 24 casos) en verde.
- **Bugs reales encontrados y corregidos en el camino:**
  - `pkijs`: `SignedData.verify()` falla sobre TSTInfo por un bug de la propia librería al desenvolver
    `eContent` tras un round-trip de DER (ver ADR-012). Se lee el token a mano (`leerTokenTsa`) en vez de
    depender de ese método.
  - `node-forge`: el `commonName` de la CA/TSA simuladas (con em-dash y acentos, tal como lo especifica el
    plan) corrompía el DER del certificado al re-leerlo, porque `node-forge` codifica atributos del
    subject como `PrintableString` por defecto (ver ADR-013). Corregido forzando `valueTagClass:
    forge.asn1.Type.UTF8` en el campo `commonName`.
  - Tipo `MapeoOperacion.response` demasiado angosto (`Record<string,string>`) no permitía las tablas de
    traducción `map_estado` que sí soporta `mapearRespuesta()` en runtime — corregido ampliando el tipo a
    `Record<string, string | Record<string,string>>`.
  - `apps/api` no resolvía los tipos DOM (`Element`/`Document`) al importar la API pública de
    `@psdte/xml-engine` en tests, mismo síntoma que en `crypto-providers` (F5, ver más abajo): agregado
    `"lib": ["ES2022", "DOM"]` a `apps/api/tsconfig.json`.
  - `packages/crypto-providers/tsconfig.json` necesitó el mismo agregado de `"lib": ["ES2022", "DOM"]`
    porque `@xmldom/xmldom` solo propaga su `/// <reference lib="dom" />` a quien lo importa
    directamente (`xml-engine`), no a quien consume su output compilado (`crypto-providers`).
- **Decisiones registradas:** ADR-012 (bug de `pkijs` en `SignedData.verify()` con TSTInfo), ADR-013
  (codificación UTF8String forzada en `node-forge` para el `commonName`).
- **Pendiente:** la UI de administración de integraciones (`/admin/integraciones`, sección 6.5) y el
  chequeo de integraciones activas en `/readyz` quedan para F10/F13 respectivamente — no son parte del DoD
  de F5.

## F6 — Emisión

- **Fecha:** 2026-07-22
- **Estado:** ✅ completa
- **DoD ejecutado (docs/PLAN.md sección 13):** e2e borrador → solicitar firmas (deudor + codeudor) →
  simulador firma → confirmar → estado EMITIDO, XML v1 con firmas de partes + sello PSDTE embebidas,
  hash registrado; ID-DTE duplicado → `ERR-DTE-409`; confirmar sin firmas → `ERR-ESTADO-001`.
- **Hecho:**
  - `IdDteService` (`common/id-dte/`): genera `vDTE/dDTE/eDTE...` (sección 5.3) desde
    `psdte.seq_dte` (migración 017) + `parametro_sistema['psdte.fecha_autorizacion']`.
  - Entidades nuevas: `Dte`, `DteParte`, `DteLugarPago`, `DteCondicion`, `DteTenencia`,
    `DteXmlVersion`, `Certificado`, `Firma`, `Evidencia`, `Notificacion`, `SolicitudFirma`, más
    catálogos geográficos/documento (`CatPais/Departamento/Distrito/Ciudad/Moneda/TipoDocumentoIdentidad`
    — ver ADR-020).
  - `EmisionModule` (`modules/emision/`): `BorradorEmisionStore` (Redis, ver ADR-018) +
    `EmisionService` con tres operaciones:
    - `crearBorrador`: resuelve personas/direcciones/catálogos, arma `DatosGeneralesDteInput`, calcula
      monto→letras, valida contra el builder de `@psdte/xml-engine` (placeholders resueltos), guarda
      el borrador en Redis (24h TTL).
    - `solicitarFirmas`: firma secuencialmente Deudor→CoDeudor (cada uno recibe el XML ya firmado por
      el anterior — el mismo patrón que usaría un proveedor real), vía
      `ProviderFactoryService.obtenerProveedorFirma()`; persiste `solicitud_firma` (con `dte_id=NULL`
      hasta confirmar).
    - `confirmar`: agrega el sello PSDTE, valida XSD + semántica + criptográficamente cada firma
      embebida, y persiste todo (`dte`, `dte_parte`, `dte_lugar_pago`, `dte_condicion`, `dte_tenencia`,
      `dte_xml_version` v1, `certificado`+`firma` por cada firma embebida, `evidencia`, `notificacion`,
      backfill de `dte_id` en `solicitud_firma`) en una única transacción; registra auditoría
      (`DTE_EMITIDO`) solo tras el commit exitoso.
  - Seeds nuevos: `cat_tipo_evidencia`/`cat_tipo_notificacion` (no tenían filas desde F1 — ver
    `06_evidencias_notificaciones.sql`).
  - Test e2e nuevo (`test/emision/emision.e2e-spec.ts`, 3 casos, contra Postgres/Redis reales):
    flujo feliz completo (verifica `dte`, `dte_xml_version`, 3 `firma` embebidas con
    `estado_validacion=VALIDA`, `dte_tenencia` inicial), confirmar sin firmas → 409, ID-DTE duplicado
    → 409. 27/27 e2e del monorepo en verde junto con F1-F5.
  - `pnpm build/lint/typecheck` en verde en todo el monorepo.
- **Bugs/gaps reales encontrados y corregidos en el camino:**
  - `XSD_PATH` con ruta relativa (`./packages/...`) rompía según `cwd` del proceso (funciona si se
    arranca desde la raíz del monorepo, rompe bajo Jest). Corregido resolviendo el default vía
    `require.resolve('@psdte/xml-engine/package.json')` en `config.schema.ts` — estable sin importar
    quién arranque el proceso. Se quitó el override redundante de `.env`/`.env.test`.
  - Bug real de firmas XAdES al re-anidar un nodo ya firmado con `URI=""` (ver ADR-019) — descubierto
    con un script de reproducción aislado antes de comprometerse a una causa; corregido agregando
    `uriNodoPrincipal` a `SolicitarFirmaRequest` (extensión retrocompatible de F5).
  - `fn_aplicar_evento` no aplica a la emisión misma (exige que `dte` ya exista y `cat_tipo_evento` no
    tiene código EMISION) — descubierto al diseñar `confirmar`; ver ADR-018 para el razonamiento
    completo y por qué el borrador vive en Redis, no en Postgres.
- **Decisiones registradas:** ADR-018 (borrador en Redis), ADR-019 (URI de firma explícita vs. vacía),
  ADR-020 (catálogos geográficos/documento).
- **Pendiente:** callback HMAC entrante (`POST .../firmas/callback`) no se implementó — el simulador
  resuelve `solicitarFirma` de forma síncrona, así que no hay ronda asíncrona que necesite callback
  todavía; se retoma cuando F10 conecte un proveedor HTTP real que sí sea asíncrono. Persona jurídica
  y BLOQUEO siguen fuera de alcance (ver F4/ADR-014).

## F7 — Eventos: endoso, pago, bloqueo, cancelación

- **Fecha:** 2026-07-23
- **Estado:** ✅ completa (vencimiento por cron queda pendiente — ver "Pendiente")
- **DoD ejecutado (docs/PLAN.md sección 13):** e2e ciclo 2 endosos + pago total + cancelación con cadena
  de hashes de eventos verificable; carrera de 20 endosos concurrentes → exactamente 1 prospera, 19
  `ERR-CTRL-001`; bloqueo detiene endoso (`ERR-ESTADO-003`) y el levantamiento restaura el estado previo
  (no uno fijo). Todo contra Postgres/Redis reales, sin mocks del motor de firma (simulador real).
- **Hecho:**
  - Migración 018 (`p_estado_destino` opcional en `fn_aplicar_evento`, ver ADR-004/022) — corregida para
    no dejar dos overloads vivos tras un ciclo up/down (ADR-022).
  - Seed de `cat_transicion` para LEVANTAMIENTO_BLOQUEO ampliado: una fila por cada estado previo posible
    (no un destino fijo — ver ADR-023).
  - Entidades nuevas: `DteEvento`, `DteEndoso`, `DtePago`, `DteBloqueo`, `DteCancelacion`.
  - `EventosService` (única puerta a `fn_aplicar_evento`, I3) + `EventosComunesService` (documento de
    identidad, datos del PSDTE, mapeo usuario→persona — compartido entre los 4 servicios de evento).
  - `EndosoService`, `PagoService`, `BloqueoService` (registrar + levantar), `CancelacionService` —
    firman el documento completo (no el `gEvento` aislado, ver ADR-021), rotan `dte_tenencia` (solo
    endoso), calculan `estadoDestino` explícito cuando `cat_transicion` es ambiguo (pago, levantamiento).
  - `EventosController`/`EventosModule`: `POST /dte/:id/endosos`, `POST /dte/:id/pagos`,
    `POST /dte/:id/bloqueos`, `DELETE /dte/:id/bloqueos/:bid`, `POST /dte/:id/cancelacion` — roles de
    login como filtro de acceso, autorización real vía `dte_tenencia` en el servicio (ver ADR-023).
  - Test e2e nuevo (`test/eventos/eventos.e2e-spec.ts`, 3 casos): ciclo completo, carrera de 20
    concurrentes, bloqueo/levantamiento. 33/33 e2e del monorepo en verde junto con F1-F6.
  - `pnpm build/lint/typecheck` en verde en todo el monorepo (`xml-engine`, `crypto-providers`, `api`).
- **Bugs/gaps reales encontrados y corregidos en el camino:**
  - Firmar el `gEvento` aislado (en vez del documento completo) rompía toda referencia I7 al evento/nodo
    anterior (`XMLJS0013: Cannot get object by reference`) — no solo en el primer evento, en todos. Ver
    ADR-021 para el fix (documento completo + `buscarElementoPorId` para anidar cada firma en el nodo
    correcto en vez de asumir la raíz).
  - `fn_aplicar_evento` de 11 parámetros (migración 018) coexistía con el de 10 tras un ciclo up/down,
    causando error de resolución de sobrecarga en Postgres — ver ADR-022.
  - Roles de login mal acoplados a "ser el tenedor vigente": un `DEUDOR` puede terminar siendo tenedor
    tras un endoso, así que el filtro de rol del endpoint no puede excluirlo — corregido permitiendo
    ambos roles en el controller, dejando la autorización real al chequeo de `dte_tenencia` (ERR-CTRL-001).
- **Decisiones registradas:** ADR-021 (firmar documento completo), ADR-022 (overload de
  `fn_aplicar_evento`), ADR-023 (cierre F7: pago/bloqueo/levantamiento/cancelación/roles).
- **Pendiente:** el job de vencimiento (cron 15 min, aplica evento VENCIDO vía `fn_aplicar_evento` cuando
  `now() > fecha_vencimiento` y saldo > 0) no se implementó — no hay infraestructura de jobs/BullMQ
  todavía en el monorepo; se retoma cuando esa infraestructura exista (probablemente F13 o antes si otra
  fase la requiere primero). Callback HMAC asíncrono del proveedor de firma sigue pendiente (mismo motivo
  que F6).

## F8 — Verificación

- **Fecha:** 2026-07-23
- **Estado:** ✅ completa
- **DoD ejecutado (docs/PLAN.md sección 13):** e2e pública muestra existencia/estado/integridad sin
  datos personales; alterar 1 byte del XML (insertando una versión con contenido corrupto, respetando
  el append-only de `dte_xml_version` — I4) hace fallar la integridad; interviniente relacionado y
  autoridad ven timeline/firmas completos; interviniente NO relacionado a un DTE ajeno solo ve el
  nivel público.
- **Hecho:**
  - Entidad nueva: `ConsultaVerificacion` (`consulta_verificacion`, ya existía la tabla desde F1).
  - `VerificacionService`: `verificarIntegridad` (recalcula hash contra `dte.hash_vigente` y
    `dte_xml_version.hash_sha256`, valida cada `ds:Signature` embebida — I8), `verificarCadenaHashes`
    (encadenamiento `dte_evento.hash_anterior` — I5), `consultaPublica` (nivel 1, sin datos
    personales), `consultaDetallada` (nivel derivado de `cat_rol.nivel_acceso` del JWT + relación real
    con el DTE vía `dte_parte`/`dte_tenencia`/`dte_endoso` — ver ADR-024).
  - `VerificacionController`/`VerificacionModule`: `GET /verificacion?codigo=` (`@Publico()`, throttle
    20/min) y `GET /dte/:id/verificacion` (autenticado, nivel según rol+relación).
  - Test e2e nuevo (`test/verificacion/verificacion.e2e-spec.ts`, 5 casos). 35/35 e2e del monorepo en
    verde junto con F1-F7.
  - `pnpm build/lint/typecheck` en verde en todo el monorepo.
- **Decisiones registradas:** ADR-024 (nivel de acceso derivado de `cat_rol.nivel_acceso`, sin tabla
  de mapeo nueva).
- **Pendiente:** `GET /dte` (bandeja paginada) y `GET /dte/:id/xml?version=n` no se implementaron —
  no forman parte del DoD literal de F8 (que es específicamente sobre verificación de integridad),
  se retoman cuando F12 (frontend) los necesite para las pantallas de bandeja/detalle.

## F9 — Exportación y preservación

- **Fecha:** 2026-07-23
- **Estado:** ✅ completa (conformidad PDF/A vía veraPDF real queda pendiente — ver "Pendiente")
- **DoD ejecutado (docs/PLAN.md sección 13):** e2e contenedor generado se verifica offline OK (vía
  la función Y vía la CLI `pnpm verificar` real); alterar un artefacto o el manifiesto → detectado;
  PDF/A real generado (Puppeteer + Ghostscript) con chequeo de conformidad persistido; job de
  resellado agrega un token nuevo a `resellado_ltv`.
- **Hecho:**
  - `packages/xml-engine/src/contenedor/` (`construirManifiesto`, `construirZip`,
    `verificarContenedorOffline`) + `src/cli/verificar.ts` (`pnpm verificar <contenedor.zip>`, sin
    red ni BD). El manifiesto se sella con un token TSA (RFC 3161) reusando
    `TsaProviderPort.sellarHash` — ver ADR-025.
  - Entidades nuevas: `Exportacion`, `ReselladoLtv`, `Incidencia` (tablas ya existían desde F1).
  - `ExportacionService`: `generarContenedor` (dte.xml + evidencias + certificados + manifiesto +
    sello TSA), `generarPdfA` (HTML → Puppeteer → PDF → Ghostscript `-dPDFA=2` → PDF/A-2b real,
    conformidad verificada por `VerificadorPdfaEstructural` — simulador estructural, no veraPDF, ver
    ADR-025), ambas persisten en `exportacion` y guardan el archivo en `EXPORT_DIR`.
  - `ReselladoService.reselladoVencidos`: resella toda `dte_xml_version` sin resellado vigente.
  - `ReconciliacionService.reconciliarDte`: recalcula hash + compara id/monto del XML vigente contra
    la proyección en `dte`; discrepancia → `incidencia` severidad ALTA (I8).
  - `ExportacionController`/`ExportacionModule`: `POST /dte/:id/exportacion`,
    `GET /exportaciones/:id/descargar`, `POST /admin/jobs/resellado-ltv`,
    `GET /admin/jobs/reconciliacion` (jobs invocables directamente — sin cola/cron todavía, mismo
    motivo que el cron de vencimientos de F7).
  - Nuevas config vars: `EXPORT_DIR`, `CHROMIUM_PATH` (autodetecta el Chromium de Playwright si
    existe), `GHOSTSCRIPT_PATH`.
  - Test unitario (`packages/xml-engine/src/contenedor/contenedor.spec.ts`, 2 casos) + e2e nuevo
    (`test/exportacion/exportacion.e2e-spec.ts`, 5 casos). 40/40 e2e del monorepo en verde junto con
    F1-F8.
  - `pnpm build/lint/typecheck` en verde en todo el monorepo.
- **Decisiones registradas:** ADR-025 (sello del manifiesto vía TSA en vez de XAdES; PDF/A real con
  conformidad simulada en vez de veraPDF).
- **Pendiente:** conformidad PDF/A real vía veraPDF (Java, instalación no interactiva pesada —
  costo/beneficio no favorable dado el tiempo de esta fase; el chequeo estructural actual queda
  documentado como simulador, switchable sin cambiar el contrato `PdfaConformanceChecker`). Jobs de
  resellado/reconciliación/vencimiento siguen siendo invocación directa, no cron real — se retoman
  cuando exista infraestructura `api-worker`/BullMQ (F13).

## F10 — Admin de integraciones (UI + API) — requisito explícito del usuario

- **Fecha:** 2026-07-23
- **Estado:** ✅ completa
- **DoD ejecutado (docs/PLAN.md sección 6.5/13):** Playwright real (no mockeado): editar TSA →
  probar conexión (simulador) OK → guardar → conmutar a REAL exige test previo y re-password
  (probado sin password, con password incorrecta, y con la correcta) → historial registra la
  conmutación → volver a SIMULADOR → banner reaparece. API nunca devuelve credenciales en claro
  (verificado en e2e de API y en el Playwright).
- **Hecho:**
  - Backend: `IntegracionesAdminService`/`IntegracionesAdminController` en el módulo
    `integraciones` ya existente (F5) — `GET /admin/integraciones`, `GET /:id`, `PUT /:id`,
    `POST /:id/test`, `POST /:id/conmutar`, `GET /:id/historial`, `GET /estado-global`. Entidad
    nueva `IntegracionWsHistorial` (tabla ya existía desde F1).
  - El pasaje a REAL solo puede ocurrir vía `/conmutar` (PUT lo rechaza) — ver ADR-026 para el bug
    real que esto cierra. `/conmutar` exige `ultimo_test.ok=true` de los últimos 15 min +
    `argon2.verify` contra la contraseña del admin — MFA verificada ya la exige `@RequiereMfa` a
    nivel de controller (primer uso real de ese decorator, existía desde F2 sin consumidores).
  - "Probar conexión" y el revalidado automático al guardar reusan las MISMAS fábricas de
    `@psdte/crypto-providers` que usa `ProviderFactoryService` en producción (no un mock aparte).
  - Frontend (`apps/web`, bootstrapeado desde cero — primera pantalla real del monorepo):
    `AuthProvider` (login + MFA, access token en `sessionStorage`), cliente HTTP mínimo
    (`api-client.ts`), página `/admin/integraciones` completa (listado, formulario de edición,
    probar conexión, guardar, modal de conmutación con contraseña, historial, banner global de
    simulador en el layout privado).
  - `playwright.config.ts` nuevo (dos `webServer`: api + web) + `e2e/admin-integraciones.spec.ts`
    (3 casos, corridos contra Chromium real — no mockeado) + test e2e de API nuevo
    (`test/integraciones/integraciones-admin.e2e-spec.ts`, 6 casos). 46/46 e2e de API + 3/3
    Playwright en verde.
  - `pnpm build/lint/typecheck` en verde en todo el monorepo (incluye `apps/web` por primera vez).
- **Decisiones registradas:** ADR-026 (candado de REAL solo vía `/conmutar`; JSON crudo para
  endpoints/mapeo; frontend bootstrapeado desde cero).
- **Pendiente:** editor visual de tabla clave/valor para `endpoints`/`headersExtra` (hoy JSON crudo
  en textarea — funcionalmente completo, UI más rica en F12). Subida de PEM para mTLS vía archivo
  (hoy se pega el texto PEM directamente). El resto de `apps/web` (dashboard, bandeja de DTE,
  wizards, etc.) es explícitamente F12.

## F11 — Notificaciones, auditoría UI, incidencias

- **Fecha:** 2026-07-23
- **Estado:** ✅ completa (MailHog real sustituido por `maildev` en este sandbox — ver "Pendiente")
- **DoD ejecutado (docs/PLAN.md sección 13):** el catcher SMTP recibe los 6 tipos de email en un
  solo flujo e2e (emitir → endosar → bloquear → levantar → pagar total → cancelar); la pantalla de
  auditoría filtra por entidad/entidad-id/fecha y verifica la cadena de hashes (Playwright real).
- **Hecho:**
  - `NotificacionesModule`: `plantillas.ts` (7 tipos, texto plano: EMISION_CONFIRMADA,
    ENDOSO_REGISTRADO, PAGO_REGISTRADO, BLOQUEO_APLICADO, DTE_CANCELADO, SOLICITUD_FIRMA,
    VENCIMIENTO_PROXIMO), `NotificacionesService` (`crear` inserta `PENDIENTE`; `enviarPendientes`
    envía por SMTP real vía `nodemailer` y transiciona a `ENVIADA`/`FALLIDA`),
    `VencimientoNotificacionService` (detecta DTE a ≤7 días de vencer con saldo pendiente, no
    re-notifica el mismo día), `NotificacionesController`
    (`POST /admin/jobs/notificaciones`, `POST /admin/jobs/vencimientos-proximos`).
  - Retrofit de creación de notificación en los 5 servicios de dominio existentes: `EmisionService`
    (SOLICITUD_FIRMA en `solicitarFirmas`, EMISION_CONFIRMADA en `confirmar`), `EndosoService`,
    `PagoService`, `BloqueoService` (solo `registrarBloqueo`, no en el levantamiento),
    `CancelacionService`.
  - `AuditoriaController` nuevo (`GET /admin/auditoria` con filtros, `GET
    /admin/auditoria/verificar-cadena`) sobre el `AuditoriaService` ya existente desde F2 — ver
    ADR-028. `IncidenciasModule` nuevo (`GET /admin/incidencias` con filtros,
    `PUT /:id/estado`, `ADMIN_PSDTE` para escritura, `ADMIN_PSDTE`+`AUDITOR` para lectura).
  - Migración `019_notificacion_error.sql` (`notificacion.error_mensaje`); seed
    `06_evidencias_notificaciones.sql` ampliado de 5 a 7 `cat_tipo_notificacion` con
    `canal='EMAIL'` correcto (antes `'SISTEMA'` para todos) — ver ADR-027. `SMTP_FROM` agregado a
    `config.schema.ts`. `email` agregado a las personas demo `tenedor`/`deudor` sembradas (sin esto
    ninguna notificación se genera nunca en los flujos demo).
  - Frontend: `(privado)/auditoria/page.tsx` (filtros entidad/entidad-id/fecha, tabla, botón
    "verificar cadena de hashes" con resultado válida/inválida) y `(privado)/incidencias/page.tsx`
    (filtros estado/severidad, tabla, selector de cambio de estado solo para `ADMIN_PSDTE`) — rutas
    exactas de la sección 8 del plan.
  - Tests nuevos: `test/notificaciones/notificaciones.e2e-spec.ts` (2 casos: flujo completo de 6
    tipos con envío SMTP real verificado contra la API REST de `maildev`, y vencimiento próximo con
    no-duplicación el mismo día), `test/auditoria/auditoria.e2e-spec.ts` (4 casos: filtro por
    entidad/entidad-id, filtro por rango de fechas, verificar-cadena válida, roles),
    `test/incidencias/incidencias.e2e-spec.ts` (3 casos: listar/filtrar, permisos
    AUDITOR-solo-lectura vs ADMIN_PSDTE, estado inválido rechazado),
    `e2e/auditoria-incidencias.spec.ts` (3 casos Playwright, sesión compartida entre tests del
    archivo para no agotar el límite de 5 intentos de login/60s — ver ADR-027/028).
  - 12/12 API e2e suites (55 casos, incluye los 9 casos nuevos de F11) + 6/6 Playwright en verde.
    `pnpm build/lint/typecheck` en verde en todo el monorepo (incluye `apps/web`).
- **Decisiones registradas:** ADR-027 (`maildev` como sustituto de MailHog en el sandbox; catálogo
  de notificaciones 5→7; interpretación del flujo e2e de "6 tipos"), ADR-028 (alcance del
  tamper-test de auditoría dado el invariante I4 append-only; endpoints/pantallas de
  auditoría/incidencias).
- **Pendiente:** MailHog real (Docker) no se pudo levantar en este sandbox — `maildev` documentado
  como sustituto solo de prueba, sin cambios en el código de producción (`NotificacionesService`
  solo habla SMTP). Jobs de notificaciones/vencimientos siguen siendo invocación directa, no
  cron/cola real — se retoma con `api-worker`/BullMQ en F13. Ninguna de las pantallas nuevas está
  enlazada desde una navegación global todavía (no existe hasta F12). Editor visual de
  claves/valores para JSON crudo (heredado de F10) y dashboard/bandeja/wizards de emisión siguen
  siendo explícitamente F12.

## F12 — Frontend completo

- **Fecha:** 2026-07-23
- **Estado:** ✅ completa
- **DoD ejecutado (docs/PLAN.md sección 13):** suite Playwright completa en verde (22/22) ·
  `pnpm --filter web build` sin warnings de tipo · Lighthouse a11y: **100/100** en
  `/verificar/[codigo]` y **100/100** en `/login` (DoD pide ≥90; corrido ad hoc con
  `npx lighthouse` contra el build de producción, sin agregarlo como dependencia permanente — el
  plan marca este script como CI opcional).
- **Hecho:**
  - Backend: `GET /dte` (bandeja paginada con filtros estado/fechas/texto, visibilidad por rol
    operativo — no por `nivel_acceso`, ver ADR-029), `GET /dte/:id/xml?version=n`,
    `GET /dte/kpis` (dashboard). `GET /dte/:id/verificacion` (F8) extendido con `partes` y
    `bloqueoActivoId`. `GET /personas` abierto a TENEDOR/DEUDOR/AUTORIDAD solo para búsqueda por
    documento (nuevo `ERR-DTE-403` si se omite). Nuevo `POST /dev/firmador` (firma manual contra
    el simulador, gateado por `ALLOW_SIMULATOR` + `ADMIN_PSDTE`).
  - Frontend — todas las páginas de la sección 8 que faltaban: layout privado con sidebar de
    navegación por rol (colapsable en móvil) + dashboard con KPIs reales; `(publico)/verificar/
    [codigo]` (SSR, QR, re-verificación en vivo, sin datos personales); bandeja de pagarés
    (TanStack Table, filtros servidor, paginación); detalle de DTE (cabecera, partes, timeline de
    eventos con chips de firma verde/rojo, acciones calculadas desde CAT-DTE-03 — nunca
    hardcodeadas); wizards de endoso (búsqueda de endosatario por documento + confirmación),
    pago, bloqueo, cancelación y exportación (contenedor/PDF-A descargados como blob autenticado,
    no un `<a href>` con token en query); wizard de emisión de 5 pasos; admin/usuarios (alta +
    edición de roles), admin/catálogos (navegador genérico de CAT-DTE-01..10), admin/parámetros
    (edición de valores JSON); dev/firmador.
  - Utilidades `lib/formato.ts` (monto/fecha es-PY vía `Intl`, con el código de moneda del propio
    DTE, nunca asumiendo PYG) y `lib/acciones-dte.ts` (deriva los botones de acción de la bandeja/
    detalle desde la matriz de transiciones — solo los 4 tipos de evento con flujo implementado
    en F7 tienen botón; el resto de CAT-DTE-03 son transiciones válidas en el catálogo sin
    endpoint todavía).
  - Infraestructura de Playwright reescrita (bloqueante, encontrado al construir los wizards):
    un `globalSetup` hace el login real de los 5 roles demo UNA sola vez antes de toda la suite
    y persiste los tokens en un archivo (gitignored); los specs inyectan la sesión en
    `sessionStorage` en vez de repetir el formulario de login. Se había asumido que un caché en
    memoria por request sobrevivía entre archivos de specs — no es así (cada archivo carga en su
    propio contexto de módulos) y el límite de 5 intentos/60s de `POST /auth/login` se agotaba
    apenas la suite creció. login/MFA por UI se prueba una sola vez, con respuestas mockeadas, en
    `auth-ui.spec.ts` (la lógica de autenticación real ya tiene su e2e dedicado en la API).
  - Responsive verificado con Playwright en viewport móvil (375×667): dashboard, bandeja, login,
    verificar público y wizard de emisión sin scroll horizontal.
  - e2e nuevos: `test/dte/dte.e2e-spec.ts` (4 casos), `test/dev/dev.e2e-spec.ts` (3 casos),
    ampliación de `test/catalogos-personas` (1 caso). Playwright:
    `emitir.spec.ts`, `wizards.spec.ts`, `admin-pages.spec.ts`, `responsive.spec.ts`,
    `auth-ui.spec.ts` reescrito, más los smoke de bandeja/detalle/verificar ya existentes.
    14/14 suites e2e de API (63 casos) + 22/22 Playwright en verde, estable en corridas repetidas.
- **Decisiones registradas:** ADR-029 (visibilidad de bandeja por rol operativo en vez de
  `nivel_acceso`; endpoints nuevos de F8 pendiente; wizard de emisión y firmador de desarrollo;
  hallazgo y corrección de Lighthouse; infraestructura de Playwright).
- **Pendiente:** conformidad PDF/A real (veraPDF, F9), jobs de vencimiento/resellado/
  reconciliación/notificaciones como invocación directa en vez de cron real (F13), MailHog real
  vía Docker (F11) — ninguno de estos es responsabilidad de F12. Editor visual de tabla clave/
  valor para JSON crudo en `admin/integraciones` (heredado de F10) sigue pendiente de una UI más
  rica. Un editor visual similar para `admin/parametros`/`admin/catalogos` (hoy JSON crudo /
  tabla genérica de solo lectura) queda como posible pulido futuro, no bloqueante del DoD.

## F13 — Kubernetes + observabilidad + runbook

- **Fecha:** 2026-07-23
- **Estado:** ✅ completa (con limitaciones de sandbox honestamente documentadas, ver más abajo)
- **DoD ejecutado:**
  - Infraestructura de colas real (BullMQ + `@nestjs/bullmq`): 4 colas (`resellado-ltv`,
    `reconciliacion`, `notificaciones`, `vencimientos-proximos`) en `apps/api/src/jobs/`, cada una
    envolviendo el servicio ya probado en F7/F9/F11 (`ReselladoService`, `ReconciliacionService`,
    `NotificacionesService`, `VencimientoNotificacionService`) con repeatable jobs reales
    (`upsertJobScheduler`) en vez de invocación directa. Proceso `worker` separado
    (`PROCESS_ROLE=worker`, `apps/api/src/main.worker.ts` + `worker.module.ts`,
    `createApplicationContext` sin HTTP) para no duplicar ejecuciones al escalar la api
    horizontalmente. Verificado end-to-end en el sandbox (sin Docker, Redis/Postgres nativos):
    build/typecheck limpios, el worker arranca y registra los 4 repetibles
    (`JobsSchedulerService`), un job de prueba encolado manualmente en `notificaciones` transicionó
    a `completed` (confirmado con `getJobCounts()`/`job.getState()`, no solo que el código
    compila). Ver ADR-030.
  - `readyz` (`SaludService`) ahora también resuelve `ProviderFactoryService` (FIRMA/TSA/OCSP) —
    cierra un pendiente real desde F2 que la sección 11 del plan exige explícitamente para las
    probes de K8s. e2e nuevo: `test/salud/salud.e2e-spec.ts` (3 casos: healthz, readyz, metrics).
  - Dockerfiles multi-stage: `infra/docker/Dockerfile.api` (actualizado: agrega
    `chromium`+`ghostscript` vía `apk`, ausentes hasta ahora aunque `ExportacionService` ya los usa
    de forma síncrona desde F9, y copia `db/migrations` para que `migrate-job.yaml` pueda reusar la
    misma imagen), `infra/docker/Dockerfile.api-worker` (nuevo, mismo build, `PROCESS_ROLE=worker`,
    `CMD dist/main.worker.js`), `infra/docker/Dockerfile.web` (ya estaba completo desde F0 —
    verificado `output: 'standalone'` en `next.config.js`). `node-pg-migrate` movido de
    `devDependencies` a `dependencies` (lo necesita `migrate-job.yaml` en runtime).
  - Manifests K8s (`infra/k8s/base/`): `namespace`, `configmap`, `secrets.example` (plantilla, no
    aplicable), `redis` (StatefulSet+PVC, en todos los entornos), `api-deployment` (2 réplicas,
    probes `/api/healthz`/`/api/readyz`, resources, PDB), `worker-deployment` (1 réplica, sin
    probes HTTP — no tiene listener), `web-deployment` (2 réplicas, probes en `/login`, PDB),
    `services`, `ingress` (TLS cert-manager, rutas `/api`→api `/`→web), `hpa-api` (CPU 70%,
    min2/max6), `migrate-job` (reusa la imagen de la api), `cronjob-backup` (pg_dump diario,
    subida a bucket como placeholder intencional), `networkpolicy` (deny-all + reglas explícitas
    por flujo, incluida DNS y HTTPS saliente arbitrario para integraciones REAL sin allowlist de
    IP fijo). `infra/k8s/postgres/` (StatefulSet PG15, SOLO dev/demo). Kustomize
    `overlays/dev` (Postgres propio, `letsencrypt-staging`, dominio dev, réplicas 1) y
    `overlays/prod` (sin Postgres propio, `ALLOW_SIMULATOR=false`, dominio real, `NetworkPolicy`
    adicional para el egreso al Postgres gestionado — CIDR placeholder a completar por entorno).
  - Corregido en el camino: `apps/web/.../verificar/[codigo]/page.tsx` (Server Component) leía
    `NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_BASE_URL` — Next.js los hornea como literal en el build
    sin importar si el código es server o cliente, así que un `ConfigMap` de K8s nunca los hubiera
    podido cambiar sin reconstruir la imagen. Pasa a leer `API_BASE_URL_INTERNO`/`PUBLIC_BASE_URL`
    (sin prefijo, runtime real). Ver ADR-031.
  - `docs/RUNBOOK.md` completo: arranque (build+push de las 3 imágenes, migrate-job, apply del
    overlay, `scripts/smoke-k8s.sh`), secretos (creación y consideraciones de rotación),
    backup/restore y preservación ≥10 años (distingue resellado LTV — lo que de verdad sostiene la
    validez probatoria — del backup de PostgreSQL, que es recuperación operativa), conmutación a
    WS reales paso a paso (referencia ADR-026), troubleshooting (tabla de síntomas comunes), plan
    de cese/retención de 10 años, y una sección de limitaciones honestas de esta entrega.
  - `scripts/smoke-k8s.sh`: verifica rollouts + `/api/readyz` + `/login` + `/verificar/<código>`
    post-deploy. Código listo, no ejecutable en este sandbox (sin cluster).
  - `pnpm build/lint/typecheck` verdes en los 7 paquetes; suite completa de Playwright (22/22) y
    e2e de API (15/15 suites tras agregar `salud.e2e-spec.ts`) reverificadas después de los cambios
    de esta fase.
  - Validación de manifests: `kubernetes-validate` (PyPI) contra el esquema K8s 1.32 en modo
    `strict` — 25/25 objetos de `base/`+`postgres/` válidos, más el recurso adicional de
    `overlays/prod`. Sustituto de `kubeconform`, que no se pudo instalar (descarga de GitHub
    Releases bloqueada por el proxy del sandbox) — mismo patrón que `maildev`/verificador PDF/A
    estructural en fases previas.
- **Decisiones registradas:** ADR-030 (BullMQ + proceso worker dedicado, qué jobs de la sección 9
  quedan pendientes y por qué), ADR-031 (variables de runtime vs. build-time en Next.js dentro de
  K8s, `readyz` con ProviderFactory, `kubernetes-validate` como sustituto de `kubeconform`).
- **Pendiente (honestamente documentado, no se fuerza bajo presión de tiempo):**
  - `docker build`, `kind create cluster`, `kubectl apply` y `scripts/smoke-k8s.sh` no se
    ejecutaron contra un cluster real — este sandbox no tiene Docker daemon. Todo se validó por
    esquema (`kubernetes-validate`) y revisión manual de los patches de kustomize (`kustomize
    build` tampoco disponible). Ver `docs/RUNBOOK.md` sección 7 para el detalle completo.
  - El job "vencimientos" (auto-transición de un DTE a estado VENCIDO vía `fn_aplicar_evento`)
    sigue sin implementarse — requiere nuevas filas en `cat_tipo_evento`/`cat_transicion` y
    probablemente soporte en `xml-engine` para el nuevo tipo de evento. Ya lo dejaron pendiente
    F7/F9/F11; se decidió no inventar esa lógica de negocio bajo presión de tiempo en F13.
  - El job "firmas-pendientes" (poll de `consultarEstado`) no se implementó: en modo SIMULADOR
    `solicitarFirma` resuelve sincrónicamente, así que no hay nada real contra qué probarlo hasta
    que exista un proveedor REAL sin callback.
  - El job "exportaciones" (cola on-demand para PDF/A+contenedor) sigue síncrono en el proceso api
    — es el diseño ya construido y probado en F9/F12 (descarga como blob autenticado); moverlo a
    asíncrono exigiría rediseñar ese flujo sin beneficio claro dado el tamaño típico del artefacto.
  - Conformidad PDF/A real (veraPDF, F9) y MailHog real vía Docker (F11) siguen pendientes por las
    mismas razones de sandbox ya documentadas en esas fases.

## F14 — Endurecimiento y cierre

- **Fecha:** 2026-07-23
- **Estado:** ✅ completa (con limitaciones de sandbox honestamente documentadas, ver más abajo)
- **DoD ejecutado:**
  - `pnpm audit --prod`: de 50 hallazgos (19 high, 27 moderate, 4 low) se corrigieron 28 —
    `nodemailer` `6.9.16→9.0.3` (única versión con un hallazgo real aplicable) y `pnpm.overrides`
    para 9 transitivas (`lodash`, `js-yaml`, `postcss`, `qs`, `uuid`, `file-type`, `adm-zip`,
    `glob`, `multer`, `body-parser`), cada una dentro de su misma línea mayor. Quedan 22 hallazgos
    en `next@14` y `@nestjs/core@10` — ambos requieren un salto de versión MAYOR del framework
    (breaking changes potenciales en ~20 rutas de `apps/web` o en los ~10 paquetes `@nestjs/*` del
    monorepo) — documentados como excepción explícita en ADR-032 en vez de forzados bajo presión de
    tiempo. Reverificado tras los bumps aplicados: build/lint/typecheck en los 7 paquetes, 15/15
    suites e2e API (66 casos), 22/22 Playwright — sin regresión.
  - Invariante I10 (idempotencia por `Idempotency-Key`): **no tenía ninguna implementación** en
    ninguna fase anterior pese a ser uno de los 10 invariantes no-negociables desde `CLAUDE.md`/F0
    — se descubrió al preparar el test dedicado y se cerró acá con `IdempotenciaInterceptor`
    (global, opt-in por header, Redis `SET NX`, cache de respuesta 24h, 409 ante una carrera con la
    misma clave). Ver ADR-033.
  - `apps/api/test/invariantes/invariantes.e2e-spec.ts` (nuevo): un test dedicado por invariante
    I1-I10 (10/10 verde), consolidando la verificación al cierre del proyecto — I1 e I9 incluyen
    además un barrido estático del código fuente (sin `DELETE FROM psdte.dte`, sin campos de clave
    privada de firmante).
  - OpenAPI exportada: `apps/api/scripts/exportar-openapi.ts` (`pnpm --filter @psdte/api
    docs:openapi`) genera `docs/openapi.json` y `docs/API.md` (agrupado por segmento de ruta, ya
    que ningún controller usa `@ApiTags` todavía — nota explícita en el propio `API.md`).
  - Re-ejecución completa de los DoD F0-F13 en este sandbox: `pnpm build/lint/typecheck` (7
    paquetes) verdes; `pnpm test:cov` (9 tareas) verde; `pnpm --filter @psdte/api test:e2e` 16/16
    suites (76 casos); `pnpm --filter @psdte/web test:e2e` (Playwright) 22/22; validación de
    manifests K8s (`kubernetes-validate`) sin cambios desde F13. Adicionalmente, desde una base de
    datos reseteada (`pnpm db:reset`, migraciones+seeds desde cero) se levantó `pnpm dev` (api+web
    nativos, sin Docker) y se verificó manualmente el sistema operable de punta a punta: `/api/
    healthz` y `/api/readyz` (BD+Redis+integraciones) en verde, `POST /api/v1/auth/login` emite un
    token real contra un usuario demo recién sembrado, `/login` y `/verificar/<código>` (SSR
    pública) responden 200 con el contenido esperado.
  - `docs/ESTADO.md` y `docs/DECISIONES.md`: completos (esta entrada cierra F14; ADR-032/ADR-033
    documentan las decisiones de esta fase).
- **Decisiones registradas:** ADR-032 (`pnpm audit`: 28 hallazgos corregidos, `next`/`@nestjs/core`
  documentados como excepción), ADR-033 (invariante I10 sin implementar hasta ahora,
  `IdempotenciaInterceptor`, test consolidado I1-I10).
- **Pendiente (honestamente documentado, no se fuerza bajo presión de tiempo):**
  - `next@14→15` y `@nestjs/core@10→11`: 22 hallazgos de `pnpm audit` que requieren un upgrade de
    versión mayor del framework, con su propio ciclo de regresión manual — ver ADR-032.
  - `docker compose up -d`, `kind create cluster` y `scripts/smoke-k8s.sh` contra un cluster real
    no se pudieron ejecutar en este sandbox (sin Docker daemon) — el DoD final se reverificó con
    los servicios nativos de Postgres/Redis del sandbox en su lugar (ver arriba), consistente con
    el patrón de todo el proyecto (ADR-002 y siguientes).
  - Ningún controller usa `@ApiOperation`/`@ApiResponse`/`@ApiTags` — `docs/API.md` se genera con
    categorías inferidas de la ruta y sin descripciones de respuesta más allá del código HTTP.
    Pulido de documentación pendiente, no bloqueante.
  - Los pendientes ya documentados en F7/F9/F11/F13 (job de transición VENCIDO, PDF/A real vía
    veraPDF, MailHog real vía Docker, jobs "firmas-pendientes"/"exportaciones" como cola async)
    siguen igual — F14 no los retoma, son gaps de alcance ya evaluados y honestamente diferidos en
    sus fases correspondientes.

## Insumos de referencia

- `db/modelo_datos_psdte.sql`: **recibido** (2026-07-22), usado en F1.
- XML firmado de referencia del pagaré: **recibido** (2026-07-22,
  `packages/xml-engine/test/fixtures/pagare-referencia-firmado.xml`), usado para cerrar F4. Dos intentos
  previos de subida resultaron ser el mismo archivo no relacionado (un "Diploma Digital" del MEC de
  Brasil, namespace `http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd`) — se avisó al usuario y se
  descartó sin usarlo ambas veces. Ver ADR-014 para el detalle de la estructura real observada.

## Próximos pasos

Las 15 fases del plan (F0–F14) están completas. Lo que sigue no es "próxima fase" sino deuda
honestamente diferida a lo largo del proyecto, a retomar cuando haya infraestructura real
disponible (Docker, WS reales) o se decida invertir en ella:

- `next@14→15` y `@nestjs/core@10→11`: upgrades de versión mayor pendientes de `pnpm audit` (22
  hallazgos) — requieren su propio ciclo de regresión manual, no una fase automática. Ver ADR-032.
- El job "vencimientos" (transición VENCIDO vía `fn_aplicar_evento`) sigue pendiente — requiere
  catálogo nuevo + soporte en xml-engine. Ver ADR-030.
- El job "firmas-pendientes" (poll de proveedores de firma sin callback) sigue pendiente — no hay
  nada real que probar hasta que exista un proveedor REAL sin callback.
- Conformidad PDF/A real (veraPDF) queda pendiente — ver "Pendiente" en F9.
- MailHog real (Docker) no se pudo levantar en este sandbox — ver "Pendiente" en F11 (`maildev`
  como sustituto de prueba, sin impacto en el código de producción).
- `docker build`/`kind`/`kubectl apply` contra un cluster real no se pudieron ejecutar en este
  sandbox — ver "Pendiente" en F13/F14 y `docs/RUNBOOK.md` sección 7. Antes de operar en un cluster
  real: `kustomize build` de cada overlay + `kubeconform -strict` real + `scripts/smoke-k8s.sh`.
- Ningún controller usa `@ApiOperation`/`@ApiResponse`/`@ApiTags` — `docs/API.md` queda con
  categorías inferidas de la ruta en vez de una taxonomía explícita. Pulido, no bloqueante.
- Editor visual de tabla clave/valor para JSON crudo en `admin/integraciones` (F10) y posible
  editor visual similar para `admin/parametros`/`admin/catalogos` (F12) — pulido de UI, no
  bloqueante de ningún DoD.

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

## Insumos de referencia

- `db/modelo_datos_psdte.sql`: **recibido** (2026-07-22), usado en F1.
- XML firmado de referencia del pagaré: **recibido** (2026-07-22,
  `packages/xml-engine/test/fixtures/pagare-referencia-firmado.xml`), usado para cerrar F4. Dos intentos
  previos de subida resultaron ser el mismo archivo no relacionado (un "Diploma Digital" del MEC de
  Brasil, namespace `http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd`) — se avisó al usuario y se
  descartó sin usarlo ambas veces. Ver ADR-014 para el detalle de la estructura real observada.

## Próximos pasos

- F9 (Exportación y preservación): siguiente fase autónoma a ejecutar — jobs PDF/A y contenedor,
  verificador offline (`packages/xml-engine/src/offline-verifier.ts` + CLI), resellado LTV.
- Job de vencimiento (cron, evento VENCIDO) queda pendiente hasta que exista infraestructura de jobs —
  ver "Pendiente" en F7.
- `GET /dte` y `GET /dte/:id/xml?version=n` quedan pendientes — ver "Pendiente" en F8.

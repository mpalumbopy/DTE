# PLAN DE DESARROLLO AUTÓNOMO — SISTEMA PSDTE / PAGARÉ ELECTRÓNICO (DTE)

**Documento de ejecución para Claude Code · v1.0 · Julio 2026**

> Este documento es un plan de desarrollo completo y autoejecutable. Claude Code debe leerlo de punta a punta y ejecutar las fases F0→F14 en orden, sin intervención humana, hasta que todos los criterios de aceptación (DoD) pasen. El resultado es un producto listo para levantar y operar en Kubernetes, con las integraciones de firma digital y sello de tiempo (TSA) desacopladas tras interfaces, operando desde el día 1 con un **simulador conmutable**, y una **interfaz web de administración** para cargar las URLs y parámetros de los web services reales cuando estén disponibles.

---

## 0. INSTRUCCIONES DE EJECUCIÓN PARA CLAUDE CODE

### 0.1 Reglas de operación autónoma

1. **Ejecutar fases en orden estricto** F0 → F14. No avanzar de fase hasta que su `DoD` (Definition of Done) pase por completo.
2. Cada fase termina con un bloque **DoD** de comandos verificables. Ejecutarlos literalmente. Si algo falla: corregir y reintentar. **No pedir confirmación humana.**
3. **Commit por fase**: al cerrar cada fase, `git add -A && git commit -m "feat(F<N>): <resumen>"`. Mantener el árbol limpio.
4. Ante ambigüedad, aplicar la decisión por defecto documentada en la sección **0.4 Decisiones por defecto**. Nunca bloquearse esperando respuesta.
5. **Nunca** degradar una invariante crítica (sección 2) para hacer pasar un test. Los tests se adaptan al diseño, no al revés.
6. Los servicios externos de firma/TSA/OCSP **no existen aún**: todo el desarrollo se hace contra el **modo SIMULADOR** (fase F5). El código de producción jamás debe importar el simulador directamente: solo a través del `ProviderFactory`.
7. Idioma: código e identificadores en inglés técnico donde sea estándar (NestJS/Next), dominio y mensajes de usuario en **español**. Los nombres de tablas y campos de BD quedan en español como el DDL de referencia.
8. Node 20 LTS, pnpm 9, TypeScript 5 estricto (`"strict": true`) en todo el monorepo.
9. Si una librería listada tuviera una incompatibilidad, sustituir por equivalente funcional y documentarlo en `docs/DECISIONES.md` (ADR corto).
10. Mantener `docs/ESTADO.md` actualizado al cierre de cada fase: fase, fecha, DoD ejecutado, pendientes.

### 0.2 Entorno de trabajo esperado

- Docker disponible para levantar PostgreSQL 15, Redis 7 y MailHog en desarrollo (`docker compose -f infra/dev/docker-compose.yml up -d`).
- Sin acceso a internet garantizado en runtime: **vendorizar** todo lo necesario vía lockfile. Ninguna llamada externa en tests (el simulador cubre firma/TSA/OCSP).
- Kubernetes objetivo: 1.28+. Los manifests deben validar con `kubectl apply --dry-run=client` y `kubeconform`.

### 0.3 Estructura de trabajo

Monorepo pnpm workspaces + Turborepo:

```
psdte/
├── package.json                  # workspaces raíz, scripts turbo
├── pnpm-workspace.yaml
├── turbo.json
├── .editorconfig  .gitignore  .nvmrc (v20)
├── CLAUDE.md                     # resumen operativo para Claude Code (F0 lo genera desde este plan)
├── docs/
│   ├── PLAN.md                   # este documento
│   ├── ESTADO.md                 # bitácora de fases
│   ├── DECISIONES.md             # ADRs
│   ├── API.md                    # generado desde OpenAPI
│   └── RUNBOOK.md                # operación (F13)
├── apps/
│   ├── api/                      # NestJS 10
│   └── web/                      # Next.js 14 (App Router)
├── packages/
│   ├── shared/                   # tipos TS compartidos (DTOs, enums de catálogos, códigos de error)
│   ├── xml-engine/               # generación/validación/canonicalización XML del perfil DTE
│   └── crypto-providers/         # puertos + adaptadores firma/TSA/OCSP + SIMULADOR
├── db/
│   ├── migrations/               # SQL puro versionado (node-pg-migrate)
│   ├── seeds/
│   └── modelo_datos_psdte.sql    # DDL de referencia (ya provisto; F1 lo convierte en migraciones)
├── infra/
│   ├── dev/docker-compose.yml    # postgres, redis, mailhog
│   ├── docker/Dockerfile.api  Dockerfile.web
│   └── k8s/                      # manifests (F13)
└── .github/workflows/ci.yml
```

### 0.4 Decisiones por defecto (aplicar sin preguntar)

| Tema | Decisión |
|---|---|
| ORM | TypeORM 0.3 con `synchronize:false`; el esquema lo gobiernan las migraciones SQL |
| Migraciones | `node-pg-migrate` con archivos `.sql` (up/down) |
| Auth | JWT access 15 min + refresh 8 h rotativo en cookie httpOnly; MFA TOTP (otplib) obligatorio para roles ADMIN_PSDTE, OPERADOR_EMISION, AUTORIDAD, AUDITOR |
| Hash de contraseñas | argon2id |
| Validación de entrada | class-validator + class-transformer, `whitelist:true, forbidNonWhitelisted:true` |
| Documentación API | @nestjs/swagger en `/api/docs` (deshabilitada en prod salvo flag) |
| Colas | BullMQ + Redis; colas: `notificaciones`, `exportaciones`, `resellado-ltv`, `vencimientos`, `reconciliacion` |
| Cifrado de credenciales de integraciones | AES-256-GCM con clave `APP_ENCRYPTION_KEY` (32 bytes base64) provista por Secret de K8s |
| XML | libxmljs2 (XSD + parseo endurecido `{nonet:true, noent:false, dtdload:false}`); xmldsigjs + xadesjs para XAdES; C14N exclusivo |
| XSD oficial | No disponible aún → usar `packages/xml-engine/schema/pagare-dte.provisional.xsd` (F4 lo construye por ingeniería inversa del XML de referencia). Punto de reemplazo documentado |
| PDF | Plantilla HTML + puppeteer (chromium headless en imagen api-worker) + Ghostscript a PDF/A-2b |
| Frontend UI kit | Tailwind CSS + shadcn/ui; tablas con TanStack Table; formularios react-hook-form + zod |
| Estado remoto front | TanStack Query; auth por cookies (no localStorage) |
| i18n | Solo es-PY por ahora, strings centralizados en `apps/web/src/i18n/es.ts` |
| IDs internos | UUID v4 en BD; el ID-DTE de negocio se genera según sección 5.3 |
| Zona horaria | Todo en UTC; presentación en America/Asuncion en el front |
| Logs | pino (api) JSON estructurado; requestId (AsyncLocalStorage) en cada línea |
| Observabilidad | OpenTelemetry SDK con exporter OTLP configurable por env (no-op si no hay endpoint) |
| Licencias | Solo dependencias MIT/Apache-2/BSD/ISC |

---

## 1. VISIÓN DEL PRODUCTO

Sistema PSDTE (Prestador de Servicios de DTE) para **pagaré electrónico** conforme a Ley 6822/2021, Decreto 7576/2022, Resolución 0391/2026, DOC-DTE-01 v2.0 y FOR-DTE-01 v2.0 (Paraguay). Servicios núcleo: **emisión, registro, custodia, consulta/verificación**, más transferencia por **endoso**, **pagos**, **bloqueos por autoridad**, **cancelación**, **exportación probatoria** (PDF/A + contenedor ZIP con manifiesto) y **preservación ≥ 10 años** con resellado LTV.

El XML firmado (perfil `http://acraiz.gov.py/pagare/arhivos-en-xsd` — *sic*, "arhivos" sin c, no corregir) es la **fuente de verdad jurídica**; PostgreSQL es la proyección operativa.

**Particularidad central de este plan:** los web services de **firma digital cualificada**, **sello de tiempo (TSA)** y **validación de revocación (OCSP/CRL/TSL)** aún no están definidos por los proveedores. El sistema debe:

1. Definir **puertos** (interfaces TypeScript) estables para cada servicio.
2. Incluir un **adaptador SIMULADOR** completo (CA propia efímera, firmas XAdES-T criptográficamente reales, TSA RFC-3161 simulada) para operar de punta a punta desde el día 1.
3. Incluir **adaptadores HTTP genéricos** parametrizables (URL, auth, headers, timeouts, mapeo de campos) para conectar los WS reales **sin recompilar**.
4. Exponer una **pantalla de administración** (`/admin/integraciones`) para cargar URLs y parámetros, probar conexión y conmutar SIMULADOR ↔ REAL por servicio, con auditoría del cambio.

---

## 2. INVARIANTES CRÍTICAS (NO NEGOCIABLES)

| # | Invariante | Implementación obligatoria |
|---|---|---|
| I1 | **Singularidad**: ID-DTE único, jamás reutilizado | `UNIQUE(id_dte)`; sin DELETE de `dte`; cancelación es estado |
| I2 | **Control exclusivo**: un solo tenedor vigente por DTE | Índice único parcial `uq_tenencia_vigente` + `EXCLUDE gist` anti-solapamiento |
| I3 | **Anti doble disposición** | Toda mutación pasa por `fn_aplicar_evento` (SQL) con `SELECT … FOR UPDATE`; el servicio `EventosService` es la única puerta |
| I4 | **Append-only**: eventos, versiones XML, evidencias, auditoría | Triggers `fn_bloquear_modificacion` rechazan UPDATE/DELETE |
| I5 | **Trazabilidad**: hash encadenado | `dte_evento.hash_evento/hash_anterior`; `auditoria_log` con hash chain |
| I6 | **Transiciones válidas** | Validación contra `cat_transicion` dentro de `fn_aplicar_evento` |
| I7 | **Encadenamiento de firmas** | La firma del evento N referencia `#evento_N` y `#evento_N-1` (o `#dDTE…` si N=1) |
| I8 | **El XML manda** | Job de reconciliación XML↔BD; ante discrepancia, alerta e incidencia |
| I9 | **Sin claves privadas de terceros** | El sistema nunca custodia claves de las partes; la firma ocurre vía provider externo (o simulador) |
| I10 | **Operaciones nunca a medias** | Transacción completa o estado explícito `PENDIENTE_*`; idempotencia por `Idempotency-Key` |

---

## 3. ARQUITECTURA

```
                    ┌──────────────────────────── Kubernetes ────────────────────────────┐
 Usuario ── HTTPS ──► Ingress ──► web (Next.js SSR) ──► api (NestJS, N réplicas)          │
                    │                                    │            │                   │
 Verif. pública ────►                                    │            ├─► PostgreSQL (HA) │
                    │                                    │            ├─► Redis (BullMQ)  │
                    │                        api-worker (jobs) ◄──────┘   │               │
                    │                             │                        └─► Object     │
                    │                             ▼                            Storage    │
                    │        packages/crypto-providers (ProviderFactory)      (WORM)      │
                    │          ├── SIMULADOR (in-process)                                  │
                    │          └── HTTP adapters ──► WS Firma / TSA / OCSP (futuros)      │
                    └──────────────────────────────────────────────────────────────────────┘
```

- **apps/api**: REST + lógica de dominio. Réplicas sin estado.
- **api-worker**: mismo build del api con `PROCESS_ROLE=worker`; procesa colas (PDF/A, contenedores, resellado, notificaciones, vencimientos, reconciliación). Incluye chromium/ghostscript en imagen.
- **apps/web**: Next.js 14 App Router; SSR para la página pública de verificación (SEO/QR) y SPA autenticada para operación.
- **packages/crypto-providers**: corazón de la extensibilidad pedida (sección 6).

---
## 4. MODELO DE DATOS

Base: el DDL `db/modelo_datos_psdte.sql` ya provisto (esquema `psdte`, PostgreSQL 15+), que incluye: catálogos CAT-DTE-01..10, geográficos, seguridad (usuario/rol/sesión con MFA), personas, núcleo `dte` + partes + condiciones + lugares, `dte_tenencia` (control exclusivo), `dte_evento` append-only con detalles (`dte_endoso`, `dte_pago`, `dte_cancelacion`, `dte_bloqueo`, `dte_anotacion`), capa probatoria (`dte_xml_version`, `firma`, `certificado`, `evidencia`, `evidencia_revocacion`, `resellado_ltv`), operación (`consulta_verificacion`, `exportacion`, `notificacion`, `auditoria_log`, `incidencia`) y `fn_aplicar_evento`.

### 4.1 Tablas NUEVAS a agregar por migración (F1) — capa de integraciones

```sql
-- Servicios externos configurables desde la UI de administración
CREATE TABLE psdte.integracion_ws (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo              VARCHAR(20) NOT NULL CHECK (tipo IN ('FIRMA','TSA','OCSP','CRL','TSL','NOTIF_EMAIL')),
    nombre            VARCHAR(80) NOT NULL,
    modo              VARCHAR(12) NOT NULL DEFAULT 'SIMULADOR' CHECK (modo IN ('SIMULADOR','REAL','DESHABILITADO')),
    base_url          TEXT,
    endpoints         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"firmar":"/v1/sign","estado":"/v1/status/{id}"}
    auth_tipo         VARCHAR(12) NOT NULL DEFAULT 'NONE' CHECK (auth_tipo IN ('NONE','BASIC','BEARER','API_KEY','MTLS')),
    credenciales_cifradas TEXT,          -- AES-256-GCM(JSON) con APP_ENCRYPTION_KEY: {user,pass}|{token}|{apiKeyHeader,apiKey}
    mtls_cert_cifrado TEXT,              -- PEM cifrado (si MTLS)
    mtls_key_cifrada  TEXT,
    headers_extra     JSONB NOT NULL DEFAULT '{}'::jsonb,
    timeout_ms        INTEGER NOT NULL DEFAULT 15000,
    reintentos        SMALLINT NOT NULL DEFAULT 3,
    backoff_ms        INTEGER NOT NULL DEFAULT 2000,
    mapeo_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- plantillas request/response (sección 6.4)
    verificar_tls     BOOLEAN NOT NULL DEFAULT TRUE,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_test       JSONB,             -- {ok,fecha,latencia_ms,detalle}
    actualizado_por   UUID REFERENCES psdte.usuario(id),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, nombre)
);

-- Solo UNA configuración activa por tipo puede estar en modo distinto de DESHABILITADO
CREATE UNIQUE INDEX uq_integracion_activa_por_tipo
    ON psdte.integracion_ws(tipo) WHERE modo <> 'DESHABILITADO' AND activo;

-- Historial de cambios de configuración (auditoría específica, además de auditoria_log)
CREATE TABLE psdte.integracion_ws_historial (
    id                BIGSERIAL PRIMARY KEY,
    integracion_id    UUID NOT NULL REFERENCES psdte.integracion_ws(id),
    cambio            JSONB NOT NULL,        -- diff sin credenciales en claro
    usuario_id        UUID REFERENCES psdte.usuario(id),
    ocurrido_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solicitudes de firma pendientes (flujo asíncrono con el firmador de las partes)
CREATE TABLE psdte.solicitud_firma (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id            UUID REFERENCES psdte.dte(id),
    ambito            VARCHAR(30) NOT NULL,                -- DATOS_GENERALES | EVENTO
    nodo_ref          VARCHAR(80) NOT NULL,                -- id del nodo a firmar (dDTE… / eDTE…-NNN)
    firmante_persona_id UUID NOT NULL REFERENCES psdte.persona(id),
    rol_firmante      VARCHAR(30) NOT NULL,
    estado            VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE','ENVIADA','FIRMADA','RECHAZADA','EXPIRADA','ERROR')),
    provider_ref      TEXT,                                -- id de transacción en el WS externo
    xml_a_firmar_hash CHAR(64) NOT NULL,
    resultado         JSONB,
    expira_en         TIMESTAMPTZ NOT NULL,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_solicitud_firma_pend ON psdte.solicitud_firma(estado) WHERE estado IN ('PENDIENTE','ENVIADA');

-- Parámetros generales editables desde UI (datos del PSDTE, URLs públicas, umbrales)
CREATE TABLE psdte.parametro_sistema (
    clave             VARCHAR(60) PRIMARY KEY,
    valor             JSONB NOT NULL,
    descripcion       TEXT,
    editable          BOOLEAN NOT NULL DEFAULT TRUE,
    actualizado_por   UUID REFERENCES psdte.usuario(id),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 Seeds obligatorios (F1)

- Catálogos CAT-DTE-01..10 (del DDL de referencia) + geográficos mínimos (Paraguay 600, Capital/Asunción) + monedas PYG/USD + tipos de documento.
- `parametro_sistema`: `psdte.datos` (nombre, fantasía, RUC, resolución MIC, teléfono, email, sitio web), `verificacion.base_url`, `exportacion.retencion_dias`, `ltv.resello_meses`, `password.politica`.
- `integracion_ws`: una fila por tipo (`FIRMA`, `TSA`, `OCSP`, `CRL`, `TSL`, `NOTIF_EMAIL`) en modo `SIMULADOR` (NOTIF_EMAIL → MailHog en dev).
- Usuarios demo (solo si `SEED_DEMO=true`): `admin@psdte.local` (ADMIN_PSDTE), `operador@`, `tenedor@`, `deudor@`, `autoridad@`, `auditor@` — contraseña `Cambiar.123`, MFA pre-enrolado con secreto fijo documentado en `docs/RUNBOOK.md`.
- Escenario demo completo: 1 DTE emitido + 1 endosado + 1 pagado/cancelado (replicando el XML de referencia) para que la UI muestre datos reales desde el primer arranque.

### 4.3 Reglas de acceso a datos

- Repositorios TypeORM solo para lectura y escrituras simples; **toda mutación de estado del DTE invoca `fn_aplicar_evento`** vía query runner transaccional.
- `synchronize:false`; entidades espejo del DDL, `schema: 'psdte'`.
- Pool: `max=10` por réplica api, `max=5` por worker; `statement_timeout=15s` (api) / `120s` (worker).

---

## 5. BACKEND — apps/api (NestJS)

### 5.1 Módulos y archivos

```
apps/api/src/
├── main.ts                      # bootstrap, helmet, cors, versioning /api/v1, pino, otel
├── app.module.ts
├── config/                      # zod-validated env (config.schema.ts)
├── common/
│   ├── guards/ (jwt, roles, mfa, idempotency)
│   ├── interceptors/ (auditoria, request-id, timeout)
│   ├── filters/ (catalogo-error.filter.ts → formato CAT-DTE-10)
│   ├── decorators/ (@Roles, @Niveles, @IdempotencyKey, @Publico)
│   └── crypto/ (aes-gcm.service.ts, hash-chain.service.ts)
├── modules/
│   ├── auth/            # login, refresh, logout, mfa (enrol/verify), sesiones
│   ├── usuarios/
│   ├── personas/
│   ├── catalogos/
│   ├── parametros/
│   ├── integraciones/   # CRUD integracion_ws + test conexión + conmutación (sección 6.5)
│   ├── emision/
│   ├── eventos/         # EventosService = única puerta a fn_aplicar_evento
│   ├── endosos/
│   ├── pagos/
│   ├── bloqueos/
│   ├── cancelacion/
│   ├── firmas/          # orquestación de solicitud_firma + validación XAdES
│   ├── verificacion/
│   ├── exportacion/
│   ├── preservacion/    # resellado LTV
│   ├── notificaciones/
│   ├── auditoria/
│   └── salud/           # /healthz /readyz /metrics
└── jobs/                # procesadores BullMQ (solo activos si PROCESS_ROLE=worker)
```

### 5.2 API REST (contrato completo)

Formato de error uniforme (filter global, códigos de `cat_error`):
```json
{ "error": "ERR-ESTADO-001", "mensaje": "Transición de estado no permitida",
  "detalle": {}, "requestId": "uuid", "timestamp": "ISO8601" }
```

| Método y ruta (`/api/v1`) | Descripción | Roles | Notas |
|---|---|---|---|
| POST /auth/login | user+pass → si rol crítico, exige paso MFA | Público | rate-limit 5/min/IP |
| POST /auth/mfa/verify | TOTP → emite tokens | Público (sesión parcial) | |
| POST /auth/refresh · POST /auth/logout | rotación / revocación | Autenticado | cookie httpOnly |
| POST /auth/mfa/enrol | genera secreto + QR otpauth | Autenticado | |
| CRUD /usuarios, /usuarios/:id/roles | gestión de usuarios | ADMIN_PSDTE | segregación: ADMIN no opera DTE |
| CRUD /personas (+búsqueda por documento) | intervinientes | OPERADOR_EMISION+ | UNIQUE doc |
| GET /catalogos/:codigo | catálogos versionados | Autenticado | cache 5 min + header X-Catalogos-Version |
| GET/PUT /parametros | parámetros del sistema | ADMIN_PSDTE | |
| POST /dte/emisiones | crear borrador (partes, montos, condiciones, lugares) | OPERADOR_EMISION | valida semántica + monto→letras |
| GET /dte/emisiones/:id | estado del borrador y de las firmas | involucrados | |
| POST /dte/emisiones/:id/firmas/solicitar | crea solicitud_firma por cada firmante y la envía al provider | OPERADOR_EMISION | |
| POST /dte/emisiones/:id/firmas/callback | webhook/entrega de firma del provider (o simulador) | firmado HMAC | valida XAdES completo |
| POST /dte/emisiones/:id/confirmar | sello PSDTE + `fn_aplicar_evento(EMISION)` + tenencia inicial + XML v1 | OPERADOR_EMISION | 409 ERR-DTE-409 |
| GET /dte (filtros: estado, vencimiento, texto) | bandeja según rol | nivel 2+ | paginación cursor |
| GET /dte/:id · GET /dte/:id/eventos · GET /dte/:id/xml?version=n | detalle / timeline / XML | nivel 2+ | XML nivel 2+/AUDITOR |
| POST /dte/:id/endosos | inicia endoso (endosatario por documento) | TENEDOR vigente | 403 ERR-CTRL-001 |
| POST /dte/:id/endosos/:n/firmas/{endosante\|endosatario} | firmas del evento (Reference N y N-1) | parte que firma | al completar ambas → cierre atómico |
| POST /dte/:id/pagos | monto ≤ saldo; recalcula; PAGADO_PARCIAL/TOTAL | según flujo | Idempotency-Key |
| POST /dte/:id/bloqueos · DELETE /dte/:id/bloqueos/:bid | medida de autoridad / levantamiento (evento, no borra) | AUTORIDAD | registra SLA orden/recepción/aplicación |
| POST /dte/:id/cancelacion | motivo; requiere saldo 0 u otra causal | TENEDOR/sistema | |
| GET /dte/:id/verificacion | integridad + estado + cadena firmas según nivel | nivel según auth | |
| GET /verificacion?codigo=… | **pública** por QR/URI: existencia, estado, integridad. Sin datos personales | Público | rate-limit + registro en consulta_verificacion |
| GET /dte/:id/exportacion?tipo=pdfa\|contenedor | 202 encola job → GET /exportaciones/:jobId | nivel 2+ | descarga con hash |
| GET/POST/PUT /admin/integraciones … | ver sección 6.5 | ADMIN_PSDTE | |
| GET /auditoria?filtros · GET /incidencias | trazabilidad | AUDITOR | |
| GET /healthz /readyz /metrics | operación | Público interno | readyz = BD+Redis+provider activo |

Transversales: `Idempotency-Key` obligatorio en todo POST de mutación (tabla redis 24 h); OpenAPI 3.1 exportada a `docs/API.md` en CI; paginación por cursor `?after=`; todas las respuestas de verificación incluyen `hashXmlVigente` y `version`.

### 5.3 Generador de ID-DTE

Formato provisional (confirmable sin refactor, centralizado en `IdDteService`): `[prefijo][AAAAMMDD emisión][AAAAMMDD autorización][secuencial 9 dígitos]` con prefijos `vDTE|dDTE|eDTE` compartiendo sufijo, y eventos `-NNN`. Secuencial desde `SEQUENCE psdte.seq_dte`; fecha de autorización desde `parametro_sistema['psdte.fecha_autorizacion']`. **Nunca** reutilizar (I1).

### 5.4 Máquina de estados

Estados y transiciones = seeds de `cat_estado_dte` / `cat_transicion` del DDL. El backend no hardcodea códigos: `CatalogosService` los expone tipados vía `packages/shared`. Job `vencimientos` (cron 15 min) aplica evento VENCIDO cuando `now() > fecha_vencimiento` y saldo > 0, vía `fn_aplicar_evento`.

---

## 6. CAPA DE INTEGRACIONES: FIRMA, TSA, OCSP/CRL/TSL (EL CORAZÓN EXTENSIBLE)

### 6.1 Puertos (packages/crypto-providers/src/ports.ts)

```ts
export interface FirmaProviderPort {
  /** Inicia una solicitud de firma XAdES-T sobre un nodo XML canónico.
   *  El provider real puede ser asíncrono (el titular firma en su dispositivo). */
  solicitarFirma(req: {
    solicitudId: string;            // UUID de solicitud_firma
    xmlCanonico: Buffer;            // nodo a firmar (C14N exclusivo)
    referencias: string[];          // URIs: ['#eDTE...-002', '#eDTE...-001']
    firmante: { documento: string; tipoDocumento: string; nombre: string; email?: string };
    rolFirmante: string;
    callbackUrl: string;            // adonde el WS devuelve la firma
    expiraEn: Date;
  }): Promise<{ providerRef: string; estado: 'ENVIADA' | 'FIRMADA'; xadesXml?: string }>;

  consultarEstado(providerRef: string): Promise<{ estado: 'PENDIENTE'|'FIRMADA'|'RECHAZADA'|'EXPIRADA'; xadesXml?: string; detalle?: string }>;
  validarFirma(xadesXml: string, xmlContexto: Buffer): Promise<ValidacionFirma>;
  probarConexion(): Promise<{ ok: boolean; latenciaMs: number; detalle: string }>;
}

export interface TsaProviderPort {
  sellarHash(hashSha256: Buffer): Promise<{ tokenTsrDer: Buffer; fecha: Date; tsaSubject: string }>; // RFC 3161
  probarConexion(): Promise<{ ok: boolean; latenciaMs: number; detalle: string }>;
}

export interface RevocacionProviderPort {
  verificarCertificado(certDer: Buffer): Promise<{
    resultado: 'GOOD'|'REVOKED'|'UNKNOWN'; via: 'OCSP'|'CRL';
    evidenciaRaw: Buffer; enTsl: boolean; cadenaOk: boolean;
  }>;
  obtenerTslSnapshot(): Promise<{ xml: Buffer; fecha: Date }>;
  probarConexion(): Promise<{ ok: boolean; latenciaMs: number; detalle: string }>;
}
```

### 6.2 ProviderFactory (regla de uso obligatoria)

`ProviderFactory` lee `integracion_ws` (cache 60 s, invalidada por evento al guardar config) y devuelve el adaptador según `modo`:
- `SIMULADOR` → adaptadores in-process del paquete.
- `REAL` → adaptadores HTTP genéricos configurados con `base_url`, `endpoints`, auth, headers, timeout, reintentos con backoff, `mapeo_payload`.
- `DESHABILITADO` → adaptador `Disabled` que rechaza con `ERR-PKI-503` y registra incidencia.

Ningún módulo importa adaptadores concretos: **solo el factory**. Si el WS real cae en runtime → reintentos → si agota, la operación queda `PENDIENTE_*` (I10) y se registra incidencia `ERR-PKI-503`. **Sin fallback automático a simulador en producción** (`NODE_ENV=production` + `ALLOW_SIMULATOR=false` lo bloquea con error de arranque si alguna integración crítica quedó en SIMULADOR).

### 6.3 SIMULADOR (adaptadores incluidos, conmutables)

- **CA efímera**: al primer arranque genera (node-forge) una CA raíz "AC SIMULADA PSDTE — NO VÁLIDA LEGALMENTE" y una TSA intermedia; persiste PEMs cifrados en `parametro_sistema['simulador.pki']`.
- **FirmaSimulador**: emite al vuelo un certificado F3-like para el firmante (CN=nombre, SERIALNUMBER=CI<doc>), construye la firma **XAdES-T real** (xadesjs: SignedProperties + SigningTime + referencias indicadas + C14N exclusivo + RSA-SHA256) y la devuelve. Modo asíncrono simulable: `SIM_FIRMA_DELAY_MS` y `SIM_FIRMA_APRUEBA=auto|manual` (en manual, la UI de demo muestra botón "Firmar como <parte>" — página `/dev/firmador` visible solo con `ALLOW_SIMULATOR=true`).
- **TsaSimulador**: token RFC-3161 (asn1js) firmado por la TSA simulada.
- **RevocacionSimulador**: responde GOOD, `enTsl:true`, con evidencia raw sintética; certificados con OU=REVOCADO-TEST → REVOKED (para QA).
- Toda firma simulada agrega claim `simulada:true` en la tabla `firma.referencias` y el front muestra **banner ámbar "MODO SIMULADOR"** global cuando cualquier integración crítica está en SIMULADOR (endpoint `GET /admin/integraciones/estado-global`, visible para todos los autenticados).

### 6.4 Adaptadores HTTP genéricos (para los WS reales futuros)

Configurables 100 % por datos (sin recompilar):
- `endpoints`: plantillas de ruta con placeholders `{providerRef}`.
- `mapeo_payload`: plantillas Handlebars-like para request y JSONPath para response, p. ej.:
```json
{
  "solicitarFirma": {
    "request":  { "documento": "{{firmante.documento}}", "xmlB64": "{{xmlCanonicoB64}}", "refs": "{{referenciasCsv}}", "callback": "{{callbackUrl}}" },
    "response": { "providerRef": "$.data.transactionId", "estado": "$.data.status", "map_estado": { "SIGNED": "FIRMADA", "WAITING": "ENVIADA" } }
  },
  "sellarHash": { "request": { "hashHex": "{{hashHex}}", "algoritmo": "SHA-256" }, "response": { "tokenB64": "$.token" } }
}
```
- Auth: NONE/BASIC/BEARER/API_KEY/MTLS (certificado y clave PEM cifrados en BD, montados en agente https).
- Callback entrante `POST /api/v1/dte/emisiones/:id/firmas/callback` (y equivalente de eventos) verificado por HMAC (`X-Psdte-Signature`, secreto por integración) + validación XAdES completa antes de aceptar.
- Si el contrato real difiere más allá del mapeo, crear un adaptador dedicado implementando el puerto: **el resto del sistema no cambia**.

### 6.5 UI de administración de integraciones (`/admin/integraciones`) — requisito explícito

- **Listado**: tarjeta por tipo (FIRMA, TSA, OCSP, CRL, TSL, NOTIF_EMAIL) con estado (modo, activo, último test ok/fail + latencia, fecha).
- **Formulario de edición** por integración: modo (SIMULADOR/REAL/DESHABILITADO), base URL, tabla editable de endpoints, tipo de auth con campos condicionados (usuario/clave, token, api-key header+valor, upload PEM para mTLS), headers extra (clave/valor), timeout, reintentos, backoff, verificar TLS, editor JSON de `mapeo_payload` con validación de esquema.
- **Botón "Probar conexión"**: llama `POST /admin/integraciones/:id/test` → ejecuta `probarConexion()` del adaptador con la config **del formulario** (sin guardar) y muestra resultado + latencia; persiste en `ultimo_test` al guardar.
- **Conmutación a REAL**: exige test exitoso previo (≤ 15 min) y confirmación con re-ingreso de contraseña del admin; genera evento en `integracion_ws_historial` y en `auditoria_log`.
- Credenciales: se escriben pero **nunca se leen en claro** (API devuelve `"********"`); botón "rotar credenciales".
- Endpoints backend: `GET /admin/integraciones`, `GET /admin/integraciones/:id`, `PUT /admin/integraciones/:id`, `POST /admin/integraciones/:id/test`, `POST /admin/integraciones/:id/conmutar`, `GET /admin/integraciones/:id/historial`, `GET /admin/integraciones/estado-global`. Rol: ADMIN_PSDTE (+ MFA verificada en la sesión).

---

## 7. XML-ENGINE (packages/xml-engine)

- `builder/` genera el XML del perfil (`rDTE > DTE > gDatosGeneralesDTE + gEventos`) desde objetos de dominio, con **resolución obligatoria de placeholders** (`[AcreedorInicial]`, `[nombreEndosatario]`, `[Monto en letras]`… → error si queda alguno sin resolver antes de firmar).
- `schema/pagare-dte.provisional.xsd`: construirlo en F4 por ingeniería inversa del XML de referencia (elementos, orden, cardinalidades observadas; campos de dirección, partes física/jurídica, eventos 1/3/4). Documentar en el propio XSD los puntos a confirmar. Reemplazable por el oficial sin tocar código (`XSD_PATH` por env).
- `validator/`: XSD (libxmljs2 endurecido) + reglas semánticas: monto↔letras (conversor es-PY incluido con tests), vencimiento > emisión, coherencia temporal de eventos, códigos contra catálogos, unicidad de `condicionFirmante`.
- `c14n/`: canonicalización exclusiva; `hash/`: SHA-256 de nodos canónicos (base del hash encadenado).
- `xades/`: construcción/validación XAdES-T (firmas enveloped, referencias múltiples, SignedProperties, SignatureTimeStamp) usada por simulador y validación de firmas entrantes.
- Parser **tolerante** para lectura (acepta las inconsistencias del XML de referencia: numeroEvento repetido, placeholders) pero generador **estricto**.

## 8. FRONTEND — apps/web (Next.js 14, App Router)

```
apps/web/src/app/
├── (publico)/verificar/[codigo]/page.tsx   # SSR: existencia, estado, integridad, sin datos personales
├── (auth)/login/page.tsx  mfa/page.tsx
├── (privado)/layout.tsx                     # shell: sidebar por rol + banner MODO SIMULADOR
│   ├── dashboard/page.tsx                   # KPIs: emitidos, por vencer, bloqueados, jobs
│   ├── dte/page.tsx                         # bandeja con filtros servidor + TanStack Table
│   ├── dte/[id]/page.tsx                    # detalle: cabecera, partes, saldo, timeline de eventos con chips de firma, acciones según cat_transicion
│   ├── dte/[id]/endosar/page.tsx            # wizard endoso (buscar endosatario → texto → firmas 2 pasos)
│   ├── dte/[id]/pagar/page.tsx  bloquear/  exportar/
│   ├── emitir/page.tsx                      # wizard 5 pasos (datos → partes → condiciones → preview XML/PDF → ronda de firmas con estado por firmante)
│   ├── admin/usuarios/  admin/catalogos/  admin/parametros/
│   ├── admin/integraciones/page.tsx         # sección 6.5
│   ├── auditoria/page.tsx  incidencias/page.tsx
│   └── dev/firmador/page.tsx                # solo ALLOW_SIMULATOR: firma manual simulada
```

Detalles obligatorios: acciones calculadas desde la matriz de transiciones (nunca botones hardcodeados); errores mostrados como `mensaje (código)` desde CAT-DTE-10; montos formateados es-PY con moneda del DTE; conversión automática monto→letras editable-verificada; timeline con estado_previo→resultante, actor, firmas (chip verde/rojo con tooltip de certificado); página pública con QR renderizado y re-verificación en vivo; accesibilidad AA; middleware de auth por cookies con refresh transparente; manejo de sesión expirada.

## 9. JOBS (api-worker)

| Cola | Trigger | Acción |
|---|---|---|
| exportaciones | on-demand | PDF/A-2b (puppeteer+ghostscript, veraPDF check) y contenedor ZIP: dte.xml, representacion.pdf, evidencias (ocsp/crl/tsl/tsr), certificados, manifiesto.json + manifiesto sellado; hash a `exportacion` |
| resellado-ltv | cron diario | detecta versiones con `proximo_resellado` vencido → nuevo token TSA → `resellado_ltv` |
| vencimientos | cron 15 min | aplica evento VENCIDO vía fn_aplicar_evento |
| reconciliacion | cron horario | re-parsea XML vigente vs proyección BD; discrepancia → incidencia ALTA (I8) |
| notificaciones | eventos de dominio | emails con acuse (CAT-DTE-09), reintentos, MailHog en dev |
| firmas-pendientes | cron 1 min | poll `consultarEstado` de solicitudes ENVIADAS (para providers sin callback) + expiración |

---

## 10. SEGURIDAD (checklist implementable)

- Helmet + CORS restrictivo (origins por env) + rate limiting (global y por endpoint sensible).
- JWT RS256 con claves por Secret; refresh rotativo con detección de reuso (revoca familia).
- MFA TOTP obligatoria en roles críticos; enrolamiento forzado al primer login.
- argon2id (`memoryCost 19456, timeCost 2, parallelism 1`); política de contraseñas en `parametro_sistema`.
- AES-256-GCM para credenciales de integraciones y PKI del simulador (`APP_ENCRYPTION_KEY`).
- XML endurecido: `nonet:true, noent:false, dtdload:false` (anti-XXE) + límite de tamaño 2 MB por XML entrante.
- Cabecera `Idempotency-Key` en mutaciones; replay de callbacks bloqueado por HMAC + nonce + ventana temporal.
- Segregación: ADMIN_PSDTE no puede ejecutar operaciones de DTE (guard explícito); AUDITOR solo lectura.
- Logs sin datos personales sensibles ni credenciales; pino redact: `password, token, credenciales, authorization`.
- Dependencias: `pnpm audit --prod` en CI (falla en high/critical); lockfile congelado.
- Contenedores: usuario no root, readOnlyRootFilesystem, sin capacidades; imágenes distroless/slim.

## 11. KUBERNETES (infra/k8s) — F13

```
infra/k8s/
├── base/                              # Kustomize base
│   ├── namespace.yaml                 # psdte
│   ├── api-deployment.yaml           # 2 réplicas, probes /healthz /readyz, resources, PDB
│   ├── worker-deployment.yaml        # 1 réplica, PROCESS_ROLE=worker (imagen con chromium+ghostscript)
│   ├── web-deployment.yaml           # 2 réplicas Next standalone
│   ├── services.yaml  ingress.yaml   # TLS por cert-manager (anotaciones), rutas / → web, /api → api
│   ├── configmap.yaml                # config no sensible
│   ├── secrets.example.yaml          # plantilla: DATABASE_URL, REDIS_URL, JWT keys, APP_ENCRYPTION_KEY, HMAC_CALLBACK_SECRET
│   ├── hpa-api.yaml                  # CPU 70 %, min2 max6
│   ├── cronjob-backup.yaml           # pg_dump diario a objeto (placeholder de bucket)
│   ├── migrate-job.yaml              # job de migraciones pre-deploy (hook)
│   └── networkpolicy.yaml            # api/worker → postgres/redis; web → api; egreso restringido
├── overlays/dev/  overlays/prod/     # réplicas, dominios, ALLOW_SIMULATOR (dev:true, prod:false)
└── postgres/                          # SOLO dev/demo: statefulset PG15 + PVC; en prod se asume PG gestionado (URL por Secret)
```

Reglas: `readyz` verifica BD, Redis y que el ProviderFactory resuelva las integraciones activas; arranque **falla** en prod si `ALLOW_SIMULATOR=false` y alguna integración crítica sigue en SIMULADOR (mensaje claro). Todo manifest pasa `kubeconform -strict`.

### 11.1 Variables de entorno (contrato completo)

| Var | Ejemplo | Nota |
|---|---|---|
| DATABASE_URL | postgres://… | requerido |
| REDIS_URL | redis://… | requerido |
| JWT_PRIVATE_KEY / JWT_PUBLIC_KEY | PEM RS256 | Secret |
| APP_ENCRYPTION_KEY | base64 32 bytes | Secret |
| HMAC_CALLBACK_SECRET | aleatorio | Secret |
| PUBLIC_BASE_URL | https://psdte.example.py | arma enlaceQRDTE |
| ALLOW_SIMULATOR | dev true / prod false | candado |
| PROCESS_ROLE | api \| worker | |
| XSD_PATH | ruta al XSD (provisional u oficial) | reemplazo sin código |
| SEED_DEMO | true/false | datos demo |
| OTEL_EXPORTER_OTLP_ENDPOINT | opcional | no-op si falta |
| SMTP_* | host/puerto/user/pass | vía integración NOTIF_EMAIL |

## 12. TESTING Y CALIDAD

- **Unit** (Jest): xml-engine (builder, validador, monto→letras, C14N, hashes), providers (simulador firma/TSA/OCSP), servicios de dominio, AES-GCM, hash-chain. Cobertura mínima 80 % en packages y modules núcleo.
- **Integración** (Testcontainers PG+Redis): fn_aplicar_evento (transiciones válidas/ inválidas), append-only (UPDATE/DELETE rechazados), tenencia única, **carrera de endosos concurrentes (20 en paralelo → exactamente 1 prospera)**, pagos concurrentes sin saldo negativo, idempotencia.
- **E2E API** (supertest): flujo completo emisión→firmas(sim)→confirmar→endoso×2→pago→cancelación, replicando el escenario del XML de referencia; verificación pública; export contenedor y validación offline del manifiesto; admin integraciones (test conexión, conmutación bloqueada sin test).
- **E2E Web** (Playwright): login+MFA, wizard emisión, endoso 2 pasos con firmador simulado, verificación pública por QR, pantalla integraciones (probar conexión, guardar, banner simulador).
- **Lint/format**: eslint + prettier compartidos; `tsc --noEmit` en CI.
- CI (`.github/workflows/ci.yml`): install → lint → build → unit → integración → e2e api → e2e web (headless) → `pnpm audit` → kubeconform → export OpenAPI a docs/API.md. Todo verde = release candidate.

---

## 13. FASES DE EJECUCIÓN (F0–F14) — CADA UNA CON DoD VERIFICABLE

> Formato: **Objetivo → Tareas → DoD (comandos que deben salir en verde)**. Ejecutar secuencialmente. `pnpm` desde la raíz.

### F0 — Scaffolding del monorepo
Crear estructura 0.3, tooling (turbo, eslint/prettier, tsconfig base, .nvmrc), `infra/dev/docker-compose.yml` (postgres:15, redis:7, mailhog), esqueletos NestJS y Next.js compilables, `packages/shared|xml-engine|crypto-providers` vacíos compilables, CI base, y generar `CLAUDE.md` (resumen operativo: comandos, invariantes I1–I10, decisiones por defecto).
**DoD:** `pnpm install && pnpm build && pnpm lint` OK · `docker compose -f infra/dev/docker-compose.yml up -d` deja PG/Redis/MailHog healthy · `git log` muestra commit F0.

### F1 — Base de datos
Convertir `db/modelo_datos_psdte.sql` en migraciones ordenadas (extensiones→catálogos→núcleo→eventos→probatoria→operación→funciones/triggers), agregar migración de sección 4.1 (integracion_ws, historial, solicitud_firma, parametro_sistema) y seeds 4.2. Script `pnpm db:migrate` / `db:seed` / `db:reset`.
**DoD:** `pnpm db:reset` corre limpio · test SQL: doble tenencia vigente rechazada, UPDATE sobre dte_evento rechazado, transición inválida lanza ERR-ESTADO-001, `fn_aplicar_evento` feliz.

### F2 — Config, salud, auth y usuarios
Config zod, pino+requestId, filtro CAT-DTE-10, `/healthz|readyz|metrics`, AuthModule completo (login, MFA enrol/verify, refresh rotativo con detección de reuso, logout, guards Roles/Mfa), UsuariosModule, interceptor de auditoría con hash-chain.
**DoD:** unit+integración auth verdes · e2e: login admin demo → exige MFA → TOTP → accede; reuso de refresh revoca familia; auditoria_log encadena hashes (test verifica cadena).

### F3 — Catálogos, personas, parámetros
CRUD lectura catálogos con cache+versión, PersonasModule (unicidad documento, búsqueda), ParametrosModule, tipos compartidos generados en packages/shared desde seeds.
**DoD:** e2e catálogos/personas verdes · `GET /catalogos/CAT-DTE-03` responde matriz sembrada.

### F4 — xml-engine
Builder+validador+XSD provisional+semántica+monto→letras+C14N+hash. Fixture: reconstruir un XML equivalente al de referencia (sin firmas) y validar; parser tolerante lee el XML de referencia real completo (9 firmas) y extrae el modelo.
**DoD:** `pnpm --filter xml-engine test` verde con ≥ 85 % cobertura · fixture del XML real parsea y reporta sus inconsistencias conocidas como warnings, no errores.

### F5 — crypto-providers + simulador + ProviderFactory
Puertos 6.1, simulador 6.3 (CA efímera, XAdES-T real, TSA RFC3161, revocación), adaptadores HTTP genéricos 6.4 (aunque no haya WS real: test contra servidor mock local), factory con cache e invalidación, candado ALLOW_SIMULATOR.
**DoD:** firma simulada sobre nodo de prueba **valida criptográficamente** (verificación XAdES independiente en test) · token TSA parsea como RFC3161 · adaptador HTTP pasa tests contra mock (auth 4 tipos, mapeo, reintentos, timeout) · con `ALLOW_SIMULATOR=false` y FIRMA en SIMULADOR el bootstrap falla con mensaje claro.

### F6 — Emisión
EmisionModule + FirmasModule + solicitud_firma + callback HMAC + confirmar (sello PSDTE + fn_aplicar_evento(EMISION) + tenencia inicial + dte_xml_version v1 + evidencias + notificación). IdDteService 5.3.
**DoD:** e2e: borrador → solicitar firmas (3 partes) → simulador firma → confirmar → estado EMITIDO, XML v1 con 3 firmas de partes + sello, hash registrado; duplicar ID → ERR-DTE-409; XML con placeholder sin resolver → rechazo.

### F7 — Eventos: endoso, pago, bloqueo, cancelación, vencimiento
EventosService (única puerta), Endosos 2 pasos con firmas encadenadas (I7), Pagos con saldo, Bloqueos con SLA y levantamiento, Cancelación, job vencimientos.
**DoD:** e2e replica el ciclo del XML de referencia: 2 endosos + pago total + cancelación; **test de carrera: 20 endosos concurrentes → 1 OK y 19 ERR-CONC/CTRL** · bloqueo detiene endoso (ERR-ESTADO-003) y levantamiento restaura estado previo · verificación de cadena de hashes de eventos pasa.

### F8 — Verificación
VerificacionModule niveles 1–4, endpoint público con rate-limit y registro, verificación de integridad (hash + firmas + cadena de referencias).
**DoD:** e2e: pública muestra existencia/estado/integridad sin datos personales; alterar 1 byte del XML → integridad FALLA; interviniente ve timeline completo.

### F9 — Exportación y preservación
Jobs PDF/A y contenedor (estructura sección 9), verificador offline (`packages/xml-engine/src/offline-verifier.ts` + CLI `pnpm verificar contenedor.zip`), resellado LTV, reconciliación.
**DoD:** contenedor generado se verifica offline OK; alterar un artefacto → manifiesto lo detecta · PDF pasa chequeo PDF/A (veraPDF) · job resellado agrega token a resellado_ltv.

### F10 — Admin de integraciones (UI + API) — el requisito del usuario
Endpoints 6.5 completos + página `/admin/integraciones` con formulario, prueba de conexión desde el formulario, conmutación con doble confirmación y candados, historial, ocultamiento de credenciales, banner global de simulador.
**DoD:** Playwright: editar TSA → probar conexión (mock) OK → guardar → conmutar a REAL exige test previo y re-password → historial registra → volver a SIMULADOR → banner reaparece · API nunca devuelve credenciales en claro (test).

### F11 — Notificaciones, auditoría UI, incidencias
Emails con plantillas (emisión, solicitud de firma, endoso recibido, pago, bloqueo, vencimiento próximo) + acuses; pantallas auditoría/incidencias con filtros.
**DoD:** MailHog recibe los 6 tipos en el flujo e2e; pantalla auditoría filtra por entidad/fecha y verifica cadena.

### F12 — Frontend completo
Todas las páginas sección 8 con estados de carga/vacío/error, wizard emisión con preview, timeline, acciones por matriz, dashboard, i18n es-PY, responsive.
**DoD:** Playwright suite completa verde · `pnpm --filter web build` sin warnings de tipo · Lighthouse a11y ≥ 90 en /verificar y /login (script CI opcional, registrar resultado en docs/ESTADO.md).

### F13 — Kubernetes + observabilidad + runbook
Dockerfiles multi-stage (api, api-worker con chromium+ghostscript, web standalone), manifests 11, migrate-job, overlays dev/prod, `docs/RUNBOOK.md` (arranque, secretos, backup/restore PITR, conmutación a WS reales paso a paso, troubleshooting, plan de cese/retención 10 años).
**DoD:** `docker build` de las 3 imágenes OK · `kubeconform -strict infra/k8s/**` OK · `kind create cluster && kustomize build overlays/dev | kubectl apply -f -` → pods Ready, migrate-job Completed, `curl ingress/healthz` OK, flujo demo e2e contra el cluster pasa (script `scripts/smoke-k8s.sh`).

### F14 — Endurecimiento y cierre
`pnpm audit` limpio (o excepciones documentadas), revisión de invariantes I1–I10 con test dedicado por invariante (`tests/invariantes.spec.ts`), OpenAPI exportada a docs/API.md, docs/ESTADO.md y DECISIONES.md completos, tag `v1.0.0`.
**DoD final del producto:** desde repo limpio: `pnpm install && docker compose up -d && pnpm db:reset && pnpm dev` deja el sistema operable en http://localhost:3000 con datos demo, firma/TSA simuladas, pantalla de integraciones lista para cargar los WS reales; y `scripts/smoke-k8s.sh` verde en kind. **Todos los DoD F0–F13 re-ejecutados en verde.**

---

## 14. CRITERIOS DE "LISTO PARA OPERAR"

1. Un operador puede emitir, endosar, cobrar, bloquear, cancelar, verificar y exportar un pagaré sin tocar código.
2. Cuando lleguen los WS reales: ADMIN entra a `/admin/integraciones`, carga URL+auth+mapeo, prueba conexión, conmuta a REAL → el sistema opera con firma/TSA reales **sin redeploy** (si el contrato difiere del mapeo genérico, se agrega solo un adaptador que implementa el puerto).
3. Prod se niega a arrancar con simulador activo; dev/demo funciona completo con simulador.
4. Evidencia, auditoría y contenedores listos para el expediente OEC.

## 15. FUERA DE ALCANCE v1 (documentar, no implementar)
Conversión papel↔electrónico; XAdES-LTA (si el perfil lo exigiera: microservicio DSS, punto de extensión ya aislado en el puerto); multi-PSDTE/multi-tenant; app móvil; integración con pasarelas de pago.

— FIN DEL PLAN —

# DECISIONES (ADRs cortos)

Registro de decisiones tomadas cuando el plan (`docs/PLAN.md`) no cubre un caso explícitamente,
o cuando una librería listada se sustituye por incompatibilidad (regla 0.1.9 del plan).

## ADR-000 — Formato

Cada entrada: fecha, fase, contexto, decisión, alternativas descartadas.

---

## ADR-001 — Insumos de referencia faltantes (DDL y XML) al iniciar F0

- **Fecha:** 2026-07-22
- **Fase:** F0
- **Contexto:** El plan asume ya provistos `db/modelo_datos_psdte.sql` y un XML firmado de referencia del
  pagaré (perfil `http://acraiz.gov.py/pagare/arhivos-en-xsd`). Ninguno de los dos estaba disponible en el
  repositorio ni en los adjuntos al arrancar. Se consultó al usuario, quien confirmó que los subiría antes
  de ejecutar F1 (base de datos) y F4 (xml-engine).
- **Decisión:** F0 (scaffolding) no depende de estos archivos y se ejecuta primero. F1 y F4 quedan
  bloqueados hasta recibir los insumos; se documentará aquí si en su lugar se optó por construir una
  versión provisional propia.
- **Alternativas descartadas:** construir un DDL/XML de referencia inventado desde la sola lectura del plan
  y la normativa citada — se descarta por el riesgo de introducir un esquema o perfil XML incorrecto para
  un sistema con implicancias legales/probatorias (Ley 6822/2021).
- **Actualización 2026-07-22 (F1):** el usuario proveyó `db/modelo_datos_psdte.sql`. F1 queda desbloqueada
  y se ejecuta con el DDL real. El XML de referencia firmado sigue pendiente: F4 (xml-engine) permanece
  bloqueada hasta recibirlo.

## ADR-002 — Docker no disponible en el sandbox de desarrollo remoto (F0)

- **Fecha:** 2026-07-22
- **Fase:** F0
- **Contexto:** `dockerd` no puede arrancar en este entorno de ejecución remoto (contenedor efímero sin
  soporte para Docker anidado: `ulimit: error setting limit (Operation not permitted)`). El plan pide
  levantar Postgres/Redis/MailHog vía `infra/dev/docker-compose.yml`.
- **Decisión:** `infra/dev/docker-compose.yml` se mantiene sin cambios (es correcto para una máquina de
  desarrollo real o CI con Docker). En este sandbox se usan los binarios nativos ya instalados
  (`postgresql-16`, `redis-server`) para correr migraciones/tests localmente durante el desarrollo de las
  fases. No afecta el DoD real de F0 en un entorno con Docker funcional; se documenta para que quien
  retome el trabajo en otra máquina no se confunda si ve Postgres/Redis corriendo fuera de contenedores.
  MailHog no tiene equivalente nativo instalado; para probar notificaciones (F11) se evaluará una
  alternativa (p. ej. `maildev` vía npx, o mock del transporte SMTP en tests) documentada en su momento.

## ADR-003 — Catálogos de roles/permisos y geografía no incluidos en el DDL de referencia (F1)

- **Fecha:** 2026-07-22
- **Fase:** F1
- **Contexto:** `db/modelo_datos_psdte.sql` sección 16 ("datos semilla mínimos") no trae `INSERT` para
  `cat_rol`, `cat_permiso` ni `cat_rol_permiso` (solo los códigos de ejemplo en un comentario de la
  definición de tabla). Tampoco trae departamento/distrito/ciudad de Asunción — el catálogo geográfico
  oficial DGEEC no está disponible.
- **Decisión:** se sembraron roles y permisos propios (`db/seeds/data/03_roles_permisos.sql`) siguiendo los
  códigos de ejemplo del comentario (`ADMIN_PSDTE, OPERADOR_EMISION, TENEDOR, DEUDOR, AUTORIDAD, AUDITOR`)
  más `CONSULTA_PUBLICA` como rol lógico no asignable, con una matriz de permisos razonable acorde a la
  sección 5.2 del plan (contrato de API) y a la segregación ADMIN_PSDTE↔operación de DTE (sección 10). Para
  geografía se sembró únicamente Asunción/Capital con códigos provisionales (0/1/1) —
  `db/seeds/data/02_catalogos_geograficos.sql`.
- **Punto de reemplazo:** cuando se disponga del catálogo oficial de roles/permisos y del geográfico DGEEC,
  reemplazar estos seeds sin tocar el modelo (las tablas ya están listas para cualquier código).

## ADR-004 — Ambigüedad de `fn_aplicar_evento` para transiciones con múltiples filas de `condicion` (F1, relevante para F7)

- **Fecha:** 2026-07-22
- **Fase:** F1 (detectado en el test de camino feliz), aplica a F7 (Pagos)
- **Contexto:** `cat_transicion` seedea dos filas para `(estado_origen=1, tipo_evento=4/PAGO)`: una con
  `condicion='saldo > 0'` → destino PAGADO_PARCIAL, otra con `condicion='saldo = 0'` → destino
  PAGADO_TOTAL. La función `fn_aplicar_evento` (tal como está en el DDL de referencia, sección 15) NO
  evalúa el texto de `condicion` contra el saldo real: hace `SELECT estado_destino ... LIMIT 1` sin
  `ORDER BY`, por lo que el motor puede devolver cualquiera de las dos filas (en la práctica, Postgres usó
  el índice único `(estado_origen, tipo_evento, condicion)` y devolvió la fila que ordena primero
  alfabéticamente por `condicion`, es decir `'saldo = 0'`, no la de inserción).
- **Decisión (F1):** no se modifica `fn_aplicar_evento` (es el núcleo de control exclusivo dado por el DDL
  de referencia; la regla del plan sección 0.1.5 prohíbe degradar invariantes para pasar un test). El test
  de F1 (`fn_aplicar_evento: camino feliz`) usa ENDOSO en lugar de PAGO para el aserto determinístico,
  dejando esta nota para F7.
- **Acción requerida en F7:** `PagosModule`/`EventosService` deberá pasar el saldo resultante ya calculado
  y una forma de que la transición sea unívoca — opciones a evaluar en su momento: (a) que el `EventosService`
  calcule el saldo antes de llamar a `fn_aplicar_evento` y la función reciba el `estado_destino` ya resuelto
  en lugar de derivarlo él mismo, o (b) extender `fn_aplicar_evento` para evaluar `condicion` contra un
  parámetro `p_saldo_resultante` cuando `tipo_evento = PAGO`. Se decidirá y documentará aquí al llegar a F7.

## ADR-005 — Escenario demo completo (DTE emitido+endosado+pagado/cancelado) diferido a F7 (F1)

- **Fecha:** 2026-07-22
- **Fase:** F1
- **Contexto:** el plan sección 4.2 pide en los seeds de F1 un "escenario demo completo: 1 DTE emitido + 1
  endosado + 1 pagado/cancelado (replicando el XML de referencia)". Construir ese escenario correctamente
  requiere: (a) el XML de referencia firmado (aún no provisto, ver ADR-001), y (b) los servicios de
  aplicación de emisión/eventos/firma (F5-F7), ya que insertar manualmente filas de `firma`/`certificado`
  válidas en SQL puro sin el simulador de F5 produciría datos ficticios que no representan un DTE
  realmente firmado, contradiciendo el propósito del escenario ("para que la UI muestre datos reales").
- **Decisión:** F1 siembra catálogos, parámetros, integraciones y usuarios demo (sin el escenario de DTE).
  El escenario demo completo se añade como seed/bootstrap al cierre de F7, invocando los servicios reales
  (`EmisionService`/`EventosService` sobre el simulador de F5) en lugar de INSERTs directos, siempre detrás
  de `SEED_DEMO=true`.

## ADR-006 — Tests de integración de F1 contra Postgres nativo en lugar de Testcontainers (F1)

- **Fecha:** 2026-07-22
- **Fase:** F1
- **Contexto:** el plan sección 12 especifica Testcontainers (PG+Redis) para los tests de integración.
  Testcontainers necesita Docker, no disponible en este sandbox (ver ADR-002).
- **Decisión:** los tests de invariantes de F1 (`apps/api/test/db/invariantes-f1.e2e-spec.ts`) corren con
  `pg` directo contra una base `psdte_test` real (nativa en este sandbox), usando `.env.test` +
  `pnpm --filter @psdte/api db:reset:test` antes de `pnpm --filter @psdte/api test:e2e`. En CI (GitHub
  Actions, con Docker disponible) se agregó al workflow la creación de `psdte_test` sobre el mismo servicio
  `postgres` ya definido, sin necesitar Testcontainers tampoco — es un ajuste igualmente válido y más
  liviano que Testcontainers para este proyecto (no requiere levantar contenedores por test). Se mantiene
  como patrón para F7 (tests de concurrencia) y sucesivas fases de integración, salvo que una fase
  requiera específicamente el aislamiento por contenedor que ofrece Testcontainers.

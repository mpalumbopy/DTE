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

# RUNBOOK — Operación PSDTE

Operación del sistema en Kubernetes (`infra/k8s/`). Para el diseño de fases y decisiones de
arquitectura ver `docs/PLAN.md` y `docs/DECISIONES.md`; para el estado ejecutado de cada fase,
`docs/ESTADO.md`.

## 1. Arranque

Requiere: cluster K8s ≥1.28, `kubectl`, `kustomize` (o `kubectl apply -k`), un `IngressController`
nginx y `cert-manager` instalados, y (solo si se usa `overlays/dev`) `metrics-server` para que
`hpa-api.yaml` tenga datos reales que leer.

1. **Construir las 3 imágenes** (`infra/docker/Dockerfile.api`, `Dockerfile.api-worker`,
   `Dockerfile.web`) y subirlas al registry del entorno:
   ```bash
   docker build -f infra/docker/Dockerfile.api -t <registry>/psdte-api:<tag> .
   docker build -f infra/docker/Dockerfile.api-worker -t <registry>/psdte-api-worker:<tag> .
   docker build -f infra/docker/Dockerfile.web -t <registry>/psdte-web:<tag> .
   docker push <registry>/psdte-api:<tag>   # ídem worker y web
   ```
   Actualizar `images:` en `infra/k8s/overlays/<entorno>/kustomization.yaml` con `<registry>` y
   `<tag>` reales (por defecto apuntan a `psdte-api`/`psdte-api-worker`/`psdte-web` sin registry,
   pensado para un registry local de `kind`).
2. **Crear el namespace y los secretos reales** (ver sección 2) — el Secret NO viaja en git ni en
   el overlay; se crea aparte antes de aplicar el resto.
3. **Migrar la base de datos** (una sola vez, antes de exponer tráfico):
   ```bash
   kubectl apply -f infra/k8s/base/migrate-job.yaml   # o el equivalente ya kustomizado
   kubectl -n psdte wait --for=condition=complete job/psdte-migrate --timeout=300s
   ```
4. **Aplicar el overlay del entorno:**
   ```bash
   kubectl apply -k infra/k8s/overlays/dev     # o overlays/prod
   ```
5. **Verificar:**
   ```bash
   scripts/smoke-k8s.sh
   ```
   Confirma rollout completo de los 3 Deployments, `/api/readyz` en `ok:true` y que `/login` y
   `/verificar/<código>` del frontend responden 200.

`overlays/dev` además incluye `infra/k8s/postgres/statefulset.yaml` (Postgres propio, sin
PITR real — solo para dev/demo). `overlays/prod` asume Postgres gestionado por el proveedor
(RDS/Cloud SQL/similar): `DATABASE_URL` en el Secret real apunta directo a ese servicio, y
`overlays/prod/networkpolicy-db-egress.yaml` necesita el CIDR real de ese servicio antes de
aplicarse (viene con un placeholder `203.0.113.0/24` a propósito, para que falle de forma obvia si
se olvida completar).

## 2. Secretos

`infra/k8s/base/secrets.example.yaml` es una **plantilla**, no un recurso que se aplique — no está
en el `kustomization.yaml` de ningún overlay. Para crear el Secret real:

```bash
kubectl create secret generic psdte-secrets -n psdte \
  --from-literal=DATABASE_URL='postgres://...' \
  --from-literal=REDIS_URL='redis://...' \
  --from-literal=JWT_PRIVATE_KEY="$(openssl genrsa 4096 | base64 -w0)" \
  --from-literal=JWT_PUBLIC_KEY='<pública correspondiente, base64>' \
  --from-literal=APP_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --from-literal=HMAC_CALLBACK_SECRET="$(openssl rand -hex 32)" \
  --from-literal=SMTP_USER='...' --from-literal=SMTP_PASS='...' \
  --from-literal=POSTGRES_PASSWORD_DEV='...'   # solo si se usa infra/k8s/postgres/ (dev)
```

Rotación de `APP_ENCRYPTION_KEY`: cifra credenciales de integraciones (`integracion_ws`) y la clave
privada de la PKI simulada — rotarla invalida lo ya cifrado. Antes de rotar, descifrar y volver a
cifrar cada fila con la clave nueva (no hay un endpoint para esto todavía; ejecutar un script
puntual con `AesGcmService` contra la BD). Rotación de `JWT_PRIVATE_KEY/JWT_PUBLIC_KEY`: invalida
todos los access/refresh tokens vigentes (todo usuario re-loguea) — no requiere migración de datos.

## 3. Backup / restore (PITR) y preservación ≥ 10 años

`infra/k8s/base/cronjob-backup.yaml` corre `pg_dump` diario pero **deja el dump en un `emptyDir`
del pod** — el paso de subida a almacenamiento durable es un placeholder intencional (ver
comentario en el archivo). Antes de operar en serio, completar ese paso con el cliente del
proveedor real (`aws s3 cp`, `gsutil cp`, `mc cp`, ...) y sus credenciales (Secret aparte, no
incluido en este repo).

Esto **no reemplaza** la fuente de verdad legal del sistema: el XML firmado es el documento
jurídicamente válido (ver `CLAUDE.md`, invariante "El XML manda"); PostgreSQL es la proyección
operativa. La preservación ≥ 10 años de la Ley 6822/2021 se cumple en la práctica por dos vías
independientes:

1. **Resellado LTV** (`resellado-ltv.processor.ts`, cron diario 03:00): antes de que expire la
   validez del sello TSA de una versión de XML, obtiene un nuevo token TSA sobre el hash vigente y
   lo registra en `resellado_ltv` — esto es lo que de verdad sostiene la validez probatoria a largo
   plazo, no el backup de PostgreSQL.
2. **Backup de PostgreSQL** (esta sección): recuperación operativa (disaster recovery de la
   proyección BD), con retención igualmente ≥ 10 años en el bucket de destino (configurar
   lifecycle policy del bucket para NO expirar antes de ese plazo — point-and-time recovery real
   depende de que el proveedor gestionado lo soporte; un `pg_dump` diario por sí solo es solo
   backup lógico completo, no PITR continuo — si se requiere PITR real, usar WAL archiving del
   servicio gestionado, no este CronJob).

**Restore:** `gunzip < psdte-<timestamp>.sql.gz | psql "$DATABASE_URL"` contra una instancia nueva,
seguido de `pnpm db:migrate` para aplicar cualquier migración posterior al dump. El XML firmado de
cada `dte_xml_version` es reconstruible independientemente del dump vía el job de reconciliación
(`reconciliacion.processor.ts`) si hay divergencia BD↔XML tras un restore parcial.

## 4. Conmutación a web services reales (salir del SIMULADOR)

Ver `docs/DECISIONES.md` ADR-026 para el detalle de por qué el candado existe. Pasos, por cada
integración crítica (FIRMA, TSA, OCSP/CRL) desde `/admin/integraciones`:

1. Editar la integración (`PUT /admin/integraciones/:id`) con `modo: 'REAL'` **rechaza** — no se
   puede pasar a REAL por esta vía. Guardar primero con `baseUrl`, `endpoints`, `authTipo` +
   credenciales reales, dejando `modo` en `SIMULADOR` todavía.
2. **Probar conexión** (`POST /admin/integraciones/:id/test`) contra la config recién guardada —
   debe devolver éxito. Esto persiste `ultimo_test` con timestamp.
3. **Conmutar** (`POST /admin/integraciones/:id/conmutar`) dentro de los 15 minutos del test
   exitoso, con la contraseña del usuario admin + MFA vigente. Solo entonces `modo` pasa a `REAL`.
4. Repetir para cada tipo crítico. Cuando FIRMA/TSA/OCSP estén los 3 en REAL, `ALLOW_SIMULATOR`
   puede pasar a `false` en el ConfigMap del overlay de prod (ya es el default de
   `overlays/prod/configmap-patch.yaml`) — con `ALLOW_SIMULATOR=false` y alguna integración crítica
   todavía en SIMULADOR, el arranque de la api **falla** con un mensaje claro (candado de
   producción, `verificarCandadoSimulador` en `apps/api/src/main.ts`) en vez de servir tráfico
   degradado.

Volver a SIMULADOR (downgrade) no tiene candado — es libre vía `PUT` directo, sin passo 2/3.

## 5. Troubleshooting

| Síntoma | Causas probables | Diagnóstico |
|---|---|---|
| Pod `psdte-api` no pasa `readinessProbe` | BD/Redis inalcanzables, o ninguna integración activa de FIRMA/TSA/OCSP en `integracion_ws` | `kubectl -n psdte logs deploy/psdte-api` — el log de `readyz` indica cuál de los 3 chequeos falló (`baseDeDatos`/`redis`/`integraciones`, ver `salud.service.ts`) |
| Arranque de `psdte-api` falla inmediatamente en prod | `ALLOW_SIMULATOR=false` con alguna integración crítica todavía en modo SIMULADOR | mensaje de `verificarCandadoSimulador` en el log de arranque — completar la conmutación (sección 4) antes de reintentar |
| `psdte-worker` corre pero los jobs nunca se disparan | `PROCESS_ROLE` no llegó como `worker` al pod (typo en el overlay, o el Deployment usa la imagen de `psdte-api` en vez de `psdte-api-worker`) | log de arranque debe mostrar `"Jobs repetibles programados..."` (`JobsSchedulerService`) — si falta, `PROCESS_ROLE` no es `worker` en ese pod |
| Egreso a Postgres/Redis bloqueado en prod | `NetworkPolicy` con `podSelector` no matchea un servicio externo gestionado | ver `overlays/prod/networkpolicy-db-egress.yaml` — el CIDR placeholder no fue reemplazado por el real |
| `/verificar/<código>` en prod muestra la URL/API de `localhost` | Server Component leyendo `NEXT_PUBLIC_*` en vez de las variables de runtime | confirmar que `API_BASE_URL_INTERNO`/`PUBLIC_BASE_URL` (sin prefijo `NEXT_PUBLIC_`) estén en el ConfigMap del pod `psdte-web` — a diferencia de `NEXT_PUBLIC_API_BASE_URL` (usado por componentes cliente), estas se leen en runtime, no se hornean en el build (ver comentario en `apps/web/src/app/(publico)/verificar/[codigo]/page.tsx`) |
| Exportación de PDF/A falla con "chromium not found" o similar | Imagen sin `apk add chromium ghostscript`, o el binario tiene un nombre distinto al esperado por `CHROMIUM_PATH`/`GHOSTSCRIPT_PATH` | este sandbox no tiene Docker — la instalación de `chromium`/`ghostscript` vía `apk` en `Dockerfile.api`/`Dockerfile.api-worker` no se pudo verificar en un build real (ver docs/ESTADO.md F13); confirmar el nombre exacto del binario en la imagen construida (`docker run --rm <imagen> which chromium gs`) y fijar `CHROMIUM_PATH`/`GHOSTSCRIPT_PATH` en el ConfigMap si difiere |

## 6. Plan de cese / fin de operación

Si el servicio PSDTE cesa operaciones, la obligación de preservación ≥10 años (Ley 6822/2021)
sobrevive al cese de la infraestructura operativa:

1. **Exportar cada DTE vigente** vía el contenedor probatorio ya existente (`ExportacionService`,
   F9): XML firmado + representación PDF/A + evidencias (OCSP/CRL/TSL/TSR) + certificados +
   manifiesto sellado. El verificador offline (`packages/xml-engine/src/offline-verifier.ts`, CLI
   `pnpm verificar contenedor.zip`) permite validar cada contenedor sin depender de que el sistema
   siga en línea — es el artefacto que debe sobrevivir al cese, no la base de datos operativa.
2. **Backup final completo de PostgreSQL** (sección 3) con retención hasta cumplir los 10 años
   desde la última operación de cada pagaré (no desde la fecha de cese) — el bucket de destino debe
   tener lifecycle policy acorde, no un TTL fijo desde el cese.
3. **Continuar el resellado LTV** de los contenedores exportados hasta el vencimiento del plazo de
   preservación de cada uno, aun sin el sistema en línea: el resellado solo necesita el hash vigente
   y acceso a un proveedor TSA — puede operarse como un job standalone fuera del cluster completo
   (script CLI, no requiere `psdte-worker` corriendo) si el resto de la infraestructura ya se dio de
   baja.
4. **Notificar a la Autoridad de Aplicación** (según Ley 6822/2021 y Resolución 0391/2026) el cese y
   el destino/custodio de la preservación remanente — trámite regulatorio fuera del alcance de este
   repositorio.
5. Dar de baja el cluster (`kubectl delete -k infra/k8s/overlays/<entorno>`) solo después de
   confirmar que 1–2 completaron para el 100% de los DTE vigentes — no antes.

## 7. Limitaciones conocidas de esta entrega (honestidad de alcance)

- `docker build`, `kind create cluster`, `kubectl apply` y `scripts/smoke-k8s.sh` **no se pudieron
  ejecutar** en el sandbox de desarrollo (sin Docker daemon, ver docs/ESTADO.md F13) — todo el
  contenido de `infra/k8s/` y `infra/docker/` se validó por: (a) esquema K8s estricto vía
  `kubernetes-validate` (sustituto de `kubeconform`, que tampoco se pudo instalar — descarga de
  GitHub Releases bloqueada por el proxy del sandbox) para cada objeto individual, y (b) revisión
  manual de los patches de kustomize (no hay `kustomize build` disponible para renderizar los
  overlays completos). Antes de operar en un cluster real, correr `kustomize build
  infra/k8s/overlays/dev` (o `prod`) una vez y revisar la salida completa.
- El job "vencimientos" de la sección 9 del plan (auto-transición de un DTE a estado VENCIDO cuando
  vence el plazo con saldo pendiente, vía `fn_aplicar_evento`) sigue sin implementarse — requiere
  nuevas filas en `cat_tipo_evento`/`cat_transicion` y probablemente soporte en `xml-engine` para el
  nuevo tipo de evento (ver docs/DECISIONES.md ADR-030). La cola `vencimientos-proximos` que sí
  existe es el recordatorio por email de F11, no esta transición de estado.
- El job "firmas-pendientes" (poll de `consultarEstado` para proveedores de firma sin callback) no
  se implementó: en modo SIMULADOR `solicitarFirma` resuelve sincrónicamente (nunca deja una
  solicitud en `ENVIADA` esperando), así que no hay nada real contra qué probar un poller hasta que
  exista un proveedor REAL sin callback.
- El job "exportaciones" de la sección 9 (cola on-demand para PDF/A + contenedor) sigue síncrono
  dentro del proceso `api`, invocado directamente desde el endpoint HTTP — no se movió a una cola
  BullMQ. Es el diseño ya construido y probado en F9/F12 (descarga como blob autenticado desde el
  wizard de exportación); moverlo a asíncrono ahora exigiría rediseñar ese flujo (polling de estado
  desde el frontend) sin beneficio claro dado el tamaño típico de un contenedor de un pagaré.

## 8. Usuarios demo (`SEED_DEMO=true`)

Sembrados por `pnpm db:seed` / `pnpm db:reset` (paquete `@psdte/db-seeds`, ver
`db/seeds/run-seeds.ts`). Contraseña única para todos: **`Cambiar.123`** (cámbiela antes de
exponer el entorno). MFA habilitada en los roles críticos (ADMIN_PSDTE, OPERADOR_EMISION,
AUTORIDAD, AUDITOR) con un secreto TOTP fijo de demo, **no apto para producción**:

```
Secreto TOTP (base32): JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP
```

Para generar el código de 6 dígitos en cada login durante pruebas manuales o E2E:

```bash
# con oathtool (paquete oathtool / oath-toolkit)
oathtool --totp -b JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP

# o con Node, sin dependencias nuevas (una vez exista otplib en F2):
node -e "console.log(require('otplib').authenticator.generate('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'))"
```

| Usuario | Email | Rol | MFA |
|---|---|---|---|
| admin | admin@psdte.local | ADMIN_PSDTE | Sí |
| operador | operador@psdte.local | OPERADOR_EMISION | Sí |
| tenedor | tenedor@psdte.local | TENEDOR | No |
| deudor | deudor@psdte.local | DEUDOR | No |
| autoridad | autoridad@psdte.local | AUTORIDAD | Sí |
| auditor | auditor@psdte.local | AUDITOR | Sí |

`tenedor` y `deudor` tienen una `persona` asociada (documentos de prueba `1111111`/`2222222`,
país 600) pensada para el escenario demo de DTE que se siembra al cierre de F7 (ver
`docs/DECISIONES.md` ADR-005).

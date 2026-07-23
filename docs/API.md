# API — PSDTE (OpenAPI exportado)

Generado automáticamente por `apps/api/scripts/exportar-openapi.ts` (`pnpm --filter @psdte/api docs:openapi`) a partir de los decoradores de NestJS/Swagger — no editar a mano, se sobreescribe en cada corrida. El documento completo (JSON) queda en `docs/openapi.json`; la UI interactiva vive en `/api/docs` cuando `NODE_ENV !== 'production'`.

Nota: ningún controller usa todavía `@ApiOperation`/`@ApiResponse`/`@ApiTags` — las categorías de abajo se infieren del primer segmento de ruta, y las descripciones de respuesta quedan vacías más allá del código HTTP. Agregar esos decoradores es una mejora de documentación pendiente, no bloqueante de ningún DoD.

**Versión:** 1.0 · **Título:** PSDTE API

## admin

### `GET /api/v1/admin/auditoria/verificar-cadena`

**Respuestas:** `200` 

### `GET /api/v1/admin/auditoria`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `entidad` | query | sí |  |
| `entidadId` | query | sí |  |
| `desde` | query | sí |  |
| `hasta` | query | sí |  |
| `after` | query | sí |  |
| `limit` | query | sí |  |

**Respuestas:** `200` 

### `GET /api/v1/admin/integraciones`

**Respuestas:** `200` 

### `GET /api/v1/admin/integraciones/estado-global`

**Respuestas:** `200` 

### `GET /api/v1/admin/integraciones/{id}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

### `PUT /api/v1/admin/integraciones/{id}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

### `GET /api/v1/admin/integraciones/{id}/historial`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

### `POST /api/v1/admin/integraciones/{id}/test`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

### `POST /api/v1/admin/integraciones/{id}/conmutar`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

### `POST /api/v1/admin/jobs/notificaciones`

**Respuestas:** `201` 

### `POST /api/v1/admin/jobs/vencimientos-proximos`

**Respuestas:** `201` 

### `POST /api/v1/admin/jobs/resellado-ltv`

**Respuestas:** `201` 

### `GET /api/v1/admin/jobs/reconciliacion`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `dteId` | query | sí |  |

**Respuestas:** `200` 

### `GET /api/v1/admin/incidencias`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `estado` | query | sí |  |
| `severidad` | query | sí |  |
| `dteId` | query | sí |  |
| `limit` | query | sí |  |

**Respuestas:** `200` 

### `PUT /api/v1/admin/incidencias/{id}/estado`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

## auth

### `POST /api/v1/auth/login`

**Respuestas:** `200` 

### `POST /api/v1/auth/mfa/verify`

**Respuestas:** `200` 

### `POST /api/v1/auth/refresh`

**Respuestas:** `200` 

### `POST /api/v1/auth/logout`

**Respuestas:** `204` 

### `POST /api/v1/auth/mfa/enrol`

**Respuestas:** `200` 

## catalogos

### `GET /api/v1/catalogos/{codigo}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `codigo` | path | sí |  |

**Respuestas:** `200` 

## dev

### `POST /api/v1/dev/firmador`

**Respuestas:** `201` 

## dte

### `POST /api/v1/dte/emisiones`

**Respuestas:** `201` 

### `GET /api/v1/dte/emisiones/{id}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

### `POST /api/v1/dte/emisiones/{id}/firmas/solicitar`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

### `POST /api/v1/dte/emisiones/{id}/confirmar`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

### `POST /api/v1/dte/{id}/endosos`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

### `POST /api/v1/dte/{id}/pagos`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

### `POST /api/v1/dte/{id}/bloqueos`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

### `DELETE /api/v1/dte/{id}/bloqueos/{bid}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |
| `bid` | path | sí |  |

**Respuestas:** `200` 

### `POST /api/v1/dte/{id}/cancelacion`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

### `GET /api/v1/dte`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `estado` | query | sí |  |
| `desde` | query | sí |  |
| `hasta` | query | sí |  |
| `q` | query | sí |  |
| `page` | query | sí |  |
| `pageSize` | query | sí |  |

**Respuestas:** `200` 

### `GET /api/v1/dte/kpis`

**Respuestas:** `200` 

### `GET /api/v1/dte/{id}/xml`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

### `GET /api/v1/dte/{id}/verificacion`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

### `POST /api/v1/dte/{id}/exportacion`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `201` 

## exportaciones

### `GET /api/v1/exportaciones/{id}/descargar`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

## healthz

### `GET /api/healthz`

**Respuestas:** `200` 

## metrics

### `GET /api/metrics`

**Respuestas:** `200` 

## parametros

### `GET /api/v1/parametros`

**Respuestas:** `200` 

### `PUT /api/v1/parametros/{clave}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `clave` | path | sí |  |

**Respuestas:** `200` 

## personas

### `GET /api/v1/personas`

**Respuestas:** `200` 

### `POST /api/v1/personas`

**Respuestas:** `201` 

### `GET /api/v1/personas/{id}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

### `PUT /api/v1/personas/{id}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

## raiz

### `GET /api`

**Respuestas:** `200` 

## readyz

### `GET /api/readyz`

**Respuestas:** `200` 

## usuarios

### `GET /api/v1/usuarios`

**Respuestas:** `200` 

### `POST /api/v1/usuarios`

**Respuestas:** `201` 

### `GET /api/v1/usuarios/{id}`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

### `PUT /api/v1/usuarios/{id}/roles`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `id` | path | sí |  |

**Respuestas:** `200` 

## verificacion

### `GET /api/v1/verificacion`

**Parámetros:**

| Nombre | En | Requerido | Descripción |
|---|---|---|---|
| `codigo` | query | sí |  |

**Respuestas:** `200` 

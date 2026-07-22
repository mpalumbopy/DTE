# RUNBOOK — Operación PSDTE

El contenido completo (arranque, gestión de secretos, backup/restore PITR, conmutación a WS
reales paso a paso, troubleshooting y plan de cese/retención de 10 años) se agrega en F13. Esta
sección de datos demo se completa desde F1 porque los seeds ya la generan.

## Usuarios demo (`SEED_DEMO=true`)

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

Pendiente: el resto del runbook (arranque productivo, secretos, backups, conmutación de
integraciones, troubleshooting, cese/retención) se completa al cierre de F13.

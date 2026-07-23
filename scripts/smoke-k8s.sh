#!/usr/bin/env bash
# Smoke test post-deploy: verifica que el overlay recién aplicado está sano (rollout completo,
# readyz OK, healthz de web OK, path público de verificación responde). Pensado para correr desde
# CI o manualmente después de `kubectl apply -k infra/k8s/overlays/<entorno>`.
#
# NO se pudo ejecutar en este sandbox (sin Docker/kind/kubectl, ver docs/ESTADO.md F13) — el
# código quedó listo para correr contra un cluster real, pero sin verificación en vivo.
set -euo pipefail

NAMESPACE="${NAMESPACE:-psdte}"
TIMEOUT="${TIMEOUT:-180s}"

echo "==> Esperando rollout de psdte-api"
kubectl -n "$NAMESPACE" rollout status deployment/psdte-api --timeout="$TIMEOUT"

echo "==> Esperando rollout de psdte-worker"
kubectl -n "$NAMESPACE" rollout status deployment/psdte-worker --timeout="$TIMEOUT"

echo "==> Esperando rollout de psdte-web"
kubectl -n "$NAMESPACE" rollout status deployment/psdte-web --timeout="$TIMEOUT"

echo "==> Verificando /api/readyz (port-forward temporal)"
kubectl -n "$NAMESPACE" port-forward svc/psdte-api 18081:3001 >/tmp/psdte-smoke-api.log 2>&1 &
PF_API_PID=$!
trap 'kill "$PF_API_PID" "$PF_WEB_PID" 2>/dev/null || true' EXIT
sleep 2

RESPUESTA_READYZ="$(curl -sf http://127.0.0.1:18081/api/readyz)"
echo "readyz: $RESPUESTA_READYZ"
echo "$RESPUESTA_READYZ" | grep -q '"ok":true' || {
  echo "FALLA: /api/readyz no reporta ok:true"
  exit 1
}

echo "==> Verificando /login del frontend (port-forward temporal)"
kubectl -n "$NAMESPACE" port-forward svc/psdte-web 18080:3000 >/tmp/psdte-smoke-web.log 2>&1 &
PF_WEB_PID=$!
sleep 2

curl -sf -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/login | grep -q '^200$' || {
  echo "FALLA: /login no respondió 200"
  exit 1
}

echo "==> Verificando /verificar/<codigo inexistente> (ruta pública, sin autenticación)"
curl -sf -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/verificar/no-existe-smoke-test | grep -q '^200$' || {
  echo "FALLA: /verificar/<codigo> no respondió 200 (debe responder 200 con 'no existe', no un error HTTP)"
  exit 1
}

echo "==> Smoke test OK: rollouts completos, readyz sano, web responde"

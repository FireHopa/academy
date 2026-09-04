#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/container-runtime.sh"
detect_container_runtime || { echo "Docker Compose ou Podman Compose não encontrado." >&2; exit 1; }

# Idempotente: garante infra sem amarrar o projeto ao runtime de desenvolvimento.
"${COMPOSE_CMD[@]}" up -d postgres redis >/dev/null

cleanup(){
  trap - INT TERM EXIT
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "${WORKER_PID:-}" ] && kill "$WORKER_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "Iniciando API em http://localhost:4000/api"
npm run dev:api & API_PID=$!
echo "Iniciando frontend em http://localhost:3000"
npm run dev:web & WEB_PID=$!
echo "Iniciando worker de jobs"
npm run dev:worker & WORKER_PID=$!
wait -n "$API_PID" "$WEB_PID" "$WORKER_PID"

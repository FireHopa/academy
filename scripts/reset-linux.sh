#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/container-runtime.sh"
detect_container_runtime || { echo "Docker Compose ou Podman Compose não encontrado." >&2; exit 1; }

echo "ATENÇÃO: isto apaga o banco local, Redis, node_modules e builds locais."
echo "O package-lock.json será preservado para manter as versões reproduzíveis."
read -r -p "Digite RESET para continuar: " answer
[ "$answer" = "RESET" ] || { echo "Cancelado."; exit 0; }
"${COMPOSE_CMD[@]}" down -v --remove-orphans || true
rm -rf node_modules apps/*/node_modules apps/api/dist apps/web/.next apps/api/src/generated/prisma
echo "Ambiente local limpo. Rode: npm run linux:setup"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: .env não encontrado em $ROOT_DIR"
  exit 1
fi

read_env() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  value="${value%\"}"; value="${value#\"}"
  printf '%s' "$value"
}

TOKEN="$(read_env THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN)"
if [[ -z "$TOKEN" ]]; then
  echo "ERRO: preencha THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN no .env antes do teste."
  exit 1
fi

EMAIL="${1:-aluno@academy.local}"
PRODUCT_REF="${2:-PRODUTO_TESTE}"
EVENT="${3:-release.access}"
API_URL="${API_URL:-http://localhost:4000/api}"
ORDER_ID="local-$(date +%s)-$RANDOM"

if [[ "$EVENT" != "release.access" && "$EVENT" != "revoke.access" ]]; then
  echo "ERRO: evento deve ser release.access ou revoke.access"
  exit 1
fi

if [[ "$EVENT" == "release.access" ]]; then
  ACCESS_STATUS="paid"
  TRANSACTION_STATUS="approved"
else
  ACCESS_STATUS="cancelled"
  TRANSACTION_STATUS="refunded"
fi

cat <<EOF
Enviando webhook local TheMembers
  evento:  $EVENT
  e-mail:  $EMAIL
  produto: $PRODUCT_REF
  API:     $API_URL

ATENÇÃO: o produto precisa estar sincronizado/mapeado na Academy para virar acesso.
EOF

curl --fail-with-body -sS -X POST "$API_URL/webhooks/themembers/checkout" \
  -H 'Content-Type: application/json' \
  -H "x-signature: $TOKEN" \
  --data-binary @- <<JSON
{
  "payload": {
    "id": "$ORDER_ID",
    "object": "order",
    "event": "$EVENT",
    "created_at": "$(date -u '+%Y-%m-%d %H:%M:%S')",
    "data": {
      "status": "$ACCESS_STATUS",
      "customer": {
        "id": "local-customer",
        "name": "Aluno Teste",
        "email": "$EMAIL"
      },
      "product": {
        "id": "$PRODUCT_REF",
        "name": "Produto Teste Academy",
        "quantity": 1,
        "reference_id": "$PRODUCT_REF",
        "expires_in": null
      },
      "order": {
        "id": "$ORDER_ID",
        "transaction": {
          "paid_at": "$(date -u '+%Y-%m-%d %H:%M:%S')",
          "status": "$TRANSACTION_STATUS"
        }
      }
    }
  }
}
JSON

echo
echo

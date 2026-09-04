#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASELINE_MIGRATION="20260818143115_baseline_v9"
PRISMA_BIN="$ROOT_DIR/node_modules/.bin/prisma"

say() { printf '\n%s\n' "$*"; }
fail() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

[ -x "$PRISMA_BIN" ] || fail "Prisma CLI não encontrado. Execute npm install antes deste script."
[ -f "prisma/migrations/$BASELINE_MIGRATION/migration.sql" ] || fail "Migration de baseline não encontrada: $BASELINE_MIGRATION."

if [ "${CONFIRM_BASELINE_EXISTING_DATABASE:-}" != "$BASELINE_MIGRATION" ]; then
  fail "Confirmação ausente. Leia MIGRATIONS-V10.md, faça backup e execute novamente com CONFIRM_BASELINE_EXISTING_DATABASE=$BASELINE_MIGRATION."
fi

export PRISMA_HIDE_UPDATE_MESSAGE=1
export CHECKPOINT_DISABLE=1

say "1/4 Validando a configuração e o schema Prisma"
"$PRISMA_BIN" validate

say "2/4 Comparando o banco existente com o schema esperado"
DIFF_FILE="$(mktemp)"
trap 'rm -f "$DIFF_FILE"' EXIT

set +e
"$PRISMA_BIN" migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code \
  --output "$DIFF_FILE"
DIFF_EXIT=$?
set -e

case "$DIFF_EXIT" in
  0)
    ;;
  2)
    fail "O banco possui divergências em relação ao schema V9. O baseline NÃO foi registrado. Revise o diff de forma controlada antes de continuar."
    ;;
  *)
    fail "Não foi possível comparar o banco com o schema. O baseline NÃO foi registrado. Verifique DATABASE_URL, conectividade e permissões."
    ;;
esac

say "3/4 Registrando o baseline sem recriar tabelas nem alterar dados"
"$PRISMA_BIN" migrate resolve --applied "$BASELINE_MIGRATION"

say "4/4 Aplicando migrations pendentes e conferindo o estado"
"$PRISMA_BIN" migrate deploy
"$PRISMA_BIN" migrate status

say "Baseline concluído. Nenhuma tabela do schema existente foi recriada por este procedimento."

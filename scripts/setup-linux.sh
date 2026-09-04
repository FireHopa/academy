#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/container-runtime.sh"

say(){ printf '\n\033[1;36m%s\033[0m\n' "$*"; }
fail(){ printf '\n\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

say "Academy Play V10 - setup Linux"
command -v node >/dev/null 2>&1 || fail "Node.js não encontrado. Instale Node 22 LTS (recomendado via nvm)."
command -v npm >/dev/null 2>&1 || fail "npm não encontrado."
detect_container_runtime || fail "Nenhum Compose compatível encontrado. Ubuntu/VPS: Docker Engine + Docker Compose. Bazzite local: Podman + podman-compose."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ] || [ "$NODE_MAJOR" -ge 25 ]; then
  fail "Versão Node detectada: $(node -v). Use Node 22 LTS ou 24. O projeto recomenda Node 22."
fi

if [ "$CONTAINER_ENGINE" = "docker" ] && ! docker info >/dev/null 2>&1; then
  fail "Docker instalado, mas o daemon não está acessível. Inicie o serviço: sudo systemctl enable --now docker."
fi
if [ "$CONTAINER_ENGINE" = "podman" ] && ! podman info >/dev/null 2>&1; then
  fail "Podman instalado, mas não está acessível para o usuário atual."
fi

[ -f .env.example ] || fail ".env.example não encontrado na raiz do projeto."
[ -f package-lock.json ] || fail "package-lock.json não encontrado. O setup usa npm ci para uma instalação reproduzível."
[ -f .env ] || { cp .env.example .env; say "Criado .env a partir de .env.example. Revise antes de produção."; }

say "Runtime local: $CONTAINER_ENGINE (${COMPOSE_CMD[*]})"
say "1/5 Subindo PostgreSQL e Redis"
"${COMPOSE_CMD[@]}" up -d postgres redis

say "2/5 Aguardando PostgreSQL ficar saudável"
for i in $(seq 1 60); do
  cid="$("${COMPOSE_CMD[@]}" ps -q postgres 2>/dev/null | head -n1 || true)"
  status=""
  if [ -n "$cid" ]; then
    status="$($CONTAINER_ENGINE inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
  fi
  if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then break; fi
  if [ "$i" -eq 60 ]; then
    "${COMPOSE_CMD[@]}" logs --tail=80 postgres || true
    fail "PostgreSQL não ficou disponível no tempo esperado."
  fi
  sleep 2
done

say "3/5 Instalando dependências a partir do lockfile"
npm ci --no-audit --no-fund
say "4/5 Gerando Prisma e aplicando migrations versionadas"
npm run db:generate
npm run db:migrate:deploy || fail "Não foi possível aplicar as migrations. Se este banco já existia e foi criado com db push, não force a execução: siga MIGRATIONS-V10.md para validar e registrar o baseline com segurança."
npm run db:seed
say "5/5 Verificação final"
"${COMPOSE_CMD[@]}" ps

cat <<'TXT'

Setup concluído.

Para iniciar API + frontend + worker:
  npm run linux:dev

Frontend: http://localhost:3000
API:      http://localhost:4000/api

Acesso:
  Use ADMIN_EMAIL e ADMIN_PASSWORD definidos no seu .env.
  O aluno demo só existe quando SEED_DEMO_CONTENT=true; nesse caso use
  STUDENT_EMAIL e STUDENT_PASSWORD definidos no .env.

Por segurança, o setup não imprime senhas no terminal.

Integrações:
  Admin -> Integrações
  Leia INTEGRATIONS-V9.md antes de ativar webhooks comerciais.
TXT

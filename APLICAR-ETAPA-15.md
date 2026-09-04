# Aplicar a Etapa 15 na VPS

## 1. Backup

Na raiz `/home/deploy/academy`, crie uma cópia dos arquivos que serão substituídos:

```bash
cd /home/deploy/academy
backup_dir="$HOME/academy-backups/etapa15-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir/apps/web/app/login" "$backup_dir/apps/web/app/onboarding" "$backup_dir/apps/web/app"
cp apps/web/app/login/page.tsx "$backup_dir/apps/web/app/login/page.tsx"
cp apps/web/app/onboarding/page.tsx "$backup_dir/apps/web/app/onboarding/page.tsx"
cp apps/web/app/globals.css "$backup_dir/apps/web/app/globals.css"
cp .env.example "$backup_dir/.env.example"
echo "Backup criado em: $backup_dir"
```

## 2. Extração

```bash
cd /home/deploy/academy
unzip -o /home/deploy/academy-etapa15-paginas-legais.zip
```

O ZIP não contém `.env` e não altera credenciais da VPS.

## 3. Ambiente de produção

Configure no `.env` real:

```env
TERMS_VERSION=2026-09-03
NEXT_PUBLIC_TERMS_URL=https://matheusbottaro.com.br/termos
NEXT_PUBLIC_PRIVACY_URL=https://matheusbottaro.com.br/privacidade
```

## 4. Validação do código

```bash
cd /home/deploy/academy
source "$HOME/.profile"
npm run test:typecheck
npm run test:api
```

## 5. Build

Não execute o build final antes de configurar todo o ambiente de produção, especialmente `NODE_ENV`, `WEB_URL`, `NEXT_PUBLIC_API_URL`, portas, JWT e URLs legais. O Next.js incorpora as variáveis `NEXT_PUBLIC_*` durante a compilação.

Depois do `.env` de produção ser validado, o build deverá listar `/termos` e `/privacidade` como rotas estáticas.

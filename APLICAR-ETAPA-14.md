# Aplicar a Etapa 14 na VPS

Este pacote deve ser extraído na raiz do projeto, atualmente `/home/deploy/academy`.

## 1. Criar backup dos arquivos afetados

```bash
cd /home/deploy/academy
backup_dir="$HOME/academy-backups/etapa14-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir/apps/api/src/common" "$backup_dir/apps/api/src/health" "$backup_dir/apps/api/test"
cp apps/api/src/main.ts "$backup_dir/apps/api/src/main.ts"
cp apps/api/src/health/health.service.ts "$backup_dir/apps/api/src/health/health.service.ts"
cp apps/api/test/health.test.ts "$backup_dir/apps/api/test/health.test.ts"
cp .env.example START-HERE.md "$backup_dir/"
echo "Backup criado em: $backup_dir"
```

O arquivo `apps/api/src/common/mail-config.ts` e o teste `apps/api/test/mail-config.test.ts` são novos.

## 2. Extrair o ZIP

Substitua o caminho abaixo pelo local onde o arquivo foi enviado:

```bash
cd /home/deploy/academy
unzip -o /CAMINHO/academy-etapa14-sem-resend.zip
```

## 3. Ajustar somente o `.env` real

Mantenha as credenciais atuais e garanta estas linhas:

```env
MAIL_PROVIDER=disabled
ALLOW_DISABLED_MAIL_IN_PRODUCTION=true
RESEND_API_KEY=
```

Não copie `.env.example` por cima do `.env` real.

## 4. Validar

```bash
cd /home/deploy/academy
source "$HOME/.profile"
npm run test:typecheck
npm run test:api
npm run build
```

## Limitações do modo sem Resend

- Convites não serão entregues por e-mail.
- Recuperações de senha não serão entregues por e-mail.
- O administrador deverá criar acessos com senha conhecida ou administrar as contas manualmente.

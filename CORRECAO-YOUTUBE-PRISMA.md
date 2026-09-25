# Correção YouTube / Prisma

Este pacote corrige o erro `Invalid value for argument provider. Expected VideoProvider` ao vincular vídeos do YouTube.

## Causa corrigida

O `prisma/schema.prisma` e a migration já continham `YOUTUBE`, mas o Prisma Client versionado em `apps/api/src/generated/prisma` havia sido gerado antes dessa alteração e aceitava apenas `PANDA` e `MUX`.

A correção faz duas coisas:

1. atualiza o snapshot do Prisma Client incluído no projeto para reconhecer `YOUTUBE`;
2. adiciona `prebuild` à API, fazendo `prisma generate --schema ../../prisma/schema.prisma` automaticamente antes de todo `npm run build -w @academy/api`.

## Aplicação no servidor

Depois de extrair este pacote sobre `/home/deploy/academy`, rode na raiz do projeto:

```bash
cd /home/deploy/academy
npm run db:migrate:status
npm run deploy:safe
```

O `deploy:safe` executa primeiro as migrations pendentes e depois o build. Durante o build da API, o Prisma Client é regenerado automaticamente.

Depois reinicie os processos PM2 da API e do web usando os nomes existentes no seu `pm2 list`.

## Verificação rápida

```bash
grep -A5 "export const VideoProvider" apps/api/src/generated/prisma/enums.ts
npm run db:migrate:status
```

O enum precisa mostrar `PANDA`, `MUX` e `YOUTUBE`, e o status das migrations deve indicar que o banco está atualizado.

## Sobre os logs `Server Reference ID ... Received "x"`

Eles são independentes do cadastro de vídeo do YouTube. O frontend deste projeto não usa Server Actions (`use server`/`formAction`). Por isso esta correção não altera o roteamento do Next.js nem bloqueia headers globalmente, evitando introduzir uma regra arriscada no tráfego legítimo. Se o flood continuar, trate-o no reverse proxy/WAF após confirmar IP, User-Agent e rota nos access logs.

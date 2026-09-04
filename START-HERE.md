# Academy Play V10 — Comece por aqui

> **Linux:** use primeiro `LINUX-START.md`. Nesta versão você pode executar `npm run linux:setup` e depois `npm run linux:dev`.

Crie o `.env` local a partir de `.env.example`. O arquivo contém apenas valores de desenvolvimento e campos vazios para integrações; nenhum secret de produção é distribuído.

## 1. Requisitos

- Node.js 22 LTS recomendado; versões aceitas pelo projeto: 22 a 24
- npm
- Docker + Docker Compose

## 2. Subir banco e Redis

```bash
docker compose up -d
```

## 3. Instalar dependências

```bash
npm ci
```

## 4. Preparar banco

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

## 5. Rodar API e frontend

Abra dois terminais.

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:web
```

Acesse:

- Frontend: http://localhost:3000
- API: http://localhost:4000/api

## 6. Logins de teste

### Administrador

Com o `.env.example` copiado sem alterações:

- E-mail: `admin@academy.local`
- Senha: `TroqueEstaSenha123!`

### Aluno demo

Com `SEED_DEMO_CONTENT=true`:

- E-mail: `aluno@academy.local`
- Senha: `Aluno123!`

Se esses campos forem alterados no `.env`, use os novos valores. O script de setup não imprime senhas.

O aluno demo recebe cursos, favoritos, progresso, trilhas, materiais, transcrição e notificação de demonstração pelo seed.

## 7. Mux DRM

A plataforma sobe sem Mux em desenvolvimento, mas upload e playback protegido só funcionarão após preencher no `.env`:

- `MUX_TOKEN_ID`
- `MUX_TOKEN_SECRET`
- `MUX_DRM_CONFIGURATION_ID`
- `MUX_SIGNING_KEY_ID`
- `MUX_PRIVATE_KEY`
- `MUX_WEBHOOK_SECRET`

Configure o webhook do Mux para:

```text
https://SEU-ENDERECO-PUBLICO/api/webhooks/mux
```

Para testar webhook em localhost, use um túnel HTTPS (por exemplo Cloudflare Tunnel ou equivalente) e atualize o endpoint no Mux.

## 8. E-mail

Por padrão:

```env
MAIL_PROVIDER="disabled"
ALLOW_DISABLED_MAIL_IN_PRODUCTION="false"
```

Isso é intencional para desenvolvimento. O fluxo de convite e recuperação pode ser testado sem enviar e-mail real.

Para iniciar temporariamente em produção sem envio de e-mail, confirme a limitação de forma explícita:

```env
MAIL_PROVIDER="disabled"
ALLOW_DISABLED_MAIL_IN_PRODUCTION="true"
RESEND_API_KEY=""
```

Nesse modo, convites e recuperação de senha não são entregues. O acesso precisa ser criado com uma senha conhecida ou administrado manualmente.

Para envio real via Resend, configure:

```env
MAIL_PROVIDER="resend"
ALLOW_DISABLED_MAIL_IN_PRODUCTION="false"
RESEND_API_KEY="..."
MAIL_FROM="Academy Play <no-reply@seudominio.com>"
```

## 9. Documentos de controle do projeto

Leia antes de continuar desenvolvimento:

- `PROJECT_MAP.md` — mapa completo do que já existe
- `AUDIT_V8.md` — auditoria, correções e riscos pendentes

## 10. Importante

Este pacote está configurado para `NODE_ENV=development`. Não publique esse `.env` em produção. A aplicação possui validações fail-fast para produção e exigirá HTTPS, vídeo com DRM, uma decisão explícita sobre e-mail e URLs de termos/privacidade válidas.


## Correção Prisma 7

Este pacote inclui `@prisma/client` como dependência de runtime da API e fixa `prisma`, `@prisma/client` e `@prisma/adapter-pg` na mesma versão (7.7.0).

Se você testou uma versão anterior, apague instalações/artefatos antigos antes de reinstalar:

```bash
rm -rf node_modules apps/api/dist apps/web/.next apps/api/src/generated/prisma
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

O `npm ci` também executa `prisma generate` via `postinstall`, mas o comando explícito `npm run db:generate` pode ser mantido como verificação. Não apague o `package-lock.json` durante o reset.

Se o banco já foi criado por uma versão anterior com `prisma db push`, não execute a migration inicial diretamente. Faça backup e siga `MIGRATIONS-V10.md` para validar e registrar o baseline.

## V9: Panda + TheMembers

Depois que a aplicação base estiver rodando, leia `INTEGRATIONS-V9.md`.

Resumo seguro:

1. configure `PANDA_API_KEY` e teste em **Admin -> Integrações**;
2. vincule um vídeo Panda existente a uma aula;
3. só depois configure DRM Watermark;
4. configure a API TheMembers e sincronize os produtos;
5. mapeie cada produto para os cursos corretos;
6. mantenha `THEMEMBERS_ACCESS_AUTOMATION=false` no primeiro webhook real;
7. valide `release.access` e `revoke.access` no painel;
8. somente depois ative `THEMEMBERS_ACCESS_AUTOMATION=true`.

Para simular um webhook local, depois de preencher `THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN`:

```bash
npm run test:themembers-webhook -- aluno@academy.local CODIGO_DO_PRODUTO release.access
```

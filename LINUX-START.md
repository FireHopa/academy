# Academy Play V10 — Linux

Esta é a versão completa da plataforma, não a Demo Local.

## O que está incluído

- Next.js frontend
- NestJS API
- PostgreSQL
- Redis preparado na infraestrutura
- Prisma 7
- autenticação e onboarding
- painel administrativo
- cursos, módulos e aulas
- biblioteca, catálogo, busca, favoritos e trilhas
- progresso, histórico, materiais, transcrição e certificados
- alunos, matrículas, bloqueios e notificações
- controle de dispositivos, sessões simultâneas e heartbeat
- Mux upload/DRM já integrado no código (credenciais externas não inclusas)
- documentos PROJECT_MAP.md e AUDIT_V8.md

## Caminho recomendado no Linux

### 1. Node 22 LTS

Se usa nvm:

```bash
nvm install 22
nvm use 22
```

O projeto inclui `.nvmrc`, então depois basta `nvm use`.

### 2. Docker

Confirme:

```bash
docker --version
docker compose version
docker info
```

Em distribuições com systemd, se o daemon estiver parado:

```bash
sudo systemctl enable --now docker
```

Se `docker info` só funcionar com sudo, configure seu usuário no grupo docker conforme a documentação da sua distribuição e faça login novamente.

### 3. Setup automático

Na raiz do projeto:

```bash
chmod +x scripts/*.sh
./scripts/setup-linux.sh
```

ou:

```bash
npm run linux:setup
```

O script:

1. valida Node/npm/Docker;
2. sobe PostgreSQL e Redis;
3. espera o Postgres ficar saudável;
4. executa `npm ci` usando o `package-lock.json`;
5. gera Prisma;
6. aplica as migrations Prisma versionadas;
7. roda o seed demo.

Em um banco já criado por uma versão anterior com `prisma db push`, faça backup e siga `MIGRATIONS-V10.md` antes do setup. O script não registra baseline automaticamente.

### 4. Iniciar o sistema

```bash
npm run linux:dev
```

Ou separadamente:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Acesse:

- Frontend: http://localhost:3000
- API: http://localhost:4000/api

## Logins locais

Ao copiar `.env.example` sem alterações, os valores locais padrão são:

### Admin

- e-mail: `admin@academy.local`
- senha: `TroqueEstaSenha123!`

### Aluno demo

- e-mail: `aluno@academy.local`
- senha: `Aluno123!`

O setup não imprime senhas no terminal. Se você alterar `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `STUDENT_EMAIL` ou `STUDENT_PASSWORD` no `.env`, use os valores do seu próprio arquivo. Em produção, não reutilize as credenciais locais.

## Mux

O sistema funciona para testar as demais áreas sem preencher Mux. Upload e playback DRM real exigem no `.env`:

```env
MUX_TOKEN_ID=""
MUX_TOKEN_SECRET=""
MUX_DRM_CONFIGURATION_ID=""
MUX_SIGNING_KEY_ID=""
MUX_PRIVATE_KEY=""
MUX_WEBHOOK_SECRET=""
MUX_PLAYBACK_RESTRICTION_ID=""
```

## Panda Video

Panda Video é o provedor principal da V9/V10. O suporte ao Mux permanece no backend como fallback técnico. Leia `INTEGRATIONS-V9.md` antes de configurar credenciais, DRM ou webhooks.

## Reset completo do ambiente local

```bash
npm run linux:reset
```

O comando pede confirmação e apaga volumes locais, `node_modules` e builds. O `package-lock.json` é preservado para manter a instalação reproduzível. Não use em produção.

## Teste de build

Depois do setup:

```bash
npm run build
```

Se qualquer erro aparecer, salve a saída completa e use-a para a próxima rodada de QA.

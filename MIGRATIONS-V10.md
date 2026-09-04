# Academy Play V10 — Migrations Prisma

Este documento é o procedimento oficial da `TASK V10-001`.

## Resultado desta etapa

- migration inicial versionada em `prisma/migrations/20260818143115_baseline_v9/migration.sql`;
- provider travado como PostgreSQL em `prisma/migrations/migration_lock.toml`;
- novos bancos criados com `prisma migrate deploy`;
- bancos existentes criados por `prisma db push` protegidos por validação de drift antes do baseline;
- `prisma db push` removido do fluxo e dos comandos oficiais;
- nenhuma tabela, coluna ou dado existente alterado pelo código desta tarefa.

## Regra principal

Existem dois caminhos diferentes. Não misture os procedimentos.

### Banco novo e vazio

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:migrate:status
```

Em desenvolvimento local, depois da migration:

```bash
npm run db:seed
```

Não execute o seed demo em produção.

### Banco existente criado com `prisma db push`

O banco já possui as tabelas, mas ainda não possui o histórico do Prisma Migrate. Se `migrate deploy` for executado diretamente, a migration inicial tentará criar objetos que já existem.

#### 1. Coloque a aplicação em manutenção

Interrompa temporariamente gravações na API e webhooks. O objetivo é manter o backup e a validação consistentes.

#### 2. Confirme o banco correto

Revise a variável `DATABASE_URL` no ambiente do servidor sem imprimir ou compartilhar o valor.

#### 3. Faça backup completo

Exemplo com PostgreSQL:

```bash
mkdir -p backups
pg_dump --format=custom --file="backups/academy-before-v10-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"
```

Valide se o arquivo foi criado e se o processo terminou com código zero. Guarde uma cópia fora da VPS.

#### 4. Instale a versão e gere o Prisma Client

```bash
npm install
npm run db:generate
```

#### 5. Valide e registre o baseline

```bash
CONFIRM_BASELINE_EXISTING_DATABASE=20260818143115_baseline_v9 npm run db:baseline:existing
```

O script executa quatro proteções:

1. valida o schema Prisma;
2. compara o banco real com o schema esperado;
3. interrompe o processo se detectar qualquer drift;
4. somente com igualdade registra a migration como já aplicada e executa `migrate deploy`.

O comando `migrate resolve --applied` não executa o SQL da migration inicial. Ele apenas registra que o banco existente já corresponde àquele estado.

#### 6. Confirme o estado final

```bash
npm run db:migrate:status
```

Somente depois reative a API e os webhooks.

## Se o script detectar divergência

Não use `migrate resolve`, não edite a tabela `_prisma_migrations` manualmente e não volte ao `db push`.

Faça uma cópia restaurável do banco e gere um diagnóstico somente leitura:

```bash
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma
```

Revise cada diferença antes de criar uma migration de reconciliação. Uma coluna ou tabela adicional pode conter dados válidos que ainda não chegaram ao schema do projeto.

## Próximas mudanças de banco

Em desenvolvimento:

```bash
npm run db:migrate -- --name nome_descritivo
npm run db:generate
npm run build
```

Antes de publicar:

1. revise o SQL criado em `prisma/migrations`;
2. confirme que não existe remoção destrutiva inesperada;
3. versiona a migration junto com o código;
4. faça backup do banco de produção;
5. execute `npm run db:migrate:deploy` no servidor;
6. execute `npm run db:migrate:status`.

Nunca edite uma migration que já tenha sido aplicada em outro ambiente.

## Recuperação

Prisma Migrate não cria automaticamente uma migration de rollback. Em falha crítica:

1. mantenha a aplicação sem gravações;
2. preserve os logs da execução;
3. restaure o backup testado em um banco separado primeiro;
4. valide o sistema nesse banco;
5. somente então planeje a restauração do ambiente afetado.

Não apague migrations nem force `resolve` para esconder uma falha.

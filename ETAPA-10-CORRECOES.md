# Etapa 10: retenção e limpeza de dados operacionais

Esta etapa adiciona uma política segura, configurável e observável para dados que antes podiam crescer indefinidamente no PostgreSQL.

## Política padrão

| Dado | Ação | Prazo padrão | Proteção |
| --- | --- | ---: | --- |
| `AccountToken` expirado ou usado | Excluir | 7 dias | Tokens ainda válidos e não usados permanecem |
| `WatchSession` encerrada ou bloqueada | Excluir | 90 dias | `ACTIVE` nunca é elegível |
| `Notification` lida | Excluir | 180 dias | Notificações mais novas permanecem |
| `Notification` não lida | Excluir | 365 dias | Prazo maior para reduzir perda de aviso |
| `WebhookEvent` processado ou ignorado | Excluir | 90 dias | `RECEIVED` nunca é elegível |
| `WebhookEvent` falho | Excluir | 180 dias | Prazo maior para investigação e reprocessamento |
| `IntegrationLog` | Excluir | 180 dias | Logs recentes permanecem |
| `AuditLog` | Excluir | 365 dias | Histórico administrativo recente permanece |
| `ExternalCustomer.raw` | Definir como SQL `NULL` | 30 dias | Cliente e campos normalizados permanecem |
| `ExternalSubscription.raw` | Definir como SQL `NULL` | 30 dias | Assinatura e campos normalizados permanecem |

Os prazos são calculados no início de cada execução. A seleção e a alteração repetem o mesmo critério, reduzindo a possibilidade de uma mudança concorrente tornar um registro indevidamente elegível.

## Limites operacionais

Por padrão, cada categoria processa no máximo 10 lotes de 500 registros por rodada. Isso limita a pressão no banco e permite que execuções seguintes continuem reduzindo um passivo antigo.

Variáveis disponíveis:

```env
DATA_RETENTION_ENABLED=true
DATA_RETENTION_INTERVAL_MS=86400000
DATA_RETENTION_BATCH_SIZE=500
DATA_RETENTION_MAX_BATCHES_PER_RUN=10
ACCOUNT_TOKEN_RETENTION_DAYS=7
WATCH_SESSION_RETENTION_DAYS=90
NOTIFICATION_READ_RETENTION_DAYS=180
NOTIFICATION_UNREAD_RETENTION_DAYS=365
WEBHOOK_EVENT_RETENTION_DAYS=90
WEBHOOK_FAILED_RETENTION_DAYS=180
INTEGRATION_LOG_RETENTION_DAYS=180
AUDIT_LOG_RETENTION_DAYS=365
EXTERNAL_RAW_RETENTION_DAYS=30
```

`DATA_RETENTION_ENABLED=false` desativa somente o agendamento automático. A execução manual continua disponível para uma ação administrativa intencional.

## Fila e operação

O worker registra o job recorrente `data-retention.cleanup`. A rotina é idempotente e falha de forma explícita, permitindo que o BullMQ aplique sua política normal de novas tentativas.

Endpoints:

```text
GET  /api/admin/integrations/data-retention
POST /api/admin/integrations/data-retention/cleanup
```

O diagnóstico informa configuração, quantidade elegível por categoria e totais protegidos de webhooks pendentes e sessões ativas. Ele não expõe payloads, mensagens, IDs ou dados pessoais.

## Banco de dados

A migration `20260902143000_data_retention_indexes` adiciona índices para os filtros de prazo e estado usados pelo job. Ela não exclui dados durante o deploy.

Aplicação em produção:

```bash
npm run db:generate
npm run db:migrate:deploy
```

Depois, reinicie API e worker. Verifique o diagnóstico antes de solicitar a primeira limpeza manual.

## Arquivos desta etapa

- `.env.example`
- `README.md`
- `TESTING-V10.md`
- `ETAPA-10-CORRECOES.md`
- `prisma/schema.prisma`
- `prisma/migrations/20260902143000_data_retention_indexes/migration.sql`
- `apps/api/src/generated/prisma/internal/class.ts`
- `apps/api/src/integrations/data-retention.service.ts`
- `apps/api/src/integrations/integrations.controller.ts`
- `apps/api/src/integrations/integrations.module.ts`
- `apps/api/src/jobs/job-processor.service.ts`
- `apps/api/src/jobs/job-worker.service.ts`
- `apps/api/src/jobs/jobs.types.ts`
- `apps/api/test/data-retention.test.ts`

## Validações

- Prisma format e generate: OK.
- Prisma schema validate: OK.
- TypeScript de API e testes: OK.
- Testes automatizados: 147/147.
- Build da API: OK.
- Build do frontend: OK.
- Estrutura e conteúdo do ZIP: OK.

As integrações reais, a migration contra uma cópia do PostgreSQL de produção e o processamento BullMQ com Redis real continuam sendo validações obrigatórias de staging.

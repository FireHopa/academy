# Etapa 5 — Jobs seguros em produção

Esta etapa impede que importações e sincronizações pesadas sejam executadas dentro da requisição HTTP quando Redis, fila ou worker estiverem indisponíveis em produção.

## Política aplicada

### Produção

- todos os jobs usam BullMQ;
- `JOBS_FORCE_QUEUE=false` não desativa a fila obrigatória;
- `JOBS_INLINE_FALLBACK=true` não habilita execução inline;
- `JOBS_RUN_IN_API=true` interrompe a inicialização com uma mensagem objetiva;
- Redis ou fila indisponível gera HTTP 503;
- worker sem heartbeat não empurra o processamento para a API;
- se Redis estiver disponível, o job pode permanecer enfileirado até o worker voltar.

### Desenvolvimento

- o fallback inline continua disponível quando não existe heartbeat e nenhuma tentativa de enfileiramento foi iniciada;
- pode ser desativado com `JOBS_INLINE_FALLBACK=false`;
- pode-se forçar a fila com `JOBS_FORCE_QUEUE=true`.

## Proteção contra duplicidade

Depois que `queue.add()` é chamado, qualquer falha ou timeout é tratado como resultado incerto.

Nesse cenário, a API não executa o mesmo job inline, pois a fila ainda pode ter aceitado a operação. A resposta é 503 e a operação pode ser consultada antes de uma nova tentativa.

## Painel de jobs

O resumo de `/api/admin/jobs` passa a informar:

- `fallback: inline` ou `disabled`;
- `dispatchMode: queue`, `queue_only` ou `worker_required`;
- estado online do worker;
- contagens da fila quando disponíveis.

## Arquivos alterados

- `.env.example`
- `apps/api/src/main.ts`
- `apps/api/src/jobs/queue-connection.ts`
- `apps/api/src/jobs/job-queue.service.ts`
- `apps/api/test/performance-stage3.test.ts`

## Banco e ambiente

- nenhuma alteração no schema Prisma;
- nenhuma migration;
- nenhuma variável nova;
- o `.env.example` desta entrega preserva o conteúdo completo da Etapa 1 e acrescenta a explicação da política de produção.

Em produção, confirme:

```env
NODE_ENV=production
JOBS_RUN_IN_API=false
```

`JOBS_FORCE_QUEUE` e `JOBS_INLINE_FALLBACK` continuam aceitos para desenvolvimento, mas não conseguem enfraquecer a política de produção.

## Aplicação

Copie os arquivos mantendo os caminhos do ZIP e execute:

```bash
npm ci
npm run test:typecheck
npm run test:api
npm run build
```

Depois, reinicie primeiro o processo separado do worker e depois a API, usando o gerenciador de processos adotado no servidor.

Valide no painel administrativo:

1. worker online;
2. importação retorna `queued: true`;
3. job aparece como `waiting`, `active` ou `completed`;
4. ao parar o worker, a API não executa a importação inline;
5. ao interromper Redis, a operação retorna indisponibilidade sem iniciar o processamento na API.

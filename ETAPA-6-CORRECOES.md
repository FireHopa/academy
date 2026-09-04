# Etapa 6: liveness e readiness operacionais

Esta etapa separa a verificação de processo vivo da verificação de prontidão para receber tráfego.

## Endpoints

### Liveness

```text
GET /health/live
GET /api/health/live
```

Valida somente se o processo da API está respondendo. Retorna HTTP 200 sem consultar dependências externas.

Use este endpoint para decidir se o processo precisa ser reiniciado.

### Readiness

```text
GET /health/ready
GET /api/health/ready
```

Valida em paralelo:

- PostgreSQL;
- Prisma;
- Redis;
- comunicação com a fila BullMQ;
- heartbeat do worker separado;
- storage local ou bucket S3/R2;
- configuração Panda ou Mux;
- configuração TheMembers;
- configuração de e-mail.

Retorna HTTP 200 quando todos os checks passam e HTTP 503 quando algum deles falha.

Use este endpoint no balanceador ou proxy para impedir que uma instância incompleta receba tráfego. Não use readiness como motivo automático de reinício, pois uma indisponibilidade externa pode causar ciclos desnecessários de restart.

## Compatibilidade

Os endpoints existentes continuam funcionando:

```text
GET /health
GET /api/health
```

Eles agora representam readiness e preservam o contrato HTTP 200/503 anterior.

## Storage

No driver local, o healthcheck cria o diretório de imagens quando necessário e confirma permissões de leitura e gravação.

No driver S3/R2, o check executa `HeadBucket`, sem criar, modificar ou remover objetos. A credencial usada pela aplicação precisa permitir a consulta do bucket. Na AWS, isso normalmente exige `s3:ListBucket` no bucket configurado.

## Fila e worker

Os checks são independentes:

- `redis` confirma que o Redis responde `PONG`;
- `queue` confirma que a API consegue consultar a fila BullMQ;
- `worker` confirma a presença do heartbeat com TTL publicado pelo processo separado.

Assim, o readiness identifica se a falha está na infraestrutura Redis, na fila ou no processo worker.

## Segurança

- todos os checks possuem timeout de dois segundos;
- mensagens internas, URLs, credenciais e erros de provedores não aparecem na resposta;
- todas as rotas de health usam `Cache-Control: no-store`;
- nenhuma operação destrutiva é executada no storage;
- o endpoint de liveness não consulta dependências e continua disponível durante falhas externas.

## Arquivos alterados

- `README.md`
- `apps/api/src/main.ts`
- `apps/api/src/health/health.controller.ts`
- `apps/api/src/health/health.module.ts`
- `apps/api/src/health/health.service.ts`
- `apps/api/src/jobs/job-queue.service.ts`
- `apps/api/src/media/image-storage.service.ts`
- `apps/api/test/health.test.ts`
- `apps/api/test/image-storage.test.ts`

## Banco e ambiente

- nenhuma alteração no schema Prisma;
- nenhuma migration;
- nenhuma variável de ambiente nova;
- nenhuma alteração nos dados existentes.

## Validações executadas

- 120 de 120 testes da API aprovados;
- novos cenários para liveness, readiness, falhas isoladas e storage local;
- typecheck completo aprovado;
- build de produção do Next.js e do NestJS aprovado;
- resposta de health validada para não expor mensagens internas ou credenciais.

## Aplicação

Copie os arquivos mantendo os caminhos do ZIP e execute:

```bash
npm ci
npm run test:typecheck
npm run test:api
npm run build
```

Reinicie primeiro o worker e depois a API. Em seguida, valide:

```bash
curl -i http://localhost:4000/health/live
curl -i http://localhost:4000/health/ready
curl -i http://localhost:4000/health
```

Os três devem responder HTTP 200. Pare apenas o worker e confirme que `live` permanece 200 enquanto `ready` e o alias `/health` retornam 503 com `worker: false`.

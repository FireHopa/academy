# Performance, Etapa 3

Esta etapa tira operações pesadas do processo HTTP, prepara imagens para armazenamento de objetos e CDN, adiciona métricas reais de aplicação e entrega um teste de carga reproduzível com 100 alunos autenticados. Não há migration de banco nesta etapa.

## 1. Instalação

Substitua ou crie os arquivos do pacote e execute:

```bash
npm install
npm run test:typecheck
npm test
npm run build
```

Use `.env.performance.example` como referência e copie somente as variáveis necessárias para o `.env` real. Nunca versione o arquivo de sessões de carga nem credenciais S3.

## 2. API e worker

O BullMQ usa a fila `academy-background` e os jobs abaixo:

| Job | Origem | Comportamento |
|---|---|---|
| `students.import` | `POST /api/admin/students/import` | Importa até 1.000 alunos fora da requisição |
| `themembers.course.sync` | Importação de curso no admin | Sincroniza módulos e aulas mantendo IDs locais estáveis |
| `themembers.products.sync` | Sincronização de produtos no admin | Atualiza produtos e referências comerciais |
| `themembers.enrollment.sync` | Webhooks TheMembers | Processa concessão ou revogação de acesso com idempotência |
| `themembers.reconcile` | Agendamento opcional | Reconcilia produtos, cursos, grants, matrículas e sessões |

Inicie os três processos em produção:

```bash
npm run start -w @academy/web
npm run start -w @academy/api
npm run start:worker -w @academy/api
```

No desenvolvimento Linux, `npm run linux:dev` já inicia frontend, API e worker. Para executar manualmente:

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
```

O worker publica heartbeat no Redis. Se ele ou o Redis não estiver disponível e `JOBS_INLINE_FALLBACK=true`, a API executa a mesma operação inline e preserva a resposta antiga. Isso evita indisponibilidade durante implantação gradual. Para exigir fila e falhar fechado, use `JOBS_FORCE_QUEUE=true` e `JOBS_INLINE_FALLBACK=false` somente depois de monitorar o worker.

Os jobs tentam até cinco vezes com backoff exponencial. IDs determinísticos evitam duplicação simultânea em importações e webhooks. Consulte um job enfileirado em:

```text
GET /api/admin/jobs/:jobId
```

O heartbeat do worker e os totais da fila ficam em `GET /api/admin/jobs`.

A rota exige sessão de administrador. O encerramento de API e worker fecha conexões do Nest, PostgreSQL, Redis e BullMQ de forma graciosa.

### Reconciliação TheMembers

Ative o agendamento somente no processo worker:

```dotenv
THEMEMBERS_BACKGROUND_SYNC=true
THEMEMBERS_RECONCILE_INTERVAL_MS=900000
THEMEMBERS_BACKGROUND_SYNC_COURSES=true
THEMEMBERS_RECONCILE_COURSE_LIMIT=25
```

A reconciliação atualiza os cursos já importados, alinha grants com os mapeamentos atuais de produtos, recalcula matrículas efetivas e bloqueia somente sessões que realmente perderam acesso. Matrículas manuais ativas continuam soberanas. O progresso permanece ligado à aula local estável identificada pelo ID externo da TheMembers.

Antes de ligar o agendamento, execute uma vez por `POST /api/admin/integrations/themembers/reconcile` e acompanhe o job retornado.

## 3. PostgreSQL e consultas lentas

O pool passa a ter limites explícitos:

```dotenv
PG_POOL_MIN=0
PG_POOL_MAX=10
PG_POOL_IDLE_TIMEOUT_MS=30000
PG_POOL_CONNECT_TIMEOUT_MS=5000
PG_APPLICATION_NAME=academy-api
PRISMA_SLOW_QUERY_MS=250
```

Dimensione `PG_POOL_MAX` considerando todas as réplicas de API e worker. Exemplo: quatro APIs e dois workers com limite 10 podem abrir até 60 conexões. Preserve margem para migrations, administração e rotinas do banco.

Consultas acima de `PRISMA_SLOW_QUERY_MS` entram no logger estruturado e na janela de métricas. Apenas o SQL parametrizado é guardado, nunca o array de parâmetros.

## 4. Imagens S3 e CDN

O modo padrão continua local. Para S3, Cloudflare R2, MinIO ou serviço compatível:

```dotenv
IMAGE_STORAGE_DRIVER=s3
S3_REGION=auto
S3_BUCKET=academy-images
S3_ENDPOINT=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
S3_PUBLIC_URL=https://cdn.seudominio.com
S3_PRESIGN_EXPIRES_SEC=300
```

Com S3 ativo, capas e banners são convertidos para WebP no navegador e enviados diretamente por formulário pré-assinado. A API continua oferecendo o upload multipart antigo como fallback. Avatar e navegadores sem a conversão necessária passam pela API, que usa Sharp e grava no mesmo bucket.

Objetos recebem `Cache-Control: public, max-age=31536000, immutable` e nomes UUID. Ao substituir ou remover uma imagem administrada, a API exclui o objeto antigo. URLs externas nunca são excluídas.

Configure CORS no bucket para o domínio exato do frontend:

```json
[
  {
    "AllowedOrigins": ["https://app.seudominio.com"],
    "AllowedMethods": ["GET", "HEAD", "POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

O bucket pode permanecer privado para escrita. A leitura deve ocorrer por domínio público ou CDN configurado em `S3_PUBLIC_URL`. Restrinja a credencial da aplicação a `PutObject` e `DeleteObject` no prefixo `images/`. Uma regra de lifecycle para abortar uploads multipart antigos é recomendada; não expire imagens publicadas automaticamente.

## 5. Métricas e Core Web Vitals

O coletor mede:

- API: quantidade, erros, status, média, máximo, p50, p95 e p99 por método e rota normalizada;
- navegador: LCP, INP, CLS, TTFB e FCP, com p50, p75 e p95;
- Prisma: quantidade, média, p50, p95, p99 e últimas consultas lentas;
- jobs: enfileirados, inline, iniciados, concluídos, falhos e percentis de duração;
- processo: uptime, RSS e heap.

Consulte:

```text
GET /api/admin/observability/metrics
```

A rota é privada, sem cache e restrita a administrador. As métricas ficam em memória, em janelas limitadas, e reiniciam com o processo. Para retenção histórica, faça scraping periódico desse endpoint para sua plataforma de observabilidade.

O navegador envia lotes pequenos para `POST /api/observability/web-vitals`. A rota é pública porque o dado vem antes de qualquer garantia de sessão, mas possui validação estrita, rate limit e limite de 20 amostras por lote.

## 6. Teste de carga com 100 alunos

Pré-requisitos:

- API, frontend, PostgreSQL, Redis e worker ativos;
- k6 instalado;
- pelo menos 100 alunos distintos, ativos, com onboarding concluído, matrícula válida e aula publicada com vídeo `READY`;
- `DATABASE_URL` e `JWT_SECRET` do ambiente de teste disponíveis apenas no terminal.

Gere cookies temporários de duas horas sem executar login em massa:

```bash
LOAD_STUDENT_VUS=100 npm run load:sessions
```

O resultado fica em `load-tests/.sessions.local.json`, com permissão `0600` e ignorado pelo Git. Ele contém credenciais temporárias e deve ser apagado ao terminar.

Execute:

```bash
LOAD_API_URL=https://api-homolog.seudominio.com/api \
LOAD_WEB_ORIGIN=https://homolog.seudominio.com \
LOAD_DURATION=5m \
npm run load:test
```

Os 100 alunos são divididos entre Home, Catálogo, Biblioteca e Playback. O cenário administrativo usa dois VUs adicionais se existir um administrador no arquivo. O playback abre uma sessão, envia heartbeat e encerra a sessão em cada iteração.

Os gates iniciais são:

| Fluxo | p95 | p99 | Erros |
|---|---:|---:|---:|
| Home | 500 ms | 1.000 ms | < 1% |
| Catálogo | 600 ms | 1.200 ms | < 1% |
| Biblioteca | 700 ms | 1.400 ms | < 1% |
| Playback | 1.000 ms | 2.000 ms | < 1% |
| Dashboard admin | 500 ms | 1.000 ms | < 1% |

O k6 grava `load-tests/stage3-summary.json`. Compare esse arquivo com o snapshot do endpoint de observabilidade e os logs de consultas lentas. Não rode o teste contra produção sem janela aprovada e capacidade previamente calculada.

## 7. Ordem segura de implantação

1. Instale as dependências e publique API, frontend e worker com `JOBS_INLINE_FALLBACK=true`.
2. Confirme Redis, heartbeat e processamento de um job de importação pequeno.
3. Ative o armazenamento S3 em homologação e valide upload, CDN, CORS, substituição e exclusão.
4. Confirme Core Web Vitals e percentis no endpoint administrativo.
5. Rode primeiro 10 VUs, depois 25, 50 e 100.
6. Ative a reconciliação recorrente da TheMembers somente depois de uma execução manual validada.

Rollback operacional: pare o worker e mantenha `JOBS_INLINE_FALLBACK=true`; para imagens, restaure `IMAGE_STORAGE_DRIVER=local`. URLs S3 já persistidas continuam sendo exibidas, pois são URLs públicas independentes do driver de escrita.

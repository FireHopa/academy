# Academy Play: Etapa 4 de performance

Esta etapa fecha o roadmap com proteção contínua contra regressões. Ela transforma os dados e melhorias das etapas anteriores em limites versionados, relatórios reproduzíveis e gates de release.

Não há migration de banco nesta etapa.

## Critérios de aceite

| Área | SLO ou budget |
| --- | --- |
| JavaScript inicial por rota | até 185 KB Brotli por padrão, 190 KB na aula e 210 KB no admin |
| CSS inicial por rota | até 18 KB Brotli por padrão e 30 KB no admin |
| Maior chunk inicial | até 95 KB Brotli |
| CSS total compilado | até 170 KB raw |
| Dependências Mux | não podem voltar ao carregamento inicial de nenhuma rota |
| LCP | pior p75 por rota até 2,5 s, mínimo de 100 amostras |
| INP | pior p75 por rota até 200 ms, mínimo de 100 amostras |
| CLS | pior p75 por rota até 0,10, mínimo de 100 amostras |
| TTFB | pior p75 por rota até 800 ms, mínimo de 100 amostras |
| FCP | pior p75 por rota até 1,8 s, mínimo de 100 amostras |
| Home, catálogo, biblioteca e dashboard admin | p50 até 120 ms, p95 até 300 ms e p99 até 600 ms |
| Bootstrap do player | p50 até 200 ms, p95 até 500 ms e p99 até 900 ms |
| Erros no gate autenticado | máximo de 1% |

Os valores ficam em `performance/targets.json` e sua estrutura fica documentada em `performance/targets.schema.json`. Altere um limite apenas com uma mudança de produto justificada e uma nova medição de baseline.

## Comandos locais

Instale as dependências, rode o build de produção e execute os gates:

```bash
npm ci
npm run test:performance
npm run build
npm run performance:build
npm run performance:gate
```

O gate de build lê os manifests reais do App Router, elimina assets duplicados, mede Brotli por rota, verifica o maior chunk e o CSS total, e bloqueia módulos Mux no carregamento inicial.

`npm run performance:gate` exige o build, mas permite ignorar os gates de runtime quando as respectivas fontes não estão configuradas. Essa flexibilidade existe somente para desenvolvimento e pull requests.

## Gate autenticado da API

Use contas exclusivas de staging, uma de aluno com onboarding concluído e outra de administrador. A aula informada deve ter vídeo disponível.

```bash
export PERF_API_BASE_URL="https://api.staging.exemplo.com"
export PERF_WEB_ORIGIN="https://staging.exemplo.com"
export PERF_STUDENT_EMAIL="aluno-performance@exemplo.com"
export PERF_STUDENT_PASSWORD="senha-segura"
export PERF_ADMIN_EMAIL="admin-performance@exemplo.com"
export PERF_ADMIN_PASSWORD="senha-segura"
export PERF_LESSON_ID="id-da-aula-com-video"

npm run performance:api -- --require-all
```

Cada fluxo recebe aquecimento e 30 medições por padrão. O relatório contém p50, p95, p99, taxa de erro e distribuição de status. O bootstrap do player é sequencial e encerra cada sessão criada antes da medição seguinte, evitando bloqueios artificiais por limite de dispositivos.

Use `PERF_API_ITERATIONS`, `PERF_API_CONCURRENCY`, `PERF_API_WARMUP_REQUESTS` e `PERF_API_TIMEOUT_MS` para um ensaio controlado. O cenário de 100 alunos da Etapa 3 continua sendo o teste de capacidade e não deve ser executado contra produção.

## Exportação protegida de métricas

A API expõe `GET /api/observability/export` para o gate automatizado. O endpoint não usa cookie de usuário, exige um Bearer token próprio e responde com `Cache-Control: no-store, private`.

Configure na API um valor aleatório com pelo menos 32 caracteres:

```bash
export OBSERVABILITY_EXPORT_TOKEN="valor-aleatorio-com-pelo-menos-32-caracteres"
```

No consumidor do gate, use o mesmo valor:

```bash
export PERF_WEB_VITALS_SOURCE="https://api.exemplo.com/api/observability/export"
export PERF_WEB_VITALS_TOKEN="$OBSERVABILITY_EXPORT_TOKEN"
npm run performance:web-vitals -- --production
```

Sem token forte, a API responde 503. Com token ausente ou incorreto, responde 401. O token não deve ser reutilizado como JWT, senha de usuário ou segredo de integração.

As métricas da Etapa 3 ficam em memória e reiniciam junto com a instância da API. Em múltiplas réplicas, a URL do gate deve consultar uma fonte agregada ou uma réplica representativa com janela suficiente.

## Gate de Web Vitals

A fonte pode ser o endpoint protegido, um arquivo JSON ou um arquivo NDJSON. São aceitos eventos individuais com `name` e `value`, e séries agregadas com `name`, `route`, `p75` e `samples` ou `count`.

O gate soma as amostras de todas as séries da métrica e compara o pior p75 entre as rotas. Assim, uma rota lenta não é escondida por outra rota mais rápida.

Para validar um arquivo exportado:

```bash
export PERF_WEB_VITALS_SOURCE="./web-vitals-ultimas-24h.ndjson"
npm run performance:web-vitals
```

Também é possível autenticar uma fonte legada com `PERF_WEB_VITALS_COOKIE`, embora o Bearer token dedicado seja a opção recomendada.

## Gate completo de release

Antes da liberação de produção, configure todas as credenciais e fontes e execute:

```bash
npm run build
npm run performance:gate:production
```

O modo de produção opera de forma fechada: exige API, player, dashboard admin e Web Vitals mensuráveis; exige HTTPS nas duas fontes; e falha se qualquer fluxo for ignorado, se nenhuma série for medida ou se um limite for ultrapassado. Os relatórios JSON ficam em `.performance-results/`.

## CI

O workflow `.github/workflows/performance-gate.yml` executa testes funcionais, typecheck, testes das ferramentas, build e budgets em pull requests. Em execução manual e semanal, os jobs de runtime usam:

| Tipo | Nome |
| --- | --- |
| Variable | `PERF_API_BASE_URL` |
| Variable | `PERF_WEB_ORIGIN` |
| Variable | `PERF_LESSON_ID` |
| Variable | `PERF_WEB_VITALS_SOURCE` |
| Secret | `PERF_STUDENT_EMAIL` |
| Secret | `PERF_STUDENT_PASSWORD` |
| Secret | `PERF_ADMIN_EMAIL` |
| Secret | `PERF_ADMIN_PASSWORD` |
| Secret | `PERF_WEB_VITALS_TOKEN` |

Use como `PERF_WEB_VITALS_SOURCE` a URL HTTPS do endpoint `/api/observability/export`. O secret `PERF_WEB_VITALS_TOKEN` deve ter o mesmo valor de `OBSERVABILITY_EXPORT_TOKEN` configurado na API.

Proteja a branch principal com o job `Build and bundle budgets`. Os jobs de runtime devem estar ativos no ambiente usado para promover uma versão candidata.

## Liberação e rollback

1. Executar o gate autenticado em staging com a mesma versão candidata.
2. Confirmar que a janela de Web Vitals tem pelo menos 100 amostras por métrica.
3. Preservar os três relatórios como artefatos da versão.
4. Liberar gradualmente e acompanhar erros, p95, p99, slow queries, fila e Web Vitals.
5. Interromper a expansão ou reverter quando um SLO falhar por duas janelas consecutivas, quando os erros ultrapassarem 1% ou quando o p99 duplicar contra o baseline, mesmo ainda abaixo do teto absoluto.

Após um rollback, preserve os relatórios da versão reprovada e abra a correção com o fluxo ou rota exatos apontados pelo gate.

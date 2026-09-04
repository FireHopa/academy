# Academy Play — Auditoria Técnica V8

Data: 13/08/2026
Escopo: V1 a V7 + mudanças implementadas na V8

## Resumo executivo

A arquitetura construída até a V7 é coerente para um produto de streaming educacional, mas a auditoria encontrou falhas reais que impediam classificar a base como pronta para produção. As falhas objetivas que puderam ser corrigidas sem alterar o produto foram corrigidas na V8.

Status após correções:

- arquitetura: boa
- proteção de vídeo: boa para a fase atual
- autorização: significativamente endurecida
- operação de aluno: funcional
- onboarding/recuperação: implementados
- validação estática: aprovada
- build integrado: ainda não comprovado neste ambiente
- produção: ainda NÃO aprovada

## Achados corrigidos

### CRÍTICO — endpoint público de curso expunha rascunhos e campos internos

Problema V7:

`GET /api/courses/:slug` não filtrava `PUBLISHED` e retornava o objeto completo das aulas. Isso permitia descobrir um curso DRAFT pelo slug e receber metadados internos, inclusive identificadores do pipeline de vídeo.

Correção V8:

- filtro obrigatório `status=PUBLISHED`
- select explícito de campos públicos
- IDs de asset/upload/playback não saem por essa rota
- autenticação passou a default-deny no restante da API

Status: corrigido.

### CRÍTICO — certificado confiava em `completed=true` vindo do cliente

Problema V7:

Um cliente poderia chamar a API de progresso e solicitar conclusão sem depender do fluxo normal do player.

Correção V8:

- servidor calcula conclusão de vídeo
- posição mínima de 92%
- `watchedSec` acumulado pelo heartbeat com relógio do servidor
- exigência de pelo menos 45% da duração em tempo real, compatível com vídeo em até 2x
- certificado só é avaliado quando o servidor aceita a conclusão

Status: corrigido para o modelo atual. Ainda não equivale a proctoring.

### ALTO — webhook antigo poderia sobrescrever vídeo substituído

Problema V7:

Um evento atrasado relacionado a um upload antigo poderia encontrar a aula e alterar seu asset atual.

Correção V8:

- correlação por `videoUploadId` vigente
- eventos sem `upload_id` esperado são ignorados
- eventos de upload antigo recebem tratamento `stale_upload`

Status: corrigido.

### ALTO — rotas protegidas dependiam de guards individuais

Problema:

Era possível criar uma nova controller e esquecer de colocar o guard.

Correção:

- `AuthGuard` global
- API protegida por padrão
- somente rotas com `@Public()` ficam abertas

Superfície pública atual:

- login/logout
- recuperação/reset/convite
- catálogo público seguro de cursos publicados
- health
- webhook Mux assinado

Status: corrigido.

### ALTO — força bruta e abuso sem rate limiting

Correção:

- throttling global
- login: limite menor
- recuperação de senha: limite menor
- validação/uso de token: limite menor
- webhook Mux não usa throttling do app porque já possui verificação criptográfica própria e pode chegar em rajadas

Status: corrigido para instância única. Antes de múltiplas réplicas, usar storage Redis compartilhado.

### ALTO — bloqueio de usuário podia voltar a validar JWT antigo após reativação

Correção:

- `sessionVersion` passa a integrar o JWT
- bloqueio incrementa versão
- mudança de senha/e-mail incrementa versão
- JWT antigo não volta a valer após reativação

Status: corrigido.

### ALTO — token de uso único tinha janela de corrida

Problema da implementação inicial da própria V8:

Duas requisições quase simultâneas poderiam validar o mesmo token antes da primeira gravação de `usedAt`.

Correção:

- consumo feito com `updateMany` condicionado a `usedAt=null` e `expiresAt>now`
- exatamente uma requisição precisa obter `count=1`

Status: corrigido.

### ALTO — seed inseguro em produção

Correção:

- conteúdo demo proibido em `NODE_ENV=production`
- senha padrão de admin proibida em produção
- admin de produção exige configuração explícita

Status: corrigido.

### ALTO — `.env` da raiz não era carregado explicitamente pelos workspaces

Correção:

- API procura `.env` do app e da raiz
- Next carrega explicitamente `.env` do app e da raiz
- evita divergência entre Prisma, API e frontend

Status: corrigido.

### MÉDIO — inconsistência de papel INSTRUCTOR

Problema:

Playback reconhecia INSTRUCTOR como staff, mas recursos/progresso não eram totalmente consistentes.

Correção:

- regra de staff alinhada em playback, progresso e recursos

Status: corrigido.

### MÉDIO — proteção CSRF/origin não era explícita

Correção:

- mutações POST/PUT/PATCH/DELETE validam `Origin`
- produção rejeita origem ausente
- origem precisa corresponder ao `WEB_URL`
- webhook Mux é exceção e usa assinatura HMAC
- cookie permanece HTTP-only e SameSite=Lax

Status: corrigido para arquitetura web de origem única.

### MÉDIO — validação de entrada permissiva

Correções:

- `forbidNonWhitelisted=true`
- body JSON limitado
- transcrição limitada
- imagens e materiais exigem HTTP/HTTPS
- tamanhos de arrays limitados
- durações/timestamps limitados
- link interno de notificação rejeita `//host`

Status: corrigido nos pontos auditados.

### MÉDIO — produção podia subir com recursos essenciais quebrados

Correção fail-fast:

Produção recusa inicialização sem:

- JWT forte
- HTTPS no web e API
- termos/versionamento
- URLs HTTPS de termos/privacidade
- configuração essencial Mux/DRM
- provider de e-mail Resend
- credenciais de e-mail

Status: corrigido.

## Pontos validados como bons

### Mux/DRM

- vídeo não é entregue como MP4 público
- Direct Upload evita trafegar arquivo grande pela API
- asset criado com política DRM
- playback e DRM usam tokens separados
- webhook valida assinatura HMAC e janela temporal
- token é assinado no backend
- Playback ID/DRM não é exposto por API pública de catálogo

### Simultaneidade

- limite de dispositivos configurável
- limite de streams configurável
- heartbeat
- timeout de sessão
- takeover
- advisory lock PostgreSQL por usuário evita corrida simples entre instâncias que usam o mesmo banco

### Matrícula

Acesso considera:

- status ACTIVE
- `startsAt <= now`
- `expiresAt` ausente ou futuro

A regra é aplicada em áreas críticas, incluindo playback.

### Certificado

- chave única por usuário + curso
- upsert evita duplicação
- primeira emissão é preservada

## Pendências e riscos ainda abertos

### BLOQUEADOR — build integrado ainda não executado

Tentativa realizada nesta auditoria:

```text
npm install --no-audit --no-fund --prefer-offline
```

Resultado: timeout do ambiente após 120 segundos.

Por isso NÃO foi possível comprovar aqui:

- resolução real de todas as dependências
- Prisma Client gerado
- `next build`
- `nest build`
- integração real com PostgreSQL

Validação que passou:

- 91 arquivos TS/TSX transpilados sintaticamente sem erro
- 18 models Prisma encontrados
- 9 enums
- braces/schema estrutural consistente
- nenhum campo duplicado detectado
- ZIP final será testado após empacotamento

### RESOLVIDO NA V10-002 — suíte mínima de testes automatizados

Implementado na V10-002:

- login, logout, conta bloqueada e recuperação de senha;
- matrícula, expiração e curso sem acesso;
- progresso, conclusão protegida e certificado;
- limite de dispositivos, streams e takeover;
- Panda playback com DRM/watermark;
- webhook TheMembers e idempotência;
- 36 cenários positivos e negativos com piso de cobertura automatizado.

Ainda é obrigatório executar E2E externo em staging com PostgreSQL, Panda, TheMembers e proxy reais antes da produção.

### RESOLVIDO NA V10-003 — healthcheck de produção

Implementado na V10-003:

- endpoint público `GET /health` com HTTP 200/503 e alias compatível `/api/health`;
- checks independentes da API, PostgreSQL e Prisma;
- validação de configuração Panda, TheMembers e Resend sem chamadas aos provedores;
- limite de dois segundos por consulta de banco;
- resposta sem cache, valores secretos ou mensagens internas;
- 11 cenários automatizados específicos, elevando a suíte para 47 testes.

O build integrado de Next.js e NestJS, o typecheck, a validação Prisma e a cobertura automatizada passaram nesta entrega. Ainda é obrigatório confirmar o endpoint contra PostgreSQL e configurações reais em staging.

### RESOLVIDO NA V10-010 — integração Panda finalizada em código

Implementado na V10-010:

- cliente da API Panda com timeout, redirecionamento bloqueado e mensagens saneadas;
- biblioteca com paginação, busca, filtro e resposta mínima para o navegador;
- thumbnail, duração, status, vínculo e atualização validados;
- webhook fechado quando o token não está configurado;
- fallback seguro para eventos de status;
- player HTTPS e watermark com nome, e-mail e ID validados;
- 17 novos cenários, elevando a suíte para 64 testes.

Ainda é obrigatório executar a validação com conta Panda, pasta, vídeo, webhook e player reais em staging.

### RESOLVIDO NA V10-011 — DRM Panda obrigatório em produção

Implementado na V10-011:

- `PANDA_REQUIRE_DRM=true` exigido explicitamente no boot de produção;
- Group ID e secret obrigatórios, com validação de UUID;
- JWT `HS256` assinado somente no backend;
- watermark com nome, e-mail e ID completo do aluno;
- bloqueio da assinatura para player HTTPS fora dos hosts oficiais Panda;
- healthcheck e painel administrativo refletem a prontidão DRM;
- cinco novos cenários, elevando a suíte para 69 testes.

A eficácia visual e a configuração do grupo ainda devem ser confirmadas com uma conta Panda real em staging antes da produção.

### RESOLVIDO NA V10-012 — painel de diagnóstico Panda

Implementado na V10-012:

- rota administrativa protegida para diagnóstico em tempo real;
- conexão, DRM e webhook apresentados sem valores secretos;
- contagem de vídeos vinculados, processando e com erro;
- assets Panda sem aula ignorados nos indicadores operacionais;
- botão de teste de conexão no painel responsivo de integrações;
- seis novos cenários, elevando a suíte para 75 testes.

A resposta do painel ainda deve ser comparada com a conta Panda e o banco reais em staging antes da produção.

### RESOLVIDO NA V10-013 — referências visuais antigas ao Mux

Implementado na V10-013:

- editor de cursos orientado à Biblioteca Panda;
- segurança descrita como DRM/Watermark e autorização por sessão;
- referências fixas a upload direto, asset ID e playback ID Mux removidas da interface principal;
- fallback Mux preservado no uploader, player, rotas, provider e webhooks;
- dois novos cenários, elevando a suíte para 77 testes.

A interface ainda deve ser revisada visualmente em staging nos breakpoints de desktop, tablet e mobile.

### VALIDADO EM CÓDIGO NA V10-020 — ciclo TheMembers ponta a ponta

Validado na V10-020:

- payload oficial do Checkout e token `x-signature`;
- cadeia compra, cliente, produto, grant, matrícula e biblioteca;
- cancelamento específico por produto;
- preservação de grants restantes e matrículas manuais;
- bloqueio seletivo de sessões após perda efetiva de acesso;
- idempotência sem duplicação de registros;
- quatro novos cenários, elevando a suíte para 81 testes.

A conclusão externa da tarefa depende de uma compra e um cancelamento reais em staging com credenciais TheMembers.

### RESOLVIDO NA V10-001 — migrations Prisma versionadas

Implementado na V10-001:

- baseline versionado do schema V9;
- `prisma migrate deploy` no fluxo oficial;
- validação de drift antes de registrar um banco existente;
- procedimento obrigatório de backup documentado em `MIGRATIONS-V10.md`.

Ainda é obrigatório testar o procedimento em uma cópia restaurada do banco real antes da VPS de produção.

### ALTO — sem audit log administrativo

Hoje o sistema executa as ações, mas ainda não mantém trilha formal de:

- qual admin bloqueou aluno
- quem liberou/cancelou curso
- quem revogou dispositivo
- quem alterou curso/aula
- valores anteriores e posteriores

### ALTO — sem MFA para administradores

Senha + cookie continuam sendo o único fator de acesso administrativo.

### ALTO — sem observabilidade de produção

Faltam:

- logs estruturados
- correlation/request ID
- monitoramento de exceptions
- métricas de webhook
- alerta de asset Mux com erro
- alerta de login/abuso

### ALTO — backup/restore não testado

Docker possui volume persistente local, mas isso não constitui estratégia de backup de produção.

### MÉDIO — alteração de e-mail é imediata

A mudança exige a senha atual e invalida JWTs antigos, porém ainda não exige confirmação no novo endereço. Recomenda-se confirmação antes de trocar o e-mail principal de recuperação.

### MÉDIO — revogação de playback tem limite arquitetural

O heartbeat derruba o player oficial quando WatchSession perde autorização. Entretanto, um JWT Mux já emitido continua válido até `exp`. A V8 adiciona `custom.session_id` para rastreabilidade, mas não existe consulta ao nosso PostgreSQL dentro da validação criptográfica feita pela infraestrutura Mux.

### MÉDIO — rate limit não é distribuído

`@nestjs/throttler` está usando storage local do processo. Em uma única instância funciona. Em múltiplas réplicas, cada instância teria sua própria contagem. Redis já está no Docker e pode ser utilizado nessa etapa futura.

### MÉDIO — e-mail sem fila/retry

Envio é síncrono via API do provider. Antes de volume maior, usar fila/retry e registrar falhas.

### MÉDIO — storage de materiais ainda não é privado

Materiais são URLs administradas. Upload privado R2/S3 com links assinados ainda não foi implementado.

### MÉDIO — política de retenção de dados ainda não existe

A aplicação registra IP, dispositivos, sessões e histórico. Deve existir uma regra operacional de retenção/remoção antes de uso em produção.

## Decisão de auditoria

**V8 aprovada como base de desenvolvimento/staging.**

**V8 não aprovada para produção** até concluir os bloqueadores de build, migrations, testes e validação Mux real.

## Próxima versão recomendada

V9 — Pré-produção e qualidade:

1. migrations
2. testes
3. audit log
4. MFA admin
5. observabilidade
6. staging
7. Mux DRM real
8. backup/restore
9. teste de carga
10. checklist de deploy

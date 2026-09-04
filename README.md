# Academy Play V10 — Plataforma de cursos e vídeos

## Validação matemática de CPF

Novos alunos não podem mais ser cadastrados com uma sequência que tenha apenas o tamanho de um CPF. A API agora valida os dois dígitos verificadores e rejeita também números repetidos, caracteres estranhos e valores incompletos.

O backend aceita o formato digitado ou formatado:

```text
52998224725
529.982.247-25
```

Antes da gravação, o valor é normalizado para 11 dígitos. A mesma regra existe no DTO e no serviço administrativo, impedindo que chamadas diretas contornem o frontend. Registros antigos não são modificados nem bloqueiam login, progresso ou acesso.

## Validação pública de certificados

Empresas e terceiros podem validar um certificado sem possuir conta na plataforma:

```text
Página pública: /verify-certificate
API pública:    GET /api/certificates/verify/:code
```

A resposta pública informa somente nome do aluno, curso, data de emissão e código. E-mail, IDs internos e demais dados da conta não são consultados nem retornados. Códigos inválidos e inexistentes usam a mesma resposta negativa, sem cache, e o endpoint aceita no máximo 10 consultas por IP a cada minuto.

Certificados já emitidos com 10 caracteres aleatórios continuam válidos. Novas emissões usam 16 caracteres hexadecimais, equivalentes a 64 bits de aleatoriedade.

## Progresso de vídeo validado pelo servidor

O heartbeat não soma mais tempo apenas porque a página permaneceu aberta. Para creditar `watchedSec`, o servidor exige avanço positivo e plausível da posição do vídeo.

```text
crédito = mínimo entre tempo transcorrido e avanço positivo da posição
```

O crédito é zero quando o vídeo está pausado, retrocede ou salta além da velocidade máxima configurada mais a tolerância de busca. A reprodução em até 2x continua válida, mas recebe somente o tempo real transcorrido. Heartbeats da mesma sessão são serializados para impedir incremento duplicado.

Para concluir uma videoaula, o aluno precisa simultaneamente de:

- posição solicitada de pelo menos 92%;
- posição de pelo menos 92% alcançada com avanço creditado pelo heartbeat;
- `watchedSec` creditado de pelo menos 45% da duração.

Ao chegar ao final, o player envia um heartbeat de confirmação antes de solicitar a conclusão. A nova sessão também inicia em `lastPositionSec` com a posição de retomada já salva.

## Retenção de dados operacionais

O worker executa diariamente uma limpeza limitada por lotes para impedir o crescimento indefinido de tokens, sessões encerradas, notificações, webhooks processados, logs de integração e auditoria. A política padrão preserva webhooks `RECEIVED`, sessões `ACTIVE` e todos os dados normalizados de clientes e assinaturas.

Os payloads `raw` de `ExternalCustomer` e `ExternalSubscription` são limpos após 30 dias por padrão. Os registros continuam existentes com seus relacionamentos, status, datas e identificadores normalizados.

Endpoints administrativos:

```text
GET  /api/admin/integrations/data-retention
POST /api/admin/integrations/data-retention/cleanup
```

O primeiro mostra políticas, quantidades elegíveis e totais protegidos, sem retornar conteúdo ou IDs. O segundo enfileira uma execução manual e registra a solicitação no `AuditLog`. Os prazos e limites estão documentados em `.env.example` e em `ETAPA-10-CORRECOES.md`.

## Lifecycle de vídeos e assets órfãos

O worker executa diariamente uma limpeza controlada de `VideoAsset` sem nenhuma aula vinculada. Toda desvinculação, substituição ou exclusão de aula, módulo e curso reinicia uma carência padrão de 24 horas antes da limpeza.

Política por provedor:

- Panda: remove apenas o registro local órfão e preserva o vídeo na biblioteca remota;
- Mux criado pelo Academy: remove primeiro o asset remoto e somente depois o registro local;
- Mux antigo sem marca de propriedade: preserva o remoto e o registro para revisão manual;
- falha externa: mantém o registro local para a próxima tentativa do worker;
- asset religado ou atualizado durante a carência: não é removido.

Endpoints administrativos:

```text
GET  /api/admin/integrations/video-assets/lifecycle
POST /api/admin/integrations/video-assets/cleanup
```

O primeiro mostra contagens sem expor IDs ou URLs privadas. O segundo enfileira uma execução manual usando a mesma política do job periódico.

## V10-020: validação ponta a ponta TheMembers

O ciclo comercial foi validado com o payload oficial do Checkout: `release.access` cria ou reutiliza o aluno, registra cliente e assinatura, gera grants, recalcula matrículas e libera os cursos na biblioteca. `revoke.access` cancela somente os grants daquele produto e preserva acessos mantidos por outro produto ou matrícula manual.

Quatro cenários novos também confirmam idempotência e bloqueio seletivo das sessões que realmente perderam acesso. O script `npm run test:themembers-webhook` foi alinhado à estrutura oficial para testes controlados.

A execução com compra e cancelamento reais continua obrigatória em staging. Consulte `THEMEMBERS-V10.md`.

## V10-013: comunicação visual Panda no editor

O editor administrativo de cursos agora orienta o fluxo real da Panda Video. As referências fixas a upload direto, asset ID e playback ID do Mux foram substituídas por Biblioteca Panda, DRM/Watermark e autorização por sessão.

O fallback Mux não foi removido. Tipos, uploader alternativo, player, rotas, provider e webhooks permanecem disponíveis quando `VIDEO_PROVIDER=mux` ou para conteúdo legado.

## V10-012: painel de diagnóstico Panda

O admin agora exibe um diagnóstico operacional Panda em `Admin -> Integrações -> Panda`, sem expor credenciais ou respostas externas.

O painel mostra:

- conexão real com a API Panda;
- DRM habilitado;
- webhook configurado;
- total de vídeos Panda vinculados a aulas;
- vídeos vinculados em upload ou processamento;
- vídeos vinculados com erro.

O botão `Testar conexão` executa uma nova consulta à Panda e atualiza os seis indicadores. Os contadores vêm do PostgreSQL e consideram somente `VideoAsset` Panda associado a pelo menos uma aula. O endpoint administrativo usa `Cache-Control: no-store, private`.

Consulte `PANDA-V10.md` para o contrato e o checklist de staging.

## V10-011: DRM e watermark Panda obrigatórios

O playback Panda de produção agora falha fechado sem DRM. A API exige `PANDA_REQUIRE_DRM=true`, um `PANDA_DRM_GROUP_ID` válido e o respectivo `PANDA_DRM_GROUP_SECRET` antes de iniciar em produção.

Principais garantias:

- JWT `HS256` criado exclusivamente no backend;
- `drm_group_id` incluído no token conforme o contrato oficial Panda;
- watermark individual com nome, e-mail e ID completo do aluno;
- token anexado somente ao parâmetro `watermark` de um player oficial Panda;
- URLs HTTPS de hosts não oficiais são bloqueadas antes da assinatura;
- resposta de playback sem secret, API Key ou configuração DRM desnecessária;
- endpoint de autorização com `Cache-Control: no-store, private`;
- rollback explícito continua disponível fora de produção com `PANDA_REQUIRE_DRM=false`.

Em produção, configure:

```env
PANDA_DRM_GROUP_ID="UUID-DO-GRUPO-DRM"
PANDA_DRM_GROUP_SECRET="SECRET-DO-GRUPO-DRM"
PANDA_REQUIRE_DRM=true
PANDA_WATERMARK_TTL_SEC=28800
```

Consulte `PANDA-V10.md` para a ativação e a validação em staging. Nunca grave os valores reais em arquivos versionados.

## V10-010: integração Panda Video finalizada

A integração Panda agora segue o contrato oficial atual para autenticação, biblioteca, busca, vínculo, metadados, playback e webhook. A API Key permanece exclusivamente no backend e a resposta administrativa da biblioteca contém somente ID interno, título, thumbnail, duração e status necessários ao editor.

Principais garantias:

- paginação e filtros por título e status na Biblioteca Panda;
- timeout de 10 segundos e redirecionamentos bloqueados nas chamadas externas;
- erros da Panda traduzidos sem reproduzir respostas ou credenciais;
- vídeo convertido só fica `READY` quando possui ID externo e player HTTPS;
- vídeos com falha ou bloqueados não podem ser vinculados;
- webhook exige `PANDA_WEBHOOK_TOKEN` em todos os ambientes;
- DRM e watermark foram preparados nesta etapa e tornados obrigatórios em produção na V10-011.

Consulte `PANDA-V10.md` para o checklist de staging e produção.

## Healthchecks de produção

Os healthchecks públicos separam processo vivo de aplicação pronta para receber tráfego. As respostas nunca contêm valores de variáveis de ambiente nem mensagens internas de erro.

```bash
curl -i http://localhost:4000/health/live
curl -i http://localhost:4000/health/ready
```

`/health/live` valida somente o processo da API e deve ser usado como liveness. `/health/ready` valida PostgreSQL, Prisma, Redis, BullMQ, heartbeat do worker, storage e configurações obrigatórias.

Resposta de readiness saudável:

```json
{
  "ok": true,
  "status": "ok",
  "service": "academy-api",
  "timestamp": "2026-08-18T00:00:00.000Z",
  "uptime_seconds": 120,
  "checks": {
    "api": true,
    "postgres": true,
    "prisma": true,
    "redis": true,
    "queue": true,
    "worker": true,
    "storage": true,
    "panda_configuration": true,
    "themembers_configuration": true,
    "email_configuration": true
  }
}
```

O readiness retorna HTTP `200` quando todos os checks passam e `503` quando qualquer um falha. Cada dependência tem limite interno de dois segundos e a resposta usa `Cache-Control: no-store`. O storage local precisa estar gravável. Com S3/R2, a credencial precisa permitir a consulta do bucket. Integrações explicitamente desativadas são aceitas quando isso é válido para o ambiente; em produção, e-mail desativado reprova o check.

Os caminhos `/health` e `/api/health` continuam como aliases compatíveis de readiness. Também existem os aliases `/api/health/live` e `/api/health/ready`.

## Auditoria administrativa

O painel `/admin/audit` registra as alterações administrativas concluídas em alunos, matrículas, cursos, módulos, aulas, trilhas, vídeos e integrações.

Cada registro mantém o administrador responsável, ação, entidade, estado anterior e posterior, IP, navegador e request ID. Senhas, tokens, CPF, telefone e parâmetros de URLs assinadas são removidos antes da gravação. A consulta é exclusiva para administradores e usa resposta privada sem cache.

Ao implantar esta versão, aplique a migration antes de reiniciar a API:

```bash
npm run db:generate
npm run db:migrate:deploy
```

## V10-002: testes dos fluxos críticos

A API possui 167 cenários automatizados cobrindo autenticação, acesso, progresso, certificados, validação pública, CPF, playback, Panda, Mux, TheMembers, filas, storage, lifecycle de mídia, convites, auditoria administrativa, retenção de dados e healthchecks operacionais.

```bash
npm test
npm run test:typecheck
npm run test:api:coverage
```

Consulte `TESTING-V10.md` para a matriz completa de login, acesso, progresso, certificados, playback, Panda, TheMembers e recuperação de senha.

## V10-001: migrations versionadas

A estrutura atual do PostgreSQL está congelada na migration `20260818143115_baseline_v9`. Bancos novos usam `prisma migrate deploy`. Bancos existentes criados com `prisma db push` devem seguir o procedimento protegido em `MIGRATIONS-V10.md` antes do primeiro deploy.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Comandos operacionais:

```bash
npm run db:migrate:status
npm run db:baseline:existing
```

O segundo comando é exclusivo para um banco existente, exige backup, confirmação explícita e igualdade entre o banco e o schema. Não o execute em banco novo.

---

# Histórico — Base 8 (conta, onboarding e auditoria)

A Base 8 preserva tudo das versões V1–V7, adiciona a experiência completa de primeiro acesso/recuperação de conta e incorpora uma auditoria técnica ampla da arquitetura existente.

Documentos obrigatórios para continuar o projeto sem perder contexto:

- `PROJECT_MAP.md` — mapa mestre do que foi implementado, arquitetura, páginas, models, fluxos e próximos passos.
- `AUDIT_V8.md` — achados da auditoria, correções aplicadas, riscos residuais e bloqueadores de produção.

## Novo na V8

- convite de ativação para aluno criar a própria senha
- recuperação e redefinição de senha
- tokens temporários armazenados somente como hash e consumidos atomicamente
- perfil do aluno
- alteração de nome/foto/e-mail/senha
- `sessionVersion` para invalidação de JWTs antigos
- onboarding obrigatório para STUDENT
- aceite de termos com data e versão
- e-mail transacional via Resend
- rate limiting
- autenticação global default-deny
- validação de Origin para mutações
- Helmet na API
- fail-fast de configuração em produção
- correção de endpoint público que expunha curso DRAFT/metadados internos
- correção de webhook Mux atrasado de upload antigo
- endurecimento da conclusão de vídeo/certificado com `watchedSec`
- correção do carregamento de `.env` em npm workspaces
- seed inseguro bloqueado em produção
- validação de DTOs/URLs/limites ampliada

## Subir a V8 localmente

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Depois:

```bash
npm run dev:api
npm run dev:web
```

> A V10 substitui o antigo fluxo de protótipo por migrations versionadas. Consulte `MIGRATIONS-V10.md` para bancos existentes.

## Observação de validação

Nesta entrega, a checagem sintática/transpilação passou em 91 arquivos TS/TSX e o schema passou na validação estrutural. A tentativa de `npm install` excedeu 120 segundos neste ambiente, então `next build`, `nest build` e o Prisma Client real ainda precisam ser validados em staging/local.

---

# Histórico: Base 7 e versões anteriores

A Base 7 preserva toda a experiência, conteúdo, certificados, segurança e DRM das versões anteriores e adiciona a camada operacional necessária antes de pagamentos.

## Novo nesta versão

- Gestão completa de alunos em `/admin/students`
- Busca por nome/e-mail e filtro por status
- Criação manual de aluno com senha inicial protegida por bcrypt
- Perfil administrativo do aluno
- Bloqueio e reativação de conta
- Bloqueio passa a valer imediatamente mesmo com cookie/JWT já emitido
- Sessões de vídeo ativas são encerradas ao bloquear uma conta
- Liberação manual de cursos
- Agendamento da data de início da matrícula
- Definição e alteração da validade do acesso
- Cancelamento manual de matrícula
- Mudanças de acesso encerram sessões de reprodução do curso quando necessário
- Progresso por curso dentro do perfil administrativo
- Visualização de certificados, histórico, dispositivos e sessões
- Revogação de dispositivo pelo administrador
- Encerramento de reprodução pelo administrador
- Notificações individuais para alunos
- Central do aluno em `/notifications` com lido/não lido
- Badge de avisos no menu
- Seed demo com uma notificação inicial
- Regras de `startsAt` agora valem em Biblioteca, Trilhas, recursos, progresso e playback DRM

## Fluxo operacional sem checkout

```text
ADMIN
  ↓
Alunos
  ↓
Criar ou abrir aluno
  ↓
Liberar curso agora ou agendar início
  ↓
Definir validade opcional
  ↓
Acompanhar progresso / sessões / dispositivos
  ↓
Enviar notificação
```

### Bloqueio de conta

O `AuthGuard` revalida o usuário no banco em cada requisição autenticada. Assim, um aluno bloqueado não continua acessando a API apenas porque ainda possui um JWT não expirado.

```text
Admin bloqueia aluno
        ↓
User.status = BLOCKED
        ↓
WatchSessions ACTIVE → BLOCKED
        ↓
Próxima requisição autenticada → 403
```

### Matrícula programada

Uma matrícula só é considerada disponível quando:

```text
status = ACTIVE
AND startsAt <= agora
AND (expiresAt é nulo OR expiresAt > agora)
```

Isso é aplicado no catálogo personalizado, biblioteca, trilhas, recursos de aula, gravação de progresso e geração de tokens de playback.

### Alteração de banco

A Base 7 adiciona:

```text
User.status
User.blockedAt
User.blockedReason
User.lastLoginAt
Notification
```

Depois de atualizar o projeto:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

---


A Base 5 mantém DRM, controle de dispositivos e sessões da Base 4 e adiciona a primeira camada completa de produto estilo streaming.

## Novo nesta versão

- Home personalizada com destaque, Continue assistindo, Minha biblioteca, Minha lista, categorias e trilhas
- Dados reais do PostgreSQL no lugar dos mocks da Home e página de curso
- Minha Biblioteca com progresso por curso
- Catálogo completo de cursos publicados
- Busca por título, descrição e categoria
- Filtros por categoria
- Favoritos / Minha Lista persistidos no banco
- Trilhas de aprendizado com sequência de cursos
- Página detalhada de trilha
- Página de curso conectada ao progresso real do aluno
- Progresso considera aulas concluídas e posição parcial assistida
- Próxima aula calculada automaticamente
- Área administrativa para categorias e trilhas
- Associação de cursos a categorias sem código
- Montagem e reordenação de cursos dentro de uma trilha
- Seed opcional com aluno e conteúdo demo para validar a experiência

### Rotas novas do aluno

```text
/browse              Home personalizada
/library             Minha Biblioteca + Minha Lista
/catalog             Catálogo e busca
/paths               Trilhas
/paths/:slug         Detalhe da trilha
/course/:slug        Curso conectado aos dados reais
```

### Nova área administrativa

```text
/admin/organization
```

Nela o administrador cria categorias, associa cursos, cria trilhas, escolhe quais cursos fazem parte de cada trilha, altera a ordem e publica/oculta a trilha.

### Teste rápido com conteúdo demo

O `.env.example` contém:

```env
SEED_DEMO_CONTENT=true
STUDENT_NAME="Aluno Demo"
STUDENT_EMAIL="aluno@academy.local"
STUDENT_PASSWORD="Aluno123!"
```

Depois de configurar o banco:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Isso cria conteúdo de demonstração somente para validar visualmente Home, Biblioteca, busca, favoritos e trilhas. Antes de produção, use `SEED_DEMO_CONTENT=false` e cadastre o conteúdo real pelo admin.

---

## Base 4 preservada: DRM + controle de dispositivos e sessões

Esta versão evolui a Base 3 adicionando a camada de anti-compartilhamento de conta sobre o streaming Mux DRM.

## O que esta versão já possui

### Plataforma e conteúdo

- Next.js no frontend
- NestJS no backend
- PostgreSQL + Prisma
- Redis reservado na infraestrutura para próximos controles distribuídos/cache
- Login com cookie HTTP-only
- Perfis de usuário e papel ADMIN
- Cursos, módulos e aulas
- Progresso de aula
- Painel administrativo

### Vídeo protegido

- Direct Upload para o Mux
- Asset criado com política DRM
- Widevine / FairPlay / PlayReady conforme suporte do Mux e do dispositivo
- Playback ID DRM no banco, sem MP4 público
- Webhooks Mux assinados
- Playback JWT criado somente no backend
- DRM License JWT criado somente no backend
- Watermark dinâmica de identificação do usuário

### Anti-compartilhamento — novo na Base 4

- Limite de dispositivos autorizados por usuário
- Limite de reproduções simultâneas
- Identificador aleatório de dispositivo salvo no navegador
- Heartbeat periódico do player
- Sessão considerada abandonada após timeout sem heartbeat
- Revogação de dispositivo
- Revogação encerra as sessões daquele aparelho
- Troca de aula no mesmo dispositivo não consome outra reprodução simultânea
- Nova aba/reprodução no mesmo dispositivo substitui a sessão anterior
- Opção “Encerrar outra reprodução e continuar” quando a conta já está em uso
- Tela `/account/security` para gerenciamento de aparelhos e sessões
- Endpoint de playback com `Cache-Control: no-store`
- Lock transacional no PostgreSQL para duas tentativas simultâneas não furarem os limites

## Configuração padrão

No `.env`:

```env
MAX_DEVICES_PER_USER=2
MAX_CONCURRENT_STREAMS_PER_USER=1
WATCH_SESSION_HEARTBEAT_SEC=20
WATCH_SESSION_STALE_SEC=75
STAFF_PLAYBACK_LIMIT_BYPASS=true
```

Com isso, um aluno pode ter até 2 navegadores/aparelhos cadastrados, mas apenas 1 reprodução ativa por vez.

Administradores e instrutores ignoram os limites por padrão para facilitar testes. Para aplicar os limites também ao staff:

```env
STAFF_PLAYBACK_LIMIT_BYPASS=false
```

## Como um dispositivo é identificado

O frontend gera um UUID aleatório e salva em:

```text
localStorage: academy_device_id
```

Não é feito fingerprinting invasivo de hardware.

Consequência: se a pessoa limpar o armazenamento do navegador ou usar outro perfil/navegador, o sistema entende como outro dispositivo. Como existe limite de aparelhos, isso não libera dispositivos infinitos: o aluno precisará remover um aparelho antigo em `/account/security`.

## Fluxo para abrir uma aula

```text
POST /api/playback/lessons/:lessonId/access
        ↓
Login válido?
        ↓
Curso/aula publicados?
        ↓
Matrícula válida?
        ↓
Dispositivo conhecido?
        ↓
Há vaga entre os dispositivos autorizados?
        ↓
Limpa sessões sem heartbeat
        ↓
Há reprodução ativa em outro aparelho?
        ↓
Cria WatchSession
        ↓
Entrega playback token + DRM token
        ↓
Mux Player inicia reprodução
```

O corpo da requisição contém somente contexto do aparelho:

```json
{
  "deviceFingerprint": "uuid-gerado-pelo-navegador",
  "deviceLabel": "Chrome em Windows"
}
```

O servidor nunca aceita `userId` vindo do cliente para decidir a conta. O usuário é sempre obtido do cookie autenticado.

## Heartbeat

Durante a reprodução:

```text
Player
  ↓ a cada 20s
POST /api/playback/sessions/:sessionId/heartbeat
  ↓
Sessão continua ACTIVE?
  ↓
Dispositivo continua autorizado?
  ↓
Posição avançou de forma plausível?
  ↓
Atualiza lastSeenAt + posição + tempo creditado
```

Se a sessão for bloqueada pelo servidor, o próximo heartbeat retorna erro e o player oficial pausa/fecha a reprodução.

O frontend tolera até 3 falhas transitórias de heartbeat para uma pequena oscilação de internet não derrubar imediatamente uma aula. Erros explícitos de autorização são aplicados imediatamente.

## Timeout

Com a configuração padrão:

```env
WATCH_SESSION_HEARTBEAT_SEC=20
WATCH_SESSION_STALE_SEC=75
WATCH_PROGRESS_MAX_PLAYBACK_RATE=2
WATCH_PROGRESS_SEEK_TOLERANCE_SEC=5
```

Uma sessão que parar de enviar heartbeat por mais de 75 segundos passa a ser considerada encerrada na próxima operação de limpeza.

Isso cobre casos como:

- fechar navegador abruptamente
- cair a energia
- perder conexão
- matar o processo do browser
- página não conseguir enviar o evento de encerramento

## Segunda reprodução

Se o limite for 1 e existir reprodução ativa em outro aparelho, `/access` retorna:

```text
CONCURRENT_STREAM_LIMIT
```

O player oferece:

```text
Encerrar outra reprodução e continuar
```

Esse botão chama:

```text
POST /api/playback/lessons/:lessonId/takeover
```

O backend marca as outras WatchSessions como `BLOCKED` e cria uma nova sessão para o aparelho atual.

No próximo heartbeat, o player anterior recebe `PLAYBACK_SESSION_ENDED` e é pausado.

## Limite de dispositivos

Ao exceder o limite, o backend retorna:

```text
DEVICE_LIMIT
```

O usuário é direcionado para:

```text
/account/security
```

Ali ele pode remover um aparelho. A remoção também bloqueia qualquer reprodução ativa naquele dispositivo.

## Endpoints novos

### Player

```text
POST /api/playback/lessons/:id/access
POST /api/playback/lessons/:id/takeover
POST /api/playback/sessions/:id/heartbeat
POST /api/playback/sessions/:id/end
GET  /api/playback/sessions
```

### Segurança da conta

```text
GET    /api/security/devices
DELETE /api/security/devices/:id
GET    /api/security/playback-sessions
POST   /api/security/playback-sessions/:id/end
```

Todos exigem autenticação.

## Banco de dados

`Device` agora armazena:

```text
fingerprint
label
userAgent
lastIp
lastSeenAt
revokedAt
```

`WatchSession` armazena:

```text
userId
lessonId
deviceId
playbackNonce
status
blockReason
lastPositionSec
maxCreditedPositionSec
watchedSec
startedAt
lastSeenAt
endedAt
```

Status possíveis:

```text
ACTIVE
ENDED
BLOCKED
```

## Por que existe lock no PostgreSQL

Sem serialização, duas requisições simultâneas poderiam fazer o seguinte:

```text
Aparelho A verifica: 0 sessões
Aparelho B verifica: 0 sessões
A cria sessão
B cria sessão
```

O serviço usa `pg_advisory_xact_lock` por usuário durante a criação do dispositivo/sessão. Assim as decisões de limite daquele usuário acontecem uma por vez.

## Tokens Mux e heartbeat são proteções diferentes

O heartbeat controla a sessão **da Academy Play**.

O JWT do Mux precisa continuar válido pelo tempo suficiente para o vídeo tocar sem interrupção. Por isso o backend mantém:

```text
PLAYBACK_TOKEN_TTL_SEC=28800
```

ou aumenta automaticamente o TTL quando a duração da aula exigir.

A documentação do Mux recomenda que o token de playback expire depois da duração do vídeo, porque um token que expira durante a aula pode interromper o playback.

Isso significa que o takeover/heartbeat não deve ser tratado como revogação criptográfica instantânea de um JWT Mux já emitido. Ele encerra o player normal da aplicação no próximo heartbeat. O DRM continua impedindo que o Playback ID sozinho seja utilizado sem as credenciais necessárias.

Para um adversário que modifique o JavaScript do navegador depois de já obter tokens válidos, o token continuará respeitando sua própria expiração. Isso é uma limitação arquitetural que deve ser considerada no modelo de ameaça.

## Proteção real alcançada nesta etapa

Esta base agora dificulta fortemente:

- compartilhar senha entre várias pessoas
- assistir simultaneamente usando a mesma conta
- acumular aparelhos sem controle
- continuar no player oficial depois que um dispositivo foi revogado
- acessar um Playback ID DRM sem autorização da aplicação
- baixar um MP4 público, porque ele não existe na arquitetura

Ela não promete impossibilidade matemática de cópia. Alguém ainda pode filmar uma tela fisicamente, e um usuário tecnicamente sofisticado pode tentar manipular o navegador. DRM + watermark + controle de conta formam camadas complementares.

## Atualizar uma Base 3 existente

Depois de substituir os arquivos:

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
```

Na V10, o banco é gerenciado por migrations versionadas. Faça backup antes de qualquer deploy e use o procedimento de baseline quando o banco veio de uma versão antiga.

## Subir localmente

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Terminal da API:

```bash
npm run dev:api
```

Terminal do frontend:

```bash
npm run dev:web
```

## Proxy reverso e IP

Por padrão:

```env
TRUST_PROXY=false
```

Só habilite:

```env
TRUST_PROXY=true
```

quando a API estiver realmente atrás de um proxy reverso confiável. O IP é registrado para auditoria futura, mas não é usado nesta versão como chave de dispositivo nem como bloqueio principal, evitando falsos positivos em redes móveis e CGNAT.

## Validação executada nesta entrega

Foi executada validação sintática/transpilação TypeScript sobre todos os arquivos `.ts` e `.tsx` da aplicação.

A instalação completa das dependências (`npm install`) não terminou dentro do limite do ambiente desta sessão. Portanto o build integrado com dependências externas deve ser executado no ambiente de desenvolvimento/deploy antes de produção.

## Próxima etapa recomendada

A fundação de streaming e proteção já está forte o suficiente para avançar para a camada comercial:

1. gestão de alunos no admin
2. criação/edição/bloqueio de alunos
3. matrícula manual em cursos
4. produtos e planos
5. regras de acesso por assinatura/produto
6. webhook do checkout
7. expiração automática de matrícula por inadimplência/cancelamento
8. histórico/auditoria de acessos

Depois disso, trilhas, certificados, gamificação e IA podem ser adicionados sobre uma base comercial funcional.


## V6 · Conteúdo, histórico e certificados

Esta versão adiciona a camada de conteúdo e retenção antes de pagamentos:

- capítulos de vídeo com navegação por timestamp;
- materiais complementares por URL (PDF, checklist, planilha, prompt, link ou arquivo);
- transcrição completa por aula, com idioma e busca no player;
- histórico de aulas assistidas;
- retomada do ponto salvo no player;
- conclusão monotônica: uma aula concluída não volta para incompleta ao ser revista;
- certificados automáticos quando 100% das aulas publicadas do curso forem concluídas;
- página de certificados do aluno;
- certificado imprimível/salvável em PDF pelo navegador;
- configuração por curso para habilitar/desabilitar certificado e definir seu título;
- tela administrativa dedicada para editar conteúdo de cada aula.

### Rotas novas

Aluno:

- `/history`
- `/account`
- `/account/certificates`
- `/certificate/[code]`

Público:

- `/verify-certificate`
- `/verify-certificate/[code]`

Admin:

- `/admin/lessons/[id]`

API:

- `GET /api/experience/lessons/:lessonId/resources`
- `GET /api/experience/history`
- `GET /api/experience/certificates`
- `GET /api/experience/certificates/:code`
- `GET /api/certificates/verify/:code`
- `GET /api/admin/lessons/:id/content`
- `PUT /api/admin/lessons/:id/content`

### Atualização do banco

Depois de atualizar para esta versão:

```bash
npm run db:generate
npm run db:migrate:deploy
```

Em ambiente de desenvolvimento, `npm run db:seed` também adiciona capítulos, materiais e transcrição de exemplo a uma aula demo.

### Materiais

Nesta etapa o admin cadastra materiais por URL. Isso permite usar imediatamente links externos e já é compatível com URLs futuras de Cloudflare R2 ou Amazon S3. O upload privado de arquivos pode ser adicionado como próxima camada sem alterar os modelos principais.


## Integrações V9

A versão V9 adiciona Panda Video como provider padrão de streaming e TheMembers como origem comercial de produtos/acessos. A Academy continua sendo a fonte de verdade de cursos, progresso, certificados, dispositivos e matrículas efetivas. Leia `INTEGRATIONS-V9.md` antes de ativar qualquer webhook comercial.

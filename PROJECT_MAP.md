# Academy Play — Mapa Mestre do Projeto

Atualizado em: 18/08/2026
Versão atual: V10-020
Status geral: estabilização de produção em andamento, ainda não liberado para produção

## 1. Objetivo do produto

Plataforma própria de cursos com experiência de streaming, inspirada em serviços como Netflix, com:

- catálogo e biblioteca personalizados
- cursos, módulos, aulas e trilhas
- streaming de vídeo com Panda DRM e fallback Mux DRM
- proteção de conta, dispositivos e sessões
- progresso, histórico, materiais, transcrição e certificados
- operação administrativa completa de alunos e acessos
- fundação preparada para pagamentos e IA em etapas posteriores

A arquitetura não entrega MP4 público nem URL permanente de vídeo.

## 2. Arquitetura atual

```text
NAVEGADOR
  |
  +-- Next.js / React
  |     +-- Área do aluno
  |     +-- Player Panda DRM / Mux DRM
  |     +-- Área administrativa
  |
  +-- NestJS API
        +-- Auth / conta
        +-- Cursos / experiência
        +-- Admin
        +-- Progresso
        +-- Playback / dispositivos
        +-- Panda / Mux / webhooks
        |
        +-- Prisma
              |
              +-- PostgreSQL

PANDA
  +-- Biblioteca e player incorporado
  +-- JWT DRM/Watermark por aluno
  +-- Webhook de status

MUX (fallback)
  +-- Direct Upload
  +-- Transcodificação
  +-- DRM
  +-- Playback token assinado
  +-- DRM license token
  +-- Webhooks

Redis
  +-- provisionado no Docker
  +-- ainda NÃO utilizado pela aplicação
```

### Stack

- Frontend: Next.js 16 + React 19
- Backend: NestJS 11
- ORM: Prisma 7
- Banco: PostgreSQL 17 no ambiente Docker local
- Redis: Redis 7 provisionado, ainda sem uso
- Vídeo: Panda Video + DRM, com Mux DRM preservado como fallback
- Sessão web: JWT em cookie HTTP-only
- E-mail transacional V8: adaptador Resend

## 3. Evolução por versão

### V1 — Fundação

Implementado:

- monorepo com web + API
- Next.js
- NestJS
- PostgreSQL
- Redis provisionado
- Prisma
- Home inicial estilo streaming
- estrutura User → Course → Module → Lesson
- modelos iniciais de matrícula, progresso, dispositivo e sessão

### V2 — Autenticação e administração

Implementado:

- login real
- bcrypt para senha
- JWT em cookie HTTP-only
- roles STUDENT / INSTRUCTOR / ADMIN
- painel administrativo
- CRUD de cursos
- CRUD de módulos
- CRUD de aulas
- publicação e despublicação
- ordenação de módulos e aulas

### V3 — Vídeo protegido

Implementado:

- upload direto navegador → Mux
- backend gera Direct Upload temporário
- DRM configurável no Mux
- playback token
- DRM license token
- webhook Mux com assinatura HMAC
- status UPLOADING / PROCESSING / READY / ERROR
- player Mux protegido
- watermark dinâmica
- progresso de aula

### V4 — Anti-compartilhamento

Implementado:

- limite configurável de dispositivos
- limite configurável de reproduções simultâneas
- UUID local do dispositivo
- heartbeat do player
- expiração de sessão sem heartbeat
- takeover de reprodução
- revogação de dispositivo
- tela Segurança e Dispositivos
- PostgreSQL advisory lock por usuário para evitar corrida de simultaneidade

### V5 — Experiência do aluno

Implementado:

- Home personalizada
- Continue assistindo
- Minha Biblioteca
- Minha Lista / Favoritos
- Catálogo
- Busca
- Categorias
- Trilhas
- progresso visual
- páginas consumindo PostgreSQL real em vez de mocks
- administração de categorias e trilhas

### V6 — Conteúdo e conclusão

Implementado:

- capítulos com timestamp
- materiais complementares
- transcrição
- busca textual na transcrição
- retomada automática
- histórico
- certificados automáticos
- código único de certificado
- impressão/salvar como PDF pelo navegador
- editor administrativo de conteúdo da aula

### V7 — Operação de alunos

Implementado:

- lista de alunos
- busca, filtro e paginação
- criação manual
- ficha administrativa do aluno
- bloqueio/reativação
- matrículas manuais
- início programado
- validade/expiração
- cancelamento de acesso
- visualização de progresso
- certificados
- dispositivos
- sessões
- notificações internas
- encerramento de reprodução pelo admin

### V8 — Conta, onboarding e hardening

Implementado:

#### Conta do aluno

- convite de ativação com token de uso único
- aluno cria a própria senha
- recuperação de senha
- reset de senha
- tela de perfil
- alteração de nome e foto
- alteração de e-mail mediante senha atual
- alteração de senha mediante senha atual
- invalidação das sessões JWT antigas usando `sessionVersion`
- primeiro acesso / onboarding
- aceite de termos com data e versão
- URLs configuráveis de Termos e Privacidade

#### Operação

- admin pode criar aluno sem senha
- geração de link de convite
- envio de convite por e-mail quando o provider estiver configurado
- regenerar convite pela ficha do aluno
- novo convite invalida o anterior

#### Segurança adicionada na auditoria

- autenticação default-deny no backend
- somente rotas explicitamente `Public` ficam abertas
- rate limit global e limites menores em login/recuperação
- proteção por Origin em POST/PUT/PATCH/DELETE
- Helmet na API
- body JSON limitado a 5 MB
- DTOs mais restritivos
- URLs de imagens/materiais validadas para HTTP/HTTPS
- bloqueio de links internos `//host` em notificações
- segredos/configuração críticos validados no boot de produção
- configuração `.env` da raiz carregada explicitamente pelos dois workspaces
- token de convite/reset armazenado somente como hash SHA-256
- consumo atômico de token de uso único
- seed demo proibido em produção
- senha padrão de admin proibida em produção
- onboarding obrigatório no backend para estudantes ainda não ativados

#### Vídeo/progresso corrigidos na auditoria

- webhook antigo de upload não pode sobrescrever o vídeo atual da aula
- endpoint público de curso não expõe rascunho ou campos internos do Mux
- `INSTRUCTOR` tratado de forma consistente em playback, progresso e recursos
- conclusão de vídeo deixou de confiar diretamente em `completed=true` do navegador
- heartbeat acumula `watchedSec` com tempo medido no servidor
- conclusão de vídeo exige posição mínima e tempo real acumulado compatível com reprodução até 2x
- certificado só é avaliado após conclusão aceita pelo servidor
- JWT Mux recebe `custom.session_id` para rastreabilidade

### V10-001 a V10-003 — Estabilização inicial

Implementado:

- baseline Prisma versionado e fluxo oficial com `prisma migrate deploy`
- procedimento protegido para registrar o baseline em bancos existentes
- 47 testes automatizados, incluindo os 16 fluxos críticos e 11 cenários de healthcheck
- piso automático de 50% para linhas, branches e funções na cobertura da API
- `GET /health` público com HTTP 200/503, alias `/api/health` e `Cache-Control: no-store`
- checks independentes de API, PostgreSQL e Prisma
- validação segura das configurações Panda, TheMembers e Resend
- limite de dois segundos por consulta de banco no healthcheck
- resposta operacional sem valores secretos ou mensagens internas

### V10-010 — Panda Video finalizado em código

Implementado:

- API Key Panda usada apenas no backend, via header `Authorization` sem `Bearer`
- timeout de 10 segundos e bloqueio de redirecionamentos externos
- biblioteca paginada, busca por título e filtro pelos status oficiais
- resposta administrativa reduzida a metadados necessários
- vínculo de aula com thumbnail, duração e status normalizados
- vídeos bloqueados ou com falha impedidos de vinculação
- player HTTPS obrigatório e liberação somente com ID externo válido
- webhook protegido por token em todos os ambientes
- atualização por webhook com fallback seguro de status
- DRM/watermark validado por testes, ainda sem ativação obrigatória
- 64 testes automatizados no total

### V10-011 — DRM e watermark Panda obrigatórios

Implementado:

- `PANDA_REQUIRE_DRM=true` obrigatório para Panda em produção
- inicialização bloqueada sem Group ID e secret completos
- validação do Group ID como UUID
- JWT `HS256` criado somente no backend
- nome, e-mail e ID completo do aluno nos três campos da watermark
- caracteres de controle removidos antes da assinatura
- token anexado somente a hosts e caminho oficiais do player Panda
- resposta de playback sem Group ID separado, API Key ou secret
- healthcheck reprova DRM desativado, incompleto ou inválido
- painel de integrações diferencia estado protegido e pendência DRM
- 69 testes automatizados no total

### V10-012 — painel de diagnóstico Panda

Implementado:

- diagnóstico responsivo dentro de `Admin -> Integrações -> Panda`
- conexão real com a API Panda sem expor resposta externa ou credenciais
- estado de DRM e webhook calculado somente no backend
- contadores de vídeos Panda vinculados, processando e com erro
- assets sem aula ignorados para preservar o significado operacional
- endpoint administrativo protegido e sem cache
- botão `Testar conexão` atualiza os seis indicadores
- falha externa diferenciada de indisponibilidade do banco
- 75 testes automatizados no total

### V10-013 — comunicação visual Panda

Implementado:

- editor de cursos orientado à Biblioteca Panda
- explicação de segurança atualizada para DRM/Watermark e autorização por sessão
- referências fixas a upload direto, asset ID e playback ID do Mux removidas da interface principal
- API Key, URLs privadas e MP4 público explicitamente tratados como não expostos
- uploader, player, rotas, provider e webhooks Mux preservados como fallback técnico
- teste comportamental confirma Direct Upload Mux quando `VIDEO_PROVIDER=mux`
- 77 testes automatizados no total

### V10-020 — validação ponta a ponta TheMembers

Implementado:

- payload oficial `release.access` passando pelo controller e token `x-signature`
- criação de aluno, cliente externo e assinatura
- grants específicos por produto e curso
- matrícula efetiva e curso disponível na biblioteca
- `revoke.access` cancelando somente o produto correspondente
- curso compartilhado preservado quando outro grant continua ativo
- matrícula manual preservada como origem soberana
- sessões bloqueadas somente quando o acesso efetivo desaparece
- reentrega idempotente sem duplicar registros
- script de webhook sintético alinhado ao contrato oficial
- 81 testes automatizados no total

## 4. Páginas atuais

### Públicas / acesso

- `/`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/invite`

### Primeiro acesso

- `/onboarding`

### Aluno

- `/browse`
- `/catalog`
- `/library`
- `/paths`
- `/paths/[slug]`
- `/course/[slug]`
- `/watch/[lessonId]`
- `/history`
- `/notifications`
- `/account`
- `/account/profile`
- `/account/security`
- `/account/certificates`
- `/certificate/[code]`

### Administração

- `/admin`
- `/admin/courses`
- `/admin/courses/[id]`
- `/admin/lessons/[id]`
- `/admin/organization`
- `/admin/students`
- `/admin/students/[id]`

## 5. Models atuais do banco

18 models Prisma:

1. User
2. Course
3. CourseModule
4. Lesson
5. Enrollment
6. LessonProgress
7. Favorite
8. Category
9. LearningPath
10. LearningPathCourse
11. LessonChapter
12. LessonMaterial
13. LessonTranscript
14. Certificate
15. AccountToken
16. Notification
17. Device
18. WatchSession

Enums atuais: 9.

## 6. Fluxos críticos atuais

### Login

```text
E-mail + senha
  → rate limit
  → bcrypt
  → status da conta
  → JWT com sessionVersion
  → cookie HTTP-only
  → onboarding ou aplicação
```

### Convite

```text
Admin cria aluno sem senha
  → token aleatório
  → banco salva apenas hash
  → link de convite
  → aluno cria senha
  → token consumido atomicamente
  → sessão criada
  → onboarding
```

### Recuperação

```text
Esqueci minha senha
  → resposta genérica
  → token temporário
  → e-mail
  → nova senha
  → sessionVersion incrementa
  → sessões de playback encerradas
```

### Playback

```text
Aluno abre aula
  → autenticação
  → onboarding concluído
  → curso/aula publicados
  → matrícula ativa ou preview/staff
  → dispositivo
  → simultaneidade
  → WatchSession
  → playback token + DRM token
  → Mux Player
  → heartbeat
```

### Conclusão

```text
Player envia posição
  → servidor limita posição
  → posição >= 92%
  → tempo real acumulado >= 45% da duração
  → aula pode ser concluída
  → todas as aulas publicadas concluídas?
  → certificado
```

O limite de 45% foi escolhido para continuar compatível com reprodução em até 2x e, ao mesmo tempo, impedir conclusão instantânea via chamada simples à API.

## 7. O que está deliberadamente fora do escopo até agora

- checkout
- pagamentos
- assinaturas
- cupons
- integração Hotmart/Stripe/Mercado Pago
- IA conversacional sobre as aulas
- embeddings/busca semântica
- apps iOS/Android nativos
- download offline
- upload privado de PDFs/planilhas para R2/S3
- comunidade/comentários

## 8. Pendências antes de produção

### Bloqueadores

- validar o baseline V10-001 em uma cópia restaurada do banco real antes do primeiro deploy de produção
- ampliar a suíte à medida que novos fluxos forem adicionados; 81 cenários já estão automatizados
- validar `GET /health` em staging com PostgreSQL e segredos reais de produção
- validar a V10-010 até a V10-013 com conta Panda real, pasta dedicada, grupo DRM, player, webhook HTTPS, contadores do diagnóstico e editor administrativo
- validar a V10-020 com compra e cancelamento reais no Checkout TheMembers
- testes E2E no Mux com uma conta DRM real
- testar webhook real e substituição de vídeo
- configurar domínio HTTPS real
- configurar Resend e domínio de envio
- configurar URLs reais de Termos e Política de Privacidade
- configurar segredos de produção

### Alta prioridade

- trilha de auditoria administrativa (quem alterou acesso, curso, aluno, dispositivo etc.)
- MFA/2FA para administradores
- logs estruturados e monitoramento de erros
- backup e teste de restauração do PostgreSQL
- verificação de novo e-mail antes de efetivar alteração de endereço
- política de retenção/exclusão de dados de IP, dispositivos e sessões

### Escala

- Redis está provisionado mas não é usado
- rate limiting atual usa memória do processo; antes de múltiplas réplicas, migrar storage do throttle para Redis
- adicionar fila de e-mails/webhooks para retries
- CDN/storage privado para materiais complementares

## 9. Limitações de segurança que permanecem por arquitetura

- nenhum DRM impede alguém de filmar a tela fisicamente
- heartbeat encerra o player oficial, porém um JWT Mux já emitido permanece criptograficamente válido até sua expiração
- o token de watermark Panda permanece válido até sua expiração; heartbeat e encerramento de sessão não revogam criptograficamente um token já emitido
- `custom.session_id` melhora rastreabilidade, mas não transforma a WatchSession em revogação instantânea dentro da infraestrutura do Mux
- dispositivo é identificado por UUID local, não por fingerprint invasiva; apagar o storage faz o navegador parecer um novo dispositivo
- certificado é mais resistente a fraude após a V8, mas não deve ser tratado como certificação de identidade/prova remota sem mecanismos adicionais de proctoring

## 10. Próxima etapa recomendada

Após validar a V10-020 com uma compra e um cancelamento reais em staging, a sequência do plano mestre deve continuar em `V10-021`, criando o dashboard da integração TheMembers. O baseline V10-001, os E2E externos, o healthcheck, a integração Panda, a watermark DRM e o diagnóstico ainda precisam ser exercitados em staging com infraestrutura e credenciais reais antes da liberação.

---

# V9 — Arquitetura de integrações Panda + TheMembers

## Implementado

- abstração de vídeo via `VideoAsset` / `VideoProvider`;
- Panda como provedor principal e Mux mantido como fallback;
- biblioteca Panda consultada somente pelo backend;
- associação de vídeo Panda a aulas sem expor API key no browser;
- player Panda dentro do `SecurePlayer` com heartbeat/sessão Academy;
- DRM Watermark JWT individual por aluno;
- webhook Panda de mudança de status protegido por token aleatório na URL;
- tabelas externas para produtos/clientes/assinaturas/eventos/logs;
- sincronização de produtos TheMembers;
- mapeamento Produto TheMembers -> Curso(s) Academy;
- webhook Checkout TheMembers com `x-signature`;
- suporte aos eventos oficiais `release.access` e `revoke.access`;
- idempotência persistente dos webhooks;
- automação de matrícula desligada por padrão e ativada por configuração;
- página `Admin -> Integrações` para testar conexões, sincronizar produtos, mapear cursos e auditar eventos.

## Deliberadamente não implementado nesta fase

- upload de arquivos do browser diretamente ao Panda usando a API key completa;
- deleção remota de vídeos Panda ao desvincular uma aula;
- alteração automática da configuração do DRM group no Panda;
- uso da TheMembers como fonte de conteúdo/progresso;
- checkout dentro da Academy.

Essas decisões reduzem o raio de impacto de credenciais e evitam duplicar fontes de verdade.

## V9 — Integrações Panda Video + TheMembers

Status: **implementada para validação/staging; ainda não aprovada para produção**.

### Vídeo
- `Lesson -> VideoAsset -> VideoProvider` desacopla aula do fornecedor.
- Panda é o provider padrão; Mux permanece fallback.
- Biblioteca Panda é consultada somente pelo backend e o admin vincula um vídeo existente à aula.
- API key Panda não é exposta ao navegador.
- Player Panda funciona dentro do player seguro da Academy e continua sujeito a matrícula, dispositivo, sessão simultânea e heartbeat da Academy.
- DRM Watermark Panda é assinado no backend quando `PANDA_DRM_GROUP_ID` e `PANDA_DRM_GROUP_SECRET` estão configurados.
- Webhook Panda atualiza status do `VideoAsset` vinculado.

### Comercial / TheMembers
- Produtos externos são sincronizados em `ExternalProduct`.
- `ProductCourse` mapeia um produto para um ou mais cursos Academy.
- `ExternalAccessGrant` registra o direito de acesso por produto e por curso.
- `Enrollment` continua sendo o acesso efetivo consumido pelo restante da Academy.
- Múltiplos produtos podem liberar o mesmo curso sem risco de um cancelamento remover o direito do outro.
- Matrículas manuais ativas são preservadas.
- Checkout usa `release.access` e `revoke.access`.
- Automação fica desligada por padrão até validação de produto, payload e webhook.
- `WebhookEvent` fornece idempotência persistente; claim usa lock transacional.
- `IntegrationLog` registra ações e falhas da integração.

### Operação
- Nova tela `/admin/integrations` para testar Panda/TheMembers, sincronizar produtos, mapear cursos e revisar webhooks.
- O mesmo `docker-compose.yml` continua sendo a referência de produção Ubuntu.
- Em Bazzite, scripts usam Podman Compose apenas como runtime local compatível.

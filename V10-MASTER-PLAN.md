# ACADEMY PLAY V10

## Plano Mestre de Evolução da Plataforma

### INSTRUÇÃO PARA A IA

Você está trabalhando na plataforma **Academy Play**, uma plataforma própria de cursos e vídeos.

Antes de realizar qualquer alteração:

1. Leia a estrutura atual do projeto.
2. Não reescreva funcionalidades que já funcionam.
3. Não altere arquitetura, banco ou componentes sem necessidade.
4. Preserve compatibilidade com dados existentes.
5. Não remova funcionalidades existentes.
6. Não crie funcionalidades duplicadas.
7. Antes de implementar uma tarefa, identifique os arquivos afetados.
8. Após implementar, execute TypeScript, lint, build e testes aplicáveis.
9. Caso uma migration de banco seja necessária, crie migration versionada.
10. Nunca utilizar `prisma db push` como estratégia de produção.
11. Não colocar API Keys ou secrets no frontend.
12. Não expor URLs privadas de vídeo.
13. Toda alteração deve funcionar em desktop e mobile.
14. Sempre informar ao final:
15. Arquivos alterados
16. Funcionalidades implementadas
17. Alterações no banco
18. Variáveis de ambiente necessárias
19. Comandos necessários no servidor
20. Testes realizados
21. Pontos que ainda precisam de validação

---

# 1. ARQUITETURA ATUAL

```
project:
  name: Academy Play
  version_target: V10

frontend:
  framework: Next.js
  version: 16
  react: 19

backend:
  framework: NestJS
  version: 11

database:
  engine: PostgreSQL
  orm: Prisma

authentication:
  strategy: JWT
  storage: HTTP-only cookie

video:
  primary_provider: Panda Video
  fallback_provider: Mux

commerce:
  provider: TheMembers

email:
  provider: Resend

current_features:
  authentication: true
  onboarding: true
  courses: true
  modules: true
  lessons: true
  progress: true
  certificates: true
  favorites: true
  learning_paths: true
  history: true
  notifications: true
  devices: true
  concurrent_stream_control: true
  panda_integration: partial
  mux_integration: true
  themembers_integration: partial

```

---

# 2. PRINCÍPIO DA V10

A Academy Play deve evoluir sem reconstruir a plataforma.

O objetivo da V10 é transformar a base atual em uma plataforma:

```
ESTÁVEL
+
SEGURA
+
FÁCIL DE ADMINISTRAR
+
BOA PARA O ALUNO
+
INTEGRADA
+
PREPARADA PARA IA
+
MENSURÁVEL

```

---

# 3. PRIORIDADES

Utilizar estes níveis:

```
P0: crítico para produção
P1: importante para operação
P2: melhora relevante de produto
P3: inovação e diferenciação

```

---

# FASE 1

# ESTABILIZAÇÃO E PRODUÇÃO

## TASK V10-001

### Criar migrations Prisma versionadas

```
priority: P0
status: COMPLETED_IN_CODE
area: database

```

### Problema atual

O projeto ainda depende de `prisma db push`.

### Objetivo

Passar a utilizar migrations versionadas em produção.

### Implementar

1. Auditar o schema Prisma atual.
2. Confirmar estrutura existente do banco.
3. Criar baseline da estrutura atual.
4. Configurar `prisma migrate deploy`.
5. Documentar procedimento para VPS.
6. Nunca apagar dados existentes.

### Critério de aceite

```
acceptance:
  migration_folder_exists: true
  migrate_deploy_works: true
  existing_data_preserved: true
  db_push_not_required_in_production: true

```

### Implementação

```yaml
release: RELEASE-V10-001.md
migration: 20260818143115_baseline_v9
production_validation: required_on_restored_database_copy
```

---

## TASK V10-002

### Criar suíte mínima de testes

```
priority: P0
status: COMPLETED_IN_CODE
area: backend

```

Criar testes para:

1. Login
2. Logout
3. Usuário bloqueado
4. Matrícula
5. Matrícula expirada
6. Curso sem acesso
7. Progresso
8. Conclusão de aula
9. Certificado
10. Device limit
11. Stream limit
12. Takeover
13. Panda playback
14. TheMembers webhook
15. Webhook duplicado
16. Recuperação de senha

### Critério de aceite

Todas as funções críticas devem possuir pelo menos testes de fluxo positivo e negativo.

### Implementação

```yaml
release: RELEASE-V10-002.md
test_scenarios: 36
critical_flows_covered: 16_of_16
external_staging_validation: required_before_production
```

---

## TASK V10-003

### Criar healthcheck completo

```
priority: P0
status: COMPLETED_IN_CODE
area: infrastructure

```

Criar endpoint:

```
GET /health

```

Validar:

```
checks:
  api: true
  postgres: true
  prisma: true
  panda_configuration: true
  themembers_configuration: true
  email_configuration: true

```

Não revelar secrets.

### Implementação

```yaml
release: RELEASE-V10-003.md
public_route: GET /health
compatibility_alias: GET /api/health
checks: 6
http_healthy: 200
http_unhealthy: 503
new_test_scenarios: 11
external_staging_validation: required_before_production
```

---

## TASK V10-004

### Criar sistema de auditoria administrativa

```
priority: P1
area: security

```

Registrar ações importantes realizadas por ADMIN.

Exemplos:

```
ADMIN_LOGIN
USER_CREATED
USER_BLOCKED
USER_UNBLOCKED
ENROLLMENT_CREATED
ENROLLMENT_REMOVED
DEVICE_REVOKED
WATCH_SESSION_TERMINATED
COURSE_CREATED
COURSE_UPDATED
COURSE_PUBLISHED
COURSE_UNPUBLISHED
LESSON_UPDATED
VIDEO_CHANGED
THEMEMBERS_MAPPING_CHANGED

```

Registrar:

```
audit_log:
  admin_user_id:
  action:
  target_type:
  target_id:
  metadata:
  ip_address:
  user_agent:
  created_at:

```

---

# FASE 2

# PANDA VIDEO E INTEGRAÇÕES

## TASK V10-010

### Finalizar configuração Panda Video

```
priority: P0
status: COMPLETED_IN_CODE
area: video

```

### Validar

1. API Key
2. Biblioteca Panda
3. Busca de vídeos
4. Vinculação de vídeo
5. Thumbnail
6. Duração
7. Status
8. Playback
9. Webhook
10. DRM
11. Watermark

### Regras

A API Key Panda jamais deve chegar ao navegador.

### Implementação

```yaml
release: RELEASE-V10-010.md
documentation: PANDA-V10.md
new_test_scenarios: 17
api_key_backend_only: true
library_pagination_and_filters: true
safe_metadata_response: true
webhook_fail_closed: true
drm_activation: reserved_for_V10-011
external_staging_validation: required_before_production
```

---

## TASK V10-011

### Ativar DRM Panda

```
priority: P1
status: COMPLETED_IN_CODE
area: video_security

```

Utilizar:

```
PANDA_DRM_GROUP_ID
PANDA_DRM_GROUP_SECRET
PANDA_REQUIRE_DRM=true

```

Watermark deve poder conter:

```
Nome
E-mail
ID do aluno

```

### Implementação

```yaml
release: RELEASE-V10-011.md
documentation: PANDA-V10.md
new_test_scenarios: 5
production_fail_closed: true
drm_flag_required_in_production: true
drm_group_uuid_validated: true
jwt_algorithm: HS256
watermark_fields:
  - name
  - email
  - full_student_id
official_player_hosts_only: true
secrets_backend_only: true
external_staging_validation: required_before_production
```

---

## TASK V10-012

### Criar painel de diagnóstico Panda

```
priority: P1
status: COMPLETED_IN_CODE
area: admin_integrations

```

Adicionar dentro de:

```
Admin
→ Integrações
→ Panda

```

Mostrar:

```
panda:
  connected:
  drm_enabled:
  webhook_configured:
  videos_linked:
  processing_videos:
  error_videos:

```

Adicionar botão:

```
Testar conexão

```

### Implementação

```yaml
release: RELEASE-V10-012.md
documentation: PANDA-V10.md
new_test_scenarios: 6
admin_route: /admin/integrations
diagnostics_endpoint: GET /api/admin/integrations/panda/diagnostics
live_connection_test: true
linked_video_counts_from_database: true
orphan_video_assets_ignored: true
processing_statuses:
  - UPLOADING
  - PROCESSING
secret_safe_response: true
private_no_store: true
responsive_panel: true
database_change: false
external_staging_validation: required_before_production
```

---

## TASK V10-013

### Remover referências visuais antigas ao Mux

```
priority: P1
status: COMPLETED_IN_CODE
area: admin_content

```

Buscar textos antigos como:

```
Envie seus vídeos pelo Mux
Upload Mux
Vídeo protegido pelo Mux

```

Atualizar para Panda.

Não remover o suporte Mux do backend.

Mux permanece como fallback técnico.

### Implementação

```yaml
release: RELEASE-V10-013.md
new_test_scenarios: 2
admin_route: /admin/courses/:id
visual_provider: Panda Video
admin_flow:
  - Biblioteca Panda
  - DRM/Watermark
  - autorização por sessão
legacy_mux_copy_removed: true
mux_backend_fallback_preserved: true
mux_frontend_fallback_preserved: true
database_change: false
environment_change: false
```

---

# FASE 3

# THEMEMBERS E ACESSOS

## TASK V10-020

### Validar integração TheMembers de ponta a ponta

```
priority: P0
status: COMPLETED_IN_CODE
area: integration

```

Testar cenário real:

```
Compra
→ webhook
→ cliente
→ produto
→ grant
→ enrollment
→ curso disponível

```

Depois testar:

```
Cancelamento
→ revoke
→ grants restantes
→ recalcular enrollment

```

### Implementação

```yaml
release: RELEASE-V10-020.md
documentation: THEMEMBERS-V10.md
new_test_scenarios: 4
official_checkout_payload: true
checkout_signature_entrypoint: true
purchase_chain_validated:
  - webhook_event
  - user
  - external_customer
  - external_subscription
  - access_grant
  - enrollment
  - student_library
revocation_chain_validated:
  - product_specific_grants
  - remaining_product_grants
  - manual_enrollment_precedence
  - selective_session_blocking
idempotency_validated: true
database_change: false
environment_change: false
external_staging_validation: blocked_missing_credentials
```

---

## TASK V10-021

### Criar dashboard da integração TheMembers

Exibir:

```
integration:
  status:
  last_webhook:
  events_today:
  successful_events:
  failed_events:
  products:
  mapped_products:
  unmapped_products:

```

---

## TASK V10-022

### Criar sistema de reprocessamento de webhook

Em Integration Logs:

Adicionar:

```
Reprocessar

```

Somente ADMIN.

Registrar auditoria da ação.

---

## TASK V10-023

### Criar alerta de produto sem mapeamento

Quando chegar uma venda de um produto TheMembers sem curso vinculado:

Não ignorar silenciosamente.

Criar alerta administrativo:

```
Produto comprado sem curso configurado.

```

Mostrar:

```
Produto
Cliente
Data
Evento

```

---

# FASE 4

# PAINEL ADMINISTRATIVO

## TASK V10-030

### Melhorar dashboard administrativo

Adicionar:

```
dashboard:
  total_students:
  active_students:
  blocked_students:
  total_courses:
  published_courses:
  active_enrollments:
  expiring_enrollments:
  lessons_watched_today:
  active_watch_sessions:
  certificates_issued:

```

---

## TASK V10-031

### Melhorar editor de aula

Criar organização:

```
Informações
Vídeo
Conteúdo
Capítulos
Materiais
Transcrição
Configurações

```

---

## TASK V10-032

### Expor configurações que existem no banco

Adicionar na interface administrativa:

### Tipo de aula

```
Vídeo
Texto
Live

```

### Preview

```
Permitir assistir sem matrícula

```

### Status de curso

```
Rascunho
Publicado
Arquivado

```

---

## TASK V10-033

### Criar aula textual

Quando:

```
LessonType = TEXT

```

permitir editor de conteúdo.

Inicialmente pode utilizar Markdown ou rich text seguro.

---

## TASK V10-034

### Criar aula Live

Quando:

```
LessonType = LIVE

```

permitir:

```
live_lesson:
  title:
  description:
  date:
  start_time:
  end_time:
  meeting_url:
  platform:

```

Plataformas:

```
Google Meet
Zoom
YouTube
Outro

```

---

## TASK V10-035

### Melhorar gestão do aluno

Adicionar filtros:

```
Ativo
Bloqueado
Sem matrícula
Matrícula ativa
Matrícula vencida
Novo aluno
Aluno ativo recentemente
Aluno inativo

```

---

## TASK V10-036

### Criar visão 360º do aluno

Dentro do aluno mostrar uma timeline:

```
Conta criada
Primeiro login
Curso liberado
Aula iniciada
Aula concluída
Certificado emitido
Dispositivo registrado
Senha alterada
Acesso removido

```

---

# FASE 5

# EXPERIÊNCIA DO ALUNO

## TASK V10-040

### Melhorar Home

A Home deve priorizar:

```
1. Continue assistindo
2. Meus cursos
3. Próxima aula
4. Trilhas
5. Novidades
6. Recomendados

```

---

## TASK V10-041

### Criar página Meu Aprendizado

Criar:

```
/learning

```

Mostrar:

```
learning:
  enrolled_courses:
  courses_in_progress:
  completed_courses:
  completed_lessons:
  watch_time:
  certificates:

```

---

## TASK V10-042

### Certificado público verificável

Criar rota pública:

```
/verify/[certificateCode]

```

Não exigir login.

Mostrar apenas:

```
Certificado válido
Aluno
Curso
Data de emissão
Código

```

Não revelar informações sensíveis extras.

---

## TASK V10-043

### Storage próprio de materiais

Implementar armazenamento utilizando:

```
Cloudflare R2

```

ou alternativa compatível com S3.

Permitir:

```
PDF
Planilha
Documento
Imagem
ZIP

```

Criar upload dentro da aula.

---

# FASE 6

# INTELIGÊNCIA ARTIFICIAL

Essa fase é estratégica e não deve ser implementada antes da estabilização das fases anteriores.

---

## TASK V10-050

### Transcrição automática

Ao vincular vídeo:

```
Vídeo
↓
transcrição
↓
salvar LessonTranscript

```

Permitir:

```
Gerar novamente
Editar
Salvar manualmente

```

---

## TASK V10-051

### Criar resumo automático da aula

Gerar:

```
lesson_ai_summary:
  summary:
  key_points:
  actionable_items:
  concepts:

```

Exibir abaixo do vídeo.

---

## TASK V10-052

### Criar Chat IA da aula

Interface:

```
Pergunte sobre esta aula

```

A IA deve responder utilizando somente:

```
Transcrição
Descrição
Materiais
Capítulos

```

Não responder inventando informação fora do conteúdo sem deixar isso explícito.

---

## TASK V10-053

### Criar Chat IA do curso

Permitir perguntas considerando todas as aulas daquele curso.

Fluxo:

```
Pergunta
↓
busca semântica
↓
trechos relevantes
↓
LLM
↓
resposta
↓
referência da aula
↓
timestamp

```

Exemplo:

```
Como eu configuro conversões no Google Ads?

Resposta...

Encontrado em:
Aula 7
18:42

```

O aluno poderá clicar e abrir exatamente aquele momento.

---

## TASK V10-054

### Busca semântica global

Campo:

```
O que você quer aprender?

```

Pesquisar em:

```
Cursos
Aulas
Capítulos
Transcrições
Materiais

```

Resultado:

```
Curso
Aula
Trecho
Timestamp

```

---

## TASK V10-055

### Tutor IA contextual

Criar um tutor que conheça:

```
Cursos liberados ao aluno
Progresso
Aulas concluídas
Aulas ainda não vistas

```

Exemplo:

```
Aluno:
O que devo estudar agora?

IA:
Você terminou as aulas 1 a 4.
Sua próxima aula é "Estrutura de campanhas".

```

A IA nunca pode acessar cursos sem matrícula ativa.

---

# FASE 7

# QUIZZES E APRENDIZADO

## TASK V10-060

### Criar quizzes

Permitir quiz após aula ou módulo.

Modelos sugeridos:

```
Quiz
QuizQuestion
QuizOption
QuizAttempt
QuizAnswer

```

Tipos:

```
Múltipla escolha
Verdadeiro ou falso

```

---

## TASK V10-061

### Certificado condicionado

Permitir configuração:

```
certificate_rules:
  require_all_lessons: true
  require_quiz: false
  minimum_score: 70

```

---

# FASE 8

# ANALYTICS

## TASK V10-070

### Analytics do curso

Mostrar:

```
Matrículas
Alunos ativos
Alunos iniciados
Conclusão
Tempo médio assistido
Taxa de conclusão
Abandono
Certificados

```

---

## TASK V10-071

### Identificar aulas com maior abandono

Exemplo:

```
Aula 1: 91% chegam ao final
Aula 2: 86%
Aula 3: 42%

```

Mostrar visualmente onde o aluno abandona.

---

## TASK V10-072

### Analytics individual

Para cada aluno:

```
Tempo assistido
Último acesso
Dias ativos
Cursos iniciados
Cursos concluídos
Aulas concluídas
Progresso

```

---

# FASE 9

# COMUNICAÇÃO

## TASK V10-080

### E-mails transacionais

Ativar Resend.

Templates:

```
Convite
Recuperação de senha
Novo curso liberado
Acesso próximo de expirar
Certificado emitido

```

---

## TASK V10-081

### Notificações administrativas

Criar eventos:

```
Integração falhou
Produto não mapeado
Vídeo Panda com erro
Webhook com erro
Aluno atingiu limite de dispositivo

```

---

# FASE 10

# SEGURANÇA AVANÇADA

## TASK V10-090

### MFA para administradores

Adicionar autenticação de dois fatores para contas ADMIN.

---

## TASK V10-091

### Rate limit específico

Criar limites diferentes para:

```
Login
Forgot password
Reset password
Playback
Heartbeat
Webhooks
Admin

```

---

## TASK V10-092

### Sessões administrativas

Criar painel:

```
Admin
→ Segurança
→ Sessões

```

Permitir visualizar e revogar sessões administrativas.

---

# 4. ORDEM EXATA DE EXECUÇÃO

A IA não deve tentar fazer tudo de uma vez.

Executar nesta ordem:

```
V10-001 Migrations
↓
V10-002 Testes
↓
V10-003 Healthcheck
↓
V10-010 Panda
↓
V10-011 DRM
↓
V10-012 Diagnóstico Panda
↓
V10-013 Textos Mux
↓
V10-020 TheMembers
↓
V10-021 Dashboard TheMembers
↓
V10-022 Reprocessamento
↓
V10-023 Alertas
↓
V10-004 Auditoria
↓
V10-030 Dashboard
↓
V10-031 Editor
↓
V10-032 Configurações existentes
↓
V10-033 Aula texto
↓
V10-034 Live
↓
V10-035 Alunos
↓
V10-036 Timeline
↓
V10-040 Home
↓
V10-041 Meu aprendizado
↓
V10-042 Certificado público
↓
V10-043 Storage
↓
V10-080 Emails
↓
V10-081 Alertas
↓
V10-050 Transcrição IA
↓
V10-051 Resumo IA
↓
V10-052 IA aula
↓
V10-053 IA curso
↓
V10-054 Busca semântica
↓
V10-055 Tutor
↓
V10-060 Quiz
↓
V10-061 Certificado condicionado
↓
V10-070 Analytics
↓
V10-071 Abandono
↓
V10-072 Analytics aluno
↓
V10-090 MFA
↓
V10-091 Rate limits
↓
V10-092 Sessões admin

```

---

# 5. FORMATO OBRIGATÓRIO PARA CADA ALTERAÇÃO

Quando uma IA receber uma TASK, primeiro deve responder:

```
analysis:
  task_id:
  current_behavior:
  desired_behavior:
  files_to_inspect:
  database_change_required:
  migration_required:
  api_change_required:
  frontend_change_required:
  environment_variables_required:
  risks:

```

Depois implementar.

Após implementar:

```
implementation_report:
  task_id:
  status: completed | partial | blocked

  files_created: []
  files_modified: []
  files_deleted: []

  database:
    changed: false
    migrations: []

  env:
    new_variables: []

  api:
    created_endpoints: []
    modified_endpoints: []

  frontend:
    created_pages: []
    modified_pages: []
    created_components: []

  tests:
    typecheck:
    lint:
    unit:
    integration:
    build:

  server_commands: []

  manual_validation: []

  remaining_issues: []

```

---

# 6. REGRA CONTRA ALTERAÇÕES INDESEJADAS

A IA deve seguir:

```
do_not:
  rewrite_project: true
  replace_working_architecture: true
  remove_existing_features: true
  change_database_without_migration: true
  expose_secrets: true
  expose_video_credentials: true
  bypass_authorization: true
  duplicate_existing_features: true
  change_visual_identity_without_request: true
  make_unrequested_refactors: true

```

---

# 7. REGRA PARA ALTERAÇÃO DE BANCO

Sempre que modificar Prisma:

```
1. Alterar schema
2. Criar migration
3. Revisar SQL
4. Confirmar compatibilidade
5. Executar Prisma generate
6. Executar testes
7. Executar build

```

Nunca apagar coluna ou tabela automaticamente se houver possibilidade de dados existentes.

---

# 8. REGRA DE SEGURANÇA DE ACESSO

Qualquer recurso de conteúdo deve respeitar:

```
Usuário autenticado
+
Conta ativa
+
Matrícula válida
+
Curso publicado
+
Aula publicada

```

Para vídeo adicionar:

```
Dispositivo autorizado
+
Limite de streams
+
WatchSession

```

Para IA adicionar:

```
A IA somente pode consultar conteúdo de cursos que o aluno possui acesso.

```

---

# 9. META DA V10

A Academy Play V10 estará considerada pronta quando possuir:

```
production:
  migrations: true
  tests_critical_flows: true
  healthcheck: true
  audit_logs: true

video:
  panda_production: true
  drm: true
  watermark: true

commerce:
  themembers_production: true
  webhook_monitoring: true

learning:
  courses: true
  lessons: true
  progress: true
  certificates: true
  materials: true
  quizzes: true

ai:
  transcription: true
  summaries: true
  lesson_chat: true
  course_chat: true
  semantic_search: true
  contextual_tutor: true

analytics:
  students: true
  courses: true
  lessons: true
  abandonment: true

security:
  device_control: true
  concurrent_stream_control: true
  admin_mfa: true
  audit: true

```

---

# 10. OBJETIVO DE PRODUTO

A Academy Play não deve se limitar a ser:

> "Um lugar onde o aluno assiste vídeos."

Ela deve evoluir para:

> **Uma plataforma inteligente de aprendizado onde o aluno assiste, pesquisa, pergunta, pratica, acompanha seu progresso e utiliza IA para transformar o conteúdo dos cursos em conhecimento aplicável.**

A prioridade continua sendo estabilidade, segurança e experiência antes de adicionar complexidade.

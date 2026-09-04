# Academy Play V10-011 — DRM e watermark Panda

```yaml
implementation_report:
  task_id: V10-011
  status: completed

  files_created:
    - apps/api/src/video/panda-drm.config.ts
    - RELEASE-V10-011.md

  files_modified:
    - .env.example
    - apps/api/src/health/health.service.ts
    - apps/api/src/main.ts
    - apps/api/src/video/providers/panda-video.provider.ts
    - apps/api/src/video/providers/video-provider.types.ts
    - apps/api/test/health.test.ts
    - apps/api/test/panda-integration.test.ts
    - apps/api/test/panda-playback.test.ts
    - apps/web/app/admin/integrations/page.tsx
    - apps/web/app/globals.css
    - apps/web/components/secure-player.tsx
    - package.json
    - package-lock.json
    - README.md
    - V10-MASTER-PLAN.md
    - PROJECT_MAP.md
    - TESTING-V10.md
    - INTEGRATIONS-V9.md
    - PANDA-V10.md
    - AUDIT_V8.md

  files_deleted: []

  functionality:
    - DRM Panda obrigatório e fail-closed em produção.
    - PANDA_REQUIRE_DRM precisa ser explicitamente true no boot de produção.
    - Group ID e secret obrigatórios, com Group ID validado como UUID.
    - JWT HS256 criado somente no backend e anexado ao parâmetro watermark.
    - Watermark com nome, e-mail e ID completo do aluno.
    - Caracteres de controle removidos dos campos antes da assinatura.
    - Player limitado aos hosts oficiais Panda e ao caminho /embed/.
    - ID externo do vídeo validado como UUID antes da autorização.
    - Group ID removido da resposta e dos parâmetros redundantes do player.
    - Healthcheck reprova DRM desativado, incompleto ou inválido.
    - Painel de integrações mostra Protegido apenas com API e DRM prontos.
    - Watermark visual responsiva comporta o ID completo em desktop e mobile.

  database:
    changed: false
    migrations: []

  env:
    new_variables: []
    changed_defaults:
      PANDA_REQUIRE_DRM: true
    required_existing_variables:
      - VIDEO_PROVIDER=panda
      - PANDA_API_KEY
      - PANDA_DRM_GROUP_ID
      - PANDA_DRM_GROUP_SECRET
      - PANDA_REQUIRE_DRM=true
      - PANDA_WATERMARK_TTL_SEC
      - PANDA_WEBHOOK_TOKEN

  api:
    created_endpoints: []
    modified_endpoints:
      - method: POST
        route: /api/playback/lessons/:id/access
        change: Emite somente player Panda autorizado com DRM/watermark válido.
      - method: POST
        route: /api/playback/lessons/:id/takeover
        change: Aplica o mesmo contrato DRM após encerrar a sessão concorrente.
      - method: GET
        route: /api/admin/integrations/status
        change: Expõe somente os booleanos seguros drmConfigured e drmRequired.
      - method: GET
        route: /health
        change: panda_configuration exige flag true e credenciais DRM válidas.

  frontend:
    created_pages: []
    modified_pages:
      - /admin/integrations
      - /watch/[lessonId]
    created_components: []
    modified_components:
      - apps/web/components/secure-player.tsx

  tests:
    new_scenarios: 5
    total_scenarios: 69
    passed: 69
    failed: 0
    typecheck: passed
    unit: passed
    integration: passed
    coverage_lines: 63.28
    coverage_branches: 69.99
    coverage_functions: 69.25
    panda_drm_config_coverage_lines: 96.08
    panda_provider_coverage_lines: 90.98
    panda_provider_coverage_branches: 71.07
    panda_provider_coverage_functions: 96.30
    prisma_validate: passed
    build_web: passed
    build_api: passed
    lint: not_configured_in_project

  server_commands:
    - Configurar os valores reais Panda no gerenciador de segredos do servidor.
    - npm install
    - npm run db:generate
    - npm run test:typecheck
    - npm test
    - npm run test:api:coverage
    - npm run build
    - Reiniciar o processo da API.
    - curl -i https://SEU-DOMINIO-API/health

  manual_validation:
    - Confirmar que o grupo DRM real protege o vídeo ou a pasta usados pela Academy.
    - Confirmar GET /health com panda_configuration true em staging.
    - Confirmar o estado Protegido em Admin / Integrações.
    - Reproduzir como aluno matriculado e validar nome, e-mail e ID na watermark.
    - Repetir com outro aluno e confirmar uma identificação diferente.
    - Confirmar bloqueio sem matrícula, com conta bloqueada e sem credencial DRM válida.
    - Confirmar playback real nos navegadores e dispositivos suportados pela Panda.

  remaining_issues:
    - A validação visual depende de Group ID, secret e vídeo reais da conta Panda de staging.
    - O token Panda já emitido permanece válido até expirar e não possui revogação criptográfica instantânea pelo heartbeat.
    - A TASK V10-012, painel completo de diagnóstico Panda, permanece como próxima etapa.
```

# Academy Play V10-012 — painel de diagnóstico Panda

```yaml
implementation_report:
  task_id: V10-012
  status: completed

  files_created:
    - apps/api/test/panda-diagnostics.test.ts
    - RELEASE-V10-012.md

  files_modified:
    - apps/api/src/integrations/integrations.controller.ts
    - apps/api/src/video/video.service.ts
    - apps/web/app/admin/integrations/page.tsx
    - apps/web/app/globals.css
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
    - Painel Panda responsivo com seis indicadores operacionais.
    - Conexão validada em tempo real pela API Panda.
    - DRM e webhook avaliados somente no backend.
    - Contadores calculados a partir dos VideoAsset Panda vinculados a aulas.
    - UPLOADING e PROCESSING consolidados no indicador de processamento.
    - Assets sem aula excluídos dos contadores operacionais.
    - Falha externa apresentada como conexão offline sem mensagem remota.
    - Falha do banco preservada como indisponibilidade, sem contadores zerados.
    - Botão Testar conexão atualiza todo o diagnóstico sem chamada externa duplicada.
    - Resposta sem API Key, secrets, URL de player ou metadados privados.

  database:
    changed: false
    migrations: []

  env:
    new_variables: []
    changed_variables: []
    required_existing_variables:
      - VIDEO_PROVIDER=panda
      - PANDA_API_KEY
      - PANDA_DRM_GROUP_ID
      - PANDA_DRM_GROUP_SECRET
      - PANDA_REQUIRE_DRM=true
      - PANDA_WEBHOOK_TOKEN

  api:
    created_endpoints:
      - method: GET
        route: /api/admin/integrations/panda/diagnostics
        authentication: AdminGuard
        cache_control: no-store, private
        response_fields:
          - panda.connected
          - panda.drm_enabled
          - panda.webhook_configured
          - panda.videos_linked
          - panda.processing_videos
          - panda.error_videos
    modified_endpoints:
      - method: POST
        route: /api/admin/integrations/panda/test
        change: Retorna o teste de conexão e os seis indicadores atualizados.

  frontend:
    created_pages: []
    modified_pages:
      - /admin/integrations
    created_components: []
    responsive_breakpoints:
      - desktop: três indicadores por linha
      - tablet: dois indicadores por linha
      - mobile: um indicador por linha

  tests:
    new_scenarios: 6
    total_scenarios: 75
    passed: 75
    failed: 0
    typecheck: passed
    lint: not_configured_in_project
    unit: passed
    integration: passed
    coverage_lines: 63.64
    coverage_branches: 70.63
    coverage_functions: 69.75
    integrations_controller_coverage_lines: 96.88
    video_service_coverage_lines: 65.04
    panda_provider_coverage_lines: 90.98
    prisma_validate: passed
    build_web: passed
    build_api: passed

  server_commands:
    - npm install
    - npm run db:generate
    - npm run test:typecheck
    - npm test
    - npm run test:api:coverage
    - npm run build
    - Reiniciar o processo da API e do frontend.
    - curl -i https://SEU-DOMINIO-API/health

  manual_validation:
    - Abrir Admin -> Integrações -> Panda com credenciais reais de staging.
    - Confirmar conexão online, DRM ativo e webhook configurado.
    - Comparar vídeos vinculados com aulas que possuem VideoAsset Panda.
    - Comparar processando com assets vinculados em UPLOADING ou PROCESSING.
    - Comparar com erro com assets vinculados em ERROR.
    - Confirmar que assets Panda sem aula não entram nos contadores.
    - Acionar Testar conexão e confirmar a atualização dos seis indicadores.
    - Inspecionar as respostas e confirmar ausência de credenciais e URLs privadas.
    - Repetir a inspeção em desktop, tablet e mobile.

  remaining_issues:
    - A conexão e os contadores precisam ser confirmados com API Panda e PostgreSQL reais em staging.
    - A eficácia do DRM e da watermark continua dependente da validação visual com um grupo Panda real.
    - A TASK V10-013, remoção das referências visuais antigas ao Mux, permanece como próxima etapa.
```

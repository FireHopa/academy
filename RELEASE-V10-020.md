# Academy Play V10-020 — validação ponta a ponta TheMembers

```yaml
implementation_report:
  task_id: V10-020
  status: partial
  completed_scope: automated_end_to_end_validation
  blocked_scope: real_checkout_purchase_and_cancellation
  blocker: Credenciais e token de webhook TheMembers ausentes neste ambiente.

  files_created:
    - apps/api/test/themembers-e2e.test.ts
    - THEMEMBERS-V10.md
    - RELEASE-V10-020.md

  files_modified:
    - scripts/test-themembers-webhook.sh
    - package.json
    - package-lock.json
    - README.md
    - V10-MASTER-PLAN.md
    - PROJECT_MAP.md
    - TESTING-V10.md
    - INTEGRATIONS-V9.md
    - AUDIT_V8.md

  files_deleted: []

  functionality_validated:
    - Payload oficial release.access entrando pelo controller do Checkout.
    - Token x-signature validado antes do processamento.
    - WebhookEvent reservado e concluído como PROCESSED.
    - Produto localizado por reference_id e identificadores alternativos.
    - Aluno criado com e-mail normalizado.
    - ExternalCustomer e ExternalSubscription persistidos.
    - ExternalAccessGrant criado para cada curso mapeado.
    - Enrollment efetiva recalculada com source THEMEMBERS.
    - Cursos liberados exibidos na biblioteca do aluno.
    - revoke.access cancela somente grants do produto revogado.
    - Outro produto preserva o acesso ao curso compartilhado.
    - Matrícula manual válida permanece soberana.
    - Sessões são bloqueadas somente em cursos sem acesso efetivo.
    - Reentrega não duplica usuário, cliente, assinatura, grant ou matrícula.
    - Script sintético alinhado à estrutura oficial do Checkout.

  database:
    changed: false
    migrations: []

  env:
    new_variables: []
    changed_variables: []
    required_for_external_validation:
      - THEMEMBERS_ENABLED=true
      - THEMEMBERS_API_MODE
      - Credenciais da API de produtos correspondentes ao modo escolhido
      - THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN
      - THEMEMBERS_ACCESS_AUTOMATION=true

  api:
    created_endpoints: []
    modified_endpoints: []
    validated_endpoint:
      method: POST
      route: /api/webhooks/themembers/checkout
      events:
        - release.access
        - revoke.access
      authentication: x-signature

  frontend:
    created_pages: []
    modified_pages: []
    created_components: []
    validated_behavior:
      - curso concedido aparece na biblioteca do aluno
      - curso sem grant efetivo deixa a biblioteca

  tests:
    new_scenarios: 4
    total_scenarios: 81
    passed: 81
    failed: 0
    typecheck: passed
    lint: not_configured_in_project
    unit: passed
    integration: passed
    shell_syntax: passed
    coverage_lines: 67.84
    coverage_branches: 73.22
    coverage_functions: 73.50
    themembers_service_coverage_lines: 73.41
    themembers_service_coverage_branches: 72.80
    themembers_service_coverage_functions: 71.11
    themembers_webhook_controller_coverage_lines: 100.00
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
    - Configurar os segredos TheMembers no gerenciador seguro do servidor.
    - Reiniciar a API.
    - curl -i https://SEU-DOMINIO-API/health

  manual_validation:
    - Testar conexão e sincronizar produtos em Admin -> Integrações.
    - Mapear o produto de teste para um curso publicado.
    - Validar primeiro um novo evento com automação desligada.
    - Ativar a automação e gerar uma nova compra real.
    - Confirmar usuário, cliente, assinatura, grants, matrícula e biblioteca.
    - Comprar outro produto com curso compartilhado.
    - Cancelar o primeiro produto e confirmar preservação do grant restante.
    - Cancelar o último produto e confirmar remoção do curso e bloqueio da sessão.
    - Repetir com matrícula manual e confirmar sua preservação.

  remaining_issues:
    - Compra e cancelamento reais não foram executados por ausência de credenciais TheMembers.
    - Um evento IGNORED com automação desligada não é reaproveitado após a ativação; use um novo evento.
    - Reprocessamento administrativo de webhooks permanece reservado para a TASK V10-022.
    - O dashboard operacional permanece reservado para a TASK V10-021.
```

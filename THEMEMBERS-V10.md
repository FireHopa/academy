# Academy Play V10-020 — validação ponta a ponta TheMembers

## Estado da validação

O fluxo completo foi validado com o serviço real da aplicação, payload oficial e um PostgreSQL simulado com estado persistente entre os eventos.

Validado automaticamente:

- recebimento pelo endpoint público do Checkout;
- token `x-signature` antes do processamento;
- identificação de evento, cliente e produto;
- criação ou reutilização do aluno;
- persistência de cliente e assinatura externos;
- criação de grants por produto e curso;
- recálculo da matrícula efetiva;
- curso disponível na biblioteca do aluno;
- cancelamento somente dos grants do produto revogado;
- preservação de acesso por outro produto ou matrícula manual;
- bloqueio somente das sessões que realmente perderam acesso;
- idempotência da reentrega.

A compra e o cancelamento reais em staging continuam pendentes porque este ambiente não possui credenciais TheMembers nem token do webhook preenchidos.

## Contrato oficial usado

Endpoint Academy:

```text
POST https://SEU-DOMINIO-API/api/webhooks/themembers/checkout
```

Configuração no Checkout:

```text
Eventos: release.access e revoke.access
Header: x-signature
Resposta esperada: HTTP 200
```

Mapeamento do payload:

| TheMembers | Academy |
| --- | --- |
| `payload.id` | chave idempotente do evento, combinada com o tipo |
| `payload.event` | `release.access` ou `revoke.access` |
| `payload.data.customer.id` | `ExternalCustomer.externalId` |
| `payload.data.customer.email` | localização ou criação do aluno |
| `payload.data.product.reference_id` | primeira referência para localizar o produto |
| `payload.data.product.id` | referência alternativa do produto |
| `payload.data.product.expires_in` | validade do grant e da matrícula |
| `payload.data.order.id` | identificação externa da assinatura ou compra |
| `payload.data.order.transaction.paid_at` | último pagamento conhecido |

Referências oficiais:

- https://ajuda.themembers.com.br/pt-br/article/webhooks-do-checkout-1adpcv1/
- https://ajuda.themembers.com.br/pt-br/article/como-configurar-webhooks-externos-em-produtos-do-checkout-themembers-hijlh0/

## Fluxo de compra validado

```text
release.access
  -> WebhookEvent PROCESSED
  -> User STUDENT ACTIVE
  -> ExternalCustomer
  -> ExternalSubscription ACTIVE
  -> ExternalAccessGrant ACTIVE por curso
  -> Enrollment ACTIVE com source THEMEMBERS
  -> curso na biblioteca do aluno
```

## Fluxo de cancelamento validado

```text
revoke.access do Produto A
  -> assinatura A CANCELLED
  -> grants A CANCELLED
  -> recalcular cada curso afetado
     -> existe grant B válido: matrícula continua ACTIVE
     -> existe matrícula manual válida: matrícula continua ACTIVE
     -> não existe outra origem: matrícula vira CANCELLED
  -> bloquear somente sessões dos cursos sem acesso efetivo
```

## Checklist obrigatório de staging

1. Configure os segredos reais no servidor, sem gravá-los no repositório.
2. Comece com `THEMEMBERS_ENABLED=true` e `THEMEMBERS_ACCESS_AUTOMATION=false`.
3. Em `Admin -> Integrações`, teste a conexão e sincronize os produtos.
4. Mapeie o produto de teste para um curso publicado.
5. Confirme o `Reference ID do Checkout` quando ele for diferente do ID sincronizado.
6. Cadastre o endpoint com os eventos `release.access` e `revoke.access` e o mesmo token de segurança do servidor.
7. Faça uma primeira compra controlada com automação desligada e confirme `IGNORED / access_automation_disabled`.
8. Ative `THEMEMBERS_ACCESS_AUTOMATION=true` e reinicie a API.
9. Gere uma nova compra ou um novo evento. O evento ignorado anteriormente não será reaproveitado por idempotência.
10. Confirme usuário, cliente externo, assinatura, grant, matrícula e curso na biblioteca.
11. Faça uma segunda compra que libere pelo menos um curso em comum.
12. Cancele apenas a primeira compra e confirme que o curso comum permanece disponível.
13. Cancele o último produto que mantém um curso e confirme matrícula cancelada e sessão bloqueada.
14. Repita com uma matrícula manual ativa e confirme que ela não é removida.
15. Confira `WebhookEvent`, `IntegrationLog` e ausência de dados secretos nas respostas administrativas.

## Teste sintético controlado

O script local usa a mesma estrutura oficial, mas não substitui uma compra real:

```bash
API_URL="https://staging-api.exemplo.com/api" \
npm run test:themembers-webhook -- \
  aluno-teste@example.com \
  REFERENCE_ID_DO_PRODUTO \
  release.access
```

Para o cancelamento, repita com um novo evento:

```bash
API_URL="https://staging-api.exemplo.com/api" \
npm run test:themembers-webhook -- \
  aluno-teste@example.com \
  REFERENCE_ID_DO_PRODUTO \
  revoke.access
```

## Rollback operacional

Definir `THEMEMBERS_ACCESS_AUTOMATION=false` interrompe novas alterações de acesso, mas não desfaz grants e matrículas já processados. Qualquer correção retroativa deve ser feita de forma controlada no admin ou por reprocessamento auditado quando a V10-022 estiver disponível.

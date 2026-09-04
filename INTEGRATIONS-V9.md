# Academy Play V9 — Panda Video + TheMembers

> Atualização: a integração Panda foi concluída entre V10-010 e V10-013. O ciclo TheMembers foi validado automaticamente na V10-020 e ainda exige compra e cancelamento reais em staging. Consulte `PANDA-V10.md` e `THEMEMBERS-V10.md`.

## Arquitetura oficial

- **Academy Play**: login, cursos, módulos, aulas, matrículas efetivas, progresso, certificados, dispositivos, sessões e experiência do aluno.
- **Panda Video**: armazenamento, encoding, player e DRM/Watermark dos vídeos.
- **TheMembers**: catálogo comercial, produto vendido e eventos de liberar/revogar acesso.

A Academy não replica módulos/aulas/progresso para a TheMembers. O vínculo comercial é `Produto TheMembers -> Curso(s) Academy`.

## 1. Banco após atualizar para V9

A V9 acrescenta as tabelas `VideoAsset`, `ExternalProduct`, `ProductCourse`, `ExternalCustomer`, `ExternalSubscription`, `ExternalAccessGrant`, `WebhookEvent` e `IntegrationLog`.

`ExternalAccessGrant` é a camada de segurança de entitlement: cada produto TheMembers mantém seu próprio direito de acesso. A `Enrollment` da Academy é recalculada como a união dos grants válidos. Assim, cancelar um produto não remove um curso se outro produto ainda o libera, e uma matrícula manual ativa não é apagada pela TheMembers.

No desenvolvimento local:

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
```

Depois reinicie API e frontend.

Se o banco já existia antes da V10 e foi criado com `prisma db push`, faça backup e siga primeiro o procedimento de baseline em `MIGRATIONS-V10.md`.

## 2. Panda Video

### Credenciais

No `.env`:

```env
VIDEO_PROVIDER="panda"
PANDA_API_KEY=""
PANDA_FOLDER_ID=""
PANDA_DRM_GROUP_ID=""
PANDA_DRM_GROUP_SECRET=""
PANDA_REQUIRE_DRM=true
PANDA_WATERMARK_TTL_SEC=28800
PANDA_WEBHOOK_TOKEN="token-aleatorio-longo"
```

`PANDA_API_KEY` fica somente no backend.

### Fluxo adotado nesta versão

Por segurança, o browser não recebe a API key completa do Panda. Nesta primeira integração, envie os arquivos de vídeo pelo painel do Panda e depois, dentro da Academy:

`Admin -> Curso -> Aula -> Vídeo -> Abrir Biblioteca Panda -> Vincular`

A Academy busca a biblioteca pelo backend, grava um `VideoAsset` e associa a aula sem copiar o arquivo.

### DRM Watermark

Crie um grupo DRM/Watermark no Panda e, de preferência, associe uma pasta exclusiva da Academy ao grupo. Copie o ID e o secret do grupo para o `.env`.

Quando os dois campos estiverem configurados, a Academy gera um JWT individual por reprodução com:

- nome do aluno;
- e-mail;
- identificador Academy;
- expiração curta.

Desde a V10-011, use `PANDA_REQUIRE_DRM=true`. A API recusa a inicialização em produção quando a flag está ausente, inválida ou desativada.

### Webhook de status Panda

Configure no Panda:

```text
https://SEU-DOMINIO-API/api/webhooks/panda/SEU_PANDA_WEBHOOK_TOKEN
```

O webhook atualiza vídeos vinculados quando o Panda muda o status de conversão.

> Para localhost, um serviço externo não alcança `localhost`. Teste webhooks em staging/VPS ou por um túnel HTTPS temporário.

## 3. TheMembers

### Produtos

Modo legado, que possui rota de produtos explicitamente documentada:

```env
THEMEMBERS_ENABLED=true
THEMEMBERS_API_MODE="legacy"
THEMEMBERS_DEVELOPER_TOKEN=""
THEMEMBERS_PLATFORM_TOKEN=""
```

Também existe suporte ao API Token v1. Para evitar adivinhar uma rota específica da sua conta, nesse modo informe explicitamente:

```env
THEMEMBERS_API_MODE="v1"
THEMEMBERS_API_TOKEN=""
THEMEMBERS_PRODUCTS_ENDPOINT="https://...rota-oficial..."
```

Depois vá em:

`Admin -> Integrações -> TheMembers -> Testar conexão -> Sincronizar produtos`

E mapeie cada produto para um ou mais cursos Academy.

### Consultar cursos, módulos e aulas

O mesmo API Token v1 permite consultar a estrutura criada na TheMembers. A rota oficial já é usada por padrão:

```env
THEMEMBERS_API_TOKEN=""
# Opcional. Só informe para substituir a rota padrão do provedor.
THEMEMBERS_COURSES_ENDPOINT="https://api.themembers.com.br/api/v1/courses"
```

Depois vá em:

`Admin -> Integrações -> TheMembers -> Consultar cursos e aulas`

A tela apresenta a árvore `curso -> módulo -> aula`, com IDs e situação de publicação/bloqueio. A consulta é somente leitura: ela não cria, renomeia, exclui nem sobrescreve o conteúdo local da Academy.

### IDs diferentes entre API e Checkout

A integração não presume que o ID retornado pela API de produtos seja sempre igual ao `reference_id` usado pelo Checkout. No painel, cada produto possui um campo opcional **Reference ID do Checkout**.

O webhook tenta casar, nesta ordem ampla, os identificadores recebidos (`reference_id`, `product_id`, `product.id`) contra `externalId`, `productCode` e esse alias manual. Se o primeiro webhook real aparecer como `product_not_synced`, copie o `reference_id` correto para o produto correspondente e repita o teste antes de ativar a automação.

### Webhook correto para compra/acesso

Use o **Checkout** da TheMembers e selecione os eventos de acesso:

- `release.access`
- `revoke.access`

Endpoint:

```text
https://SEU-DOMINIO-API/api/webhooks/themembers/checkout
```

No Checkout, configure um token de segurança e copie o mesmo valor para:

```env
THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN=""
```

A TheMembers envia esse token no header `x-signature` e a Academy compara em tempo constante antes de processar o payload.

### Modo seguro de ativação

Mantenha inicialmente:

```env
THEMEMBERS_ENABLED=true
THEMEMBERS_ACCESS_AUTOMATION=false
```

`THEMEMBERS_ENABLED` é a chave-mestra da integração. Mesmo que o endpoint receba um webhook válido, nenhuma alteração de acesso é feita quando ela está `false`.

Faça primeiro:

1. teste de conexão;
2. sincronização de produtos;
3. mapeamento Produto -> Curso;
4. configure o webhook;
5. faça uma compra de teste e confirme que o evento aparece em `Admin -> Integrações` como `IGNORED / access_automation_disabled`;
6. confira e-mail, produto e payload;
7. somente então mude para:

```env
THEMEMBERS_ACCESS_AUTOMATION=true
```

A partir daí:

- `release.access`: cria/reutiliza usuário, registra o grant específico daquele produto e recalcula o acesso efetivo aos cursos mapeados;
- `revoke.access`: cancela apenas os grants daquele produto e recalcula o acesso. Se outro produto ou uma matrícula manual ainda mantiver o curso válido, o aluno continua com acesso. Sessões de vídeo só são encerradas quando o acesso efetivo realmente desaparece.

O processamento é idempotente por `WebhookEvent`. A reserva do evento usa lock transacional no PostgreSQL para evitar processamento duplo em entregas simultâneas. Eventos que ficarem presos em `RECEIVED` após uma queda podem ser retomados em uma nova entrega depois da janela de segurança.

> Um evento que já terminou como `IGNORED` não será processado novamente ao ligar a automação. Depois de ativar `THEMEMBERS_ACCESS_AUTOMATION=true`, gere uma nova compra ou um novo evento para a validação efetiva.

A matriz ponta a ponta, o contrato oficial e os passos de compra/cancelamento em staging estão em `THEMEMBERS-V10.md`.

### Webhook da Área de Membros/Plataforma

É opcional e separado do Checkout. Se quiser receber eventos de progresso/conteúdo da própria TheMembers, configure:

```env
THEMEMBERS_PLATFORM_WEBHOOK_CLIENT_TOKEN=""
```

Endpoint:

```text
https://SEU-DOMINIO-API/api/webhooks/themembers/platform
```

Esse endpoint valida HMAC-SHA256 do raw body. Ele não é necessário para liberação comercial da Academy.

## 4. Compatibilidade com Mux

Os campos Mux existentes e o provider `MUX` foram mantidos como fallback de migração. Para voltar temporariamente:

```env
VIDEO_PROVIDER="mux"
```

A arquitetura de `Lesson -> VideoAsset -> Provider` impede que a regra de negócio das aulas fique presa a um fornecedor.

## 5. Checklist antes de produção

- `PANDA_API_KEY` somente na API/VPS.
- Pasta Panda dedicada para Academy.
- DRM group contendo essa pasta ou os vídeos usados.
- `PANDA_REQUIRE_DRM=true`.
- `PANDA_WEBHOOK_TOKEN` longo e aleatório.
- TheMembers produtos sincronizados e mapeados.
- Webhook do Checkout apenas com `release.access` e `revoke.access` para a automação de matrícula.
- `THEMEMBERS_CHECKOUT_WEBHOOK_TOKEN` longo e exclusivo.
- Primeiro evento validado com `THEMEMBERS_ACCESS_AUTOMATION=false`.
- Depois ativar automação.
- HTTPS obrigatório em staging/produção.

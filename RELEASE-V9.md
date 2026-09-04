# Release V9 — Panda + TheMembers

Data: 2026-08-14

Principais mudanças:

1. Panda Video substitui Mux como provider padrão, sem remover o fallback Mux.
2. `VideoAsset` desacopla a aula do fornecedor de streaming.
3. Biblioteca Panda integrada no editor da aula.
4. Panda DRM Watermark assinado pelo backend para cada aluno.
5. TheMembers integrado para sincronização de produtos e mapeamento para cursos Academy.
6. Checkout TheMembers recebe `release.access` / `revoke.access` por endpoint autenticado com `x-signature`.
7. Webhooks têm idempotência e logs persistentes.
8. Automação de matrícula fica OFF até validação do primeiro evento real.

Leia `INTEGRATIONS-V9.md` antes de preencher as credenciais.
9. `ExternalAccessGrant` separa os direitos por produto e impede que um cancelamento retire acesso concedido por outro produto ou por matrícula manual.
10. A reserva de webhooks TheMembers usa lock transacional no PostgreSQL e pode recuperar eventos `RECEIVED` órfãos após queda do processo.
11. Scripts Linux detectam Docker Compose no Ubuntu e Podman Compose no Bazzite sem criar duas arquiteturas de deploy.
12. Incluído `npm run test:themembers-webhook` para simular `release.access` e `revoke.access` localmente depois do mapeamento do produto.

# Etapa 9: AuditLog administrativo

Esta etapa cria um histórico central das alterações realizadas no painel administrativo.

## O que passa a ser registrado

- administrador responsável, com ID, nome e e-mail preservados no momento da ação;
- ação realizada;
- tipo e ID da entidade afetada;
- estado anterior e posterior quando a entidade permite snapshot;
- dados sanitizados da requisição;
- IP e navegador;
- request ID exclusivo;
- data e hora.

O registro acontece somente depois que a operação administrativa termina com sucesso. Uma tentativa rejeitada pela regra de negócio não aparece como alteração concluída.

## Ações cobertas

### Alunos e acessos

- criação e importação;
- geração de convite;
- bloqueio e reativação;
- criação, alteração e cancelamento de matrícula;
- envio de notificação;
- revogação de dispositivo;
- encerramento de sessão.

### Conteúdo

- criação, alteração e exclusão de cursos;
- imagens e categorias de cursos;
- criação, alteração, exclusão e reordenação de módulos e aulas;
- materiais, capítulos e transcrição;
- trilhas, imagens e cursos vinculados;
- vídeos vinculados, atualizados ou removidos.

### Integrações

- testes Panda e TheMembers;
- solicitação de limpeza de assets;
- importação de curso TheMembers;
- sincronização e reconciliação;
- alteração de mapeamentos e reference ID.

Jobs e webhooks automáticos continuam usando os logs de integração existentes. O AuditLog registra a ação humana que solicitou o processamento.

## Proteção de dados

Antes de gravar, o sanitizador remove:

- senhas e hashes de senha;
- tokens, cookies e autorizações;
- secrets e chaves privadas;
- CPF e telefone;
- objetos de convite;
- query strings de URLs, incluindo assinaturas temporárias;
- excesso de itens, profundidade e textos muito grandes.

O conteúdo completo de notificações e arquivos enviados não é copiado para o AuditLog.

## Consulta administrativa

Nova página:

```text
/admin/audit
```

Novo endpoint:

```text
GET /api/admin/audit-logs
```

A tela permite buscar por administrador, ação, entidade, ID e request ID, além de filtrar tipo e período. Os detalhes exibem antes, depois e dados técnicos. A rota é exclusiva para `ADMIN` e responde com `Cache-Control: no-store, private`.

## Banco e implantação

A migration `20260902120000_admin_audit_log` cria a tabela e os índices de consulta.

Depois de aplicar os arquivos:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run build
```

Depois reinicie a API e o frontend conforme o processo normal do servidor.

## Validações

- Prisma schema válido;
- cliente Prisma regenerado;
- build Next.js e NestJS;
- typecheck da API;
- 142 testes automatizados.

## Arquivos alterados ou criados

- `README.md`
- `TESTING-V10.md`
- `ETAPA-9-CORRECOES.md`
- `prisma/schema.prisma`
- `prisma/migrations/20260902120000_admin_audit_log/migration.sql`
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/integrations/integrations.controller.ts`
- `apps/api/src/audit/*`
- `apps/api/test/audit-log.test.ts`
- `apps/api/src/generated/prisma/*` alterados pela geração
- `apps/web/components/admin/admin-shell.tsx`
- `apps/web/app/admin/audit/page.tsx`
- `apps/web/app/admin/audit/page.module.css`

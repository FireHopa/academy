# Etapa 2 — Sincronização TheMembers

Esta etapa corrige a sincronização da estrutura de cursos importada da TheMembers.

## Correções aplicadas

### 1. Atualização de publicação e bloqueio

A sincronização agora recalcula `published` também nas aulas que já existem.

Uma aula importada só permanece publicada quando curso, módulo e aula estão publicados e não bloqueados na TheMembers.

Se a disponibilidade voltar na origem, uma nova sincronização republica a aula automaticamente.

### 2. Aula removida da origem

Quando uma aula anteriormente importada deixa de aparecer em um módulo da TheMembers, ela é despublicada no Academy.

O registro não é excluído. Isso preserva progresso, histórico e a possibilidade de restauração futura.

### 3. Módulo removido da origem

Quando um módulo anteriormente importado deixa de aparecer na TheMembers, suas aulas importadas são despublicadas.

O módulo e as aulas não são excluídos automaticamente.

### 4. Conteúdo manual preservado

Módulos e aulas sem `sourceProvider = THEMEMBERS` não são despublicados nem removidos pela sincronização.

Isso também vale para uma aula manual criada dentro de um módulo importado.

### 5. Retorno e log da operação

O resumo da importação agora informa:

- módulos e aulas criados ou atualizados;
- módulos que deixaram de existir na origem;
- aulas que deixaram de existir na origem;
- quantidade de aulas despublicadas;
- conteúdo manual preservado.

Quando houver despublicação, a mensagem exibida ao administrador informa a quantidade afetada.

## Arquivos alterados

- `apps/api/src/integrations/themembers.service.ts`
- `apps/api/test/themembers-courses.test.ts`

## Banco de dados

Esta etapa não altera o schema Prisma e não exige migration.

## Validações executadas

- Testes da sincronização TheMembers: 4/4 aprovados.
- Suíte completa da API: 105/105 aprovada.
- Typecheck da API e dos testes: aprovado.
- Build NestJS da API: aprovado.

## Aplicação

Copie os arquivos mantendo os caminhos do ZIP e execute:

```bash
npm ci
npm run test:api
npm run build -w @academy/api
```

Depois, publique a nova versão da API e faça uma sincronização de um curso já importado para aplicar a nova política aos registros existentes.

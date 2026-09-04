# Academy Play V10.0.29

## Importação de cursos da TheMembers

- a área de Integrações agora exibe “Importar curso” em cada curso retornado pela API v1;
- a importação cria o curso local como rascunho e copia a estrutura de módulos e aulas;
- uma nova importação do mesmo curso atualiza a estrutura já vinculada, sem criar duplicatas;
- módulos e aulas criados manualmente na plataforma são preservados;
- o curso importado passa a exibir as ações “Atualizar importação” e “Abrir curso”.

A API de cursos da TheMembers disponibiliza a estrutura e os textos. Vídeos, materiais, progresso e matrículas não são copiados por esta operação.

## Banco de dados

A migration `20260821143000_themembers_course_import` adiciona identificadores opcionais de origem a cursos, módulos e aulas. Esses identificadores tornam a importação idempotente.

Antes de atualizar em produção, faça um backup do banco. Depois de substituir/criar os arquivos deste pacote na raiz do projeto, execute:

```bash
npm run db:migrate:deploy
npm run db:generate
npm run build
npm test
```

Se este banco já existia antes da adoção do Prisma Migrate e ainda apresentar o erro `P3005`, confirme o backup e registre uma única vez a migration que representa o schema já existente. Depois aplique as migrations incrementais:

```bash
npx prisma migrate resolve --applied 20260818143115_baseline_v9
npm run db:migrate:deploy
npm run db:generate
npm run db:migrate:status
```

Não há dependências novas.

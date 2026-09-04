# Academy Play V10.0.21

## Fundação visual do administrador

- cria identidade clara e independente da experiência escura do aluno;
- adiciona navegação administrativa agrupada e com ícones;
- adiciona cabeçalho fixo, identificação do administrador e atalho para visualizar a área do aluno;
- adiciona menu lateral responsivo para celular e tablet;
- melhora contraste, foco por teclado, estados, formulários, tabelas e cartões;
- reorganiza a visão geral com indicadores, cursos recentes e ações rápidas;
- preserva APIs, banco de dados, Panda Video, TheMembers e todas as funcionalidades existentes.

## Arquivos da versão

- `apps/web/components/admin/admin-icon.tsx`
- `apps/web/components/admin/admin-shell.tsx`
- `apps/web/components/admin/admin-shell.module.css`
- `apps/web/app/admin/page.tsx`
- `package.json`
- `RELEASE-V10-021.md`

## Validação

```bash
npm run build -w @academy/web
```

Não há dependências novas nem migrações de banco nesta versão.

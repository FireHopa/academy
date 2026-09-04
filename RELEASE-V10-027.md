# Academy Play V10.0.27

## Cursos e aulas

- módulos começam recolhidos e podem ser abertos ou fechados individualmente;
- um módulo recém-criado é aberto automaticamente;
- “Conteúdo” passa a ser “Editar aula” e fica disponível mesmo antes de vincular um vídeo;
- ações agora distinguem “Renomear módulo” de “Renomear aula”;
- o editor da aula ganhou uma prévia ao lado, atualizada em tempo real com descrição, capítulos, materiais e transcrição.

## Categorias e trilhas

- menus, filtros, fileiras e rotas visíveis de categorias e trilhas ficam ocultos;
- banco de dados, APIs e telas originais permanecem no código como legado;
- a chave central está em `apps/web/lib/features.ts` e pode ser reativada depois sem remover dados.

## Alunos por CSV

- a tela `Admin -> Alunos` aceita arquivos CSV com até 1.000 registros;
- colunas obrigatórias: `nome` e `email`;
- coluna opcional: `senha`, com no mínimo 10 caracteres;
- aceita separador por ponto e vírgula, vírgula ou tabulação e campos entre aspas;
- permite enviar convite para alunos sem senha;
- duplicidades são ignoradas e o relatório do processamento pode ser baixado em CSV.

## TheMembers API v1

- `Admin -> Integrações` consulta a árvore de cursos, módulos e aulas criada na TheMembers;
- a resposta suporta paginação, exibe IDs e situação de publicação/bloqueio;
- a consulta usa `THEMEMBERS_API_TOKEN` com Bearer Token;
- `THEMEMBERS_COURSES_ENDPOINT` é opcional e usa `https://api.themembers.com.br/api/v1/courses` por padrão;
- a operação é somente leitura e não modifica o catálogo local.

## Atualização

Substitua/crie os arquivos deste pacote na raiz do projeto e execute:

```bash
npm run build
npm test
```

Não há dependências novas nem migração de banco de dados.

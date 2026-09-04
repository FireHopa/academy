# Academy Play V10.0.28

## Nova experiência de alunos

- cadastro de aluno em modal, com foco automático, labels permanentes e validações próximas aos campos;
- criação rápida com nome, e-mail, senha opcional, convite e curso opcional;
- ao selecionar um curso, a conta e a matrícula são criadas na mesma operação;
- CPF, telefone, ativação e expiração ficam dentro de “Opções avançadas”;
- confirmação pós-cadastro oferece acesso direto ao perfil e à liberação de curso;
- importação CSV passa a abrir em um modal próprio, preservando os recursos já existentes.

## Listagem

- busca por nome ou e-mail em tempo real;
- filtros para todos, ativos, bloqueados, sem curso e inativos;
- “Inativo” significa aluno ativo sem login nem progresso nos últimos 30 dias;
- tabela reduzida para Aluno, Status, Cursos, Última atividade, Progresso e Ações;
- em telas pequenas, a tabela é substituída por cards responsivos.

## Perfil individual

- resumo prioritário com status, matrículas ativas, último acesso e progresso geral;
- cursos e acessos aparecem antes das informações operacionais;
- “Ver área do aluno” abre uma prévia administrativa, somente leitura, dos cursos realmente disponíveis;
- recuperação de acesso foi simplificada para “Gerar convite” e “Gerar e enviar”;
- dispositivos, sessões e certificados usam blocos compactos, inclusive quando vazios;
- ações destrutivas ficam em “Mais ações” e exigem confirmação;
- datas são apresentadas no padrão brasileiro.

## Banco de dados

A versão adiciona os campos opcionais `cpf` e `phone` ao usuário. O CPF possui índice único.

Antes de atualizar em produção, faça um backup do banco. Depois de substituir/criar os arquivos deste pacote na raiz do projeto, execute:

```bash
npm run db:migrate:deploy
npm run db:generate
npm run build
npm test
```

Não há dependências novas.

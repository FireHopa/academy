# Academy Play V10.0.30

## Exclusão de cursos

- o editor de curso agora possui a seção “Excluir curso” no final da página;
- para confirmar, o administrador precisa digitar exatamente o nome do curso;
- a exclusão remove o curso, módulos, aulas, matrículas, progresso, certificados e demais vínculos associados;
- imagens de capa e banner armazenadas pela própria plataforma também são removidas;
- cursos importados da TheMembers podem ser excluídos e importados novamente depois.

Esta ação é permanente e não pode ser desfeita.

## Atualização

Depois de substituir/criar os arquivos deste pacote na raiz do projeto, execute:

```bash
npm run build
npm test
```

Reinicie a API e o frontend depois da atualização. Não há migration nem dependências novas.

# Academy Play V10.0.24

## Editor administrativo mais rápido

- move a criação de módulos para o início da área de conteúdo;
- remove os botões com setas de todas as listas ordenáveis;
- adiciona uma alça visual para reorganizar itens arrastando com o mouse;
- mantém reordenação por teclado com `↑`, `↓`, `Home` e `End` quando a alça está focada;
- mostra retorno visual do item arrastado e da posição de destino.

## Locais com arrastar e soltar

- módulos do curso;
- aulas dentro de cada módulo;
- cursos dentro de uma trilha;
- capítulos de uma aula;
- materiais complementares.

## Ações da aula

- “Conteúdo” aparece somente quando a aula já possui vídeo vinculado ou em processamento;
- a ação “Conteúdo” foi movida para a direita e recebeu destaque visual;
- “Ocultar” e “Publicar” foram substituídos por olho aberto e olho fechado;
- o controle de visibilidade ganhou posição própria e descrição acessível;
- trilhas adotam o mesmo padrão visual de olho aberto ou fechado.

## Persistência

- módulos e aulas salvam a nova ordem imediatamente após soltar;
- cursos da trilha continuam sendo confirmados no botão “Salvar ordem da trilha”;
- capítulos e materiais continuam sendo confirmados em “Salvar conteúdo”;
- capítulos agora respeitam a ordem definida no painel em vez de serem reordenados silenciosamente pelo horário.

## Atualização

```bash
npm run build
npm run test:api
```

Não há dependências novas nem migrações de banco de dados.

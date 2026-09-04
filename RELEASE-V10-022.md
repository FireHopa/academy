# Academy Play V10.0.22

## Placeholders visuais locais

- adiciona quatro capas abstratas em WebP para conteúdos sem imagem;
- seleciona uma variação estável com base no curso ou na trilha;
- mantém a imagem cadastrada como prioridade;
- usa a capa local também quando uma URL externa não carrega;
- aplica fallback em cursos, trilhas, destaques, páginas internas, histórico e cards administrativos;
- remove fundos genéricos borrados sem depender de serviços externos.

## Validação

```bash
npm run build
```

Não há dependências novas nem migrações de banco.

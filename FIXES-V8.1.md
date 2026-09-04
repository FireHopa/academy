# Academy Play V8.1 — CSS fix

Correções aplicadas sobre `academy-play-v8-prisma-fixed.zip`:

- Corrigido `apps/web/app/globals.css` que continha sequências literais `\\n` dentro do bloco Mux DRM/upload.
- Essas sequências faziam o parser do Next/PostCSS interpretar `@keyframes` e `@media` como tokens inválidos.
- O bloco foi convertido para quebras de linha reais.
- Varredura em todos os arquivos CSS: nenhuma sequência literal `\\n` restante.
- Validação do CSS com `tinycss2`: 467 regras de topo, 0 erros de parse.

Observação: o `npm install` completo no ambiente de geração ainda excede o timeout disponível. O teste integrado final deve ser executado no computador de desenvolvimento.

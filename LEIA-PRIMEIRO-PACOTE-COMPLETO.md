# Academy Play V10: pacote completo

Este pacote contém o projeto completo consolidado a partir dos quatro ZIPs originais, com as correções das Etapas 1 a 13 já aplicadas na ordem correta.

Ao contrário do pacote cumulativo de atualização, este ZIP pode ser extraído em uma pasta nova e executado como projeto independente.

## Conteúdo preservado

- código completo da API NestJS;
- código completo do frontend Next.js;
- schema e todas as migrations Prisma;
- `package.json` da raiz e dos workspaces;
- `package-lock.json` original;
- scripts, testes e documentação;
- versões finais das 13 etapas.

O pacote não contém `.env`, credenciais reais, `node_modules` ou builds gerados. O arquivo `apps/web/prt2.zip` foi mantido apenas porque já existia nos arquivos originais, mas é uma cópia antiga e não deve ser extraído nem utilizado.

## Instalação segura

1. Extraia este ZIP em uma pasta nova.
2. Entre na pasta que contém `package.json`, `package-lock.json`, `apps` e `prisma`.
3. Copie o seu `.env` para essa pasta.
4. Confirme Node.js 22, 23 ou 24 e npm 10 ou superior.
5. Inicie PostgreSQL e Redis.
6. Execute os comandos abaixo, um por vez.

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run test:typecheck
npm test
npm run build
```

Se `npm ci` retornar erro, pare nesse ponto e corrija a instalação. Não execute os comandos seguintes, pois `prisma: command not found` significa que as dependências não foram instaladas.

Para iniciar o ambiente de desenvolvimento:

```bash
npm run linux:dev
```

Não execute `npm run linux:reset` em uma instalação que possua dados que precisam ser preservados.

## Verificação rápida

```bash
test -f package-lock.json
test -f apps/api/package.json
test -f apps/web/package.json
test -x node_modules/.bin/prisma
```

Os quatro comandos devem terminar sem mensagem de erro depois de `npm ci`.


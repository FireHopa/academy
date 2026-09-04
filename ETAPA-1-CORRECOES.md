# Etapa 1 — Instalação, reset e seed seguros

Arquivos deste pacote devem ser copiados sobre a raiz do monorepo, preservando os caminhos.

## Correções aplicadas

1. Criado `.env.example` completo, com valores locais seguros e todos os campos de configuração usados pelo código documentados.
2. `scripts/setup-linux.sh` agora exige `.env.example` e `package-lock.json`, usa `npm ci` e não imprime senhas no terminal.
3. `scripts/reset-linux.sh` não apaga mais `package-lock.json`.
4. O seed não redefine mais senha, role, status, bloqueio ou motivo de bloqueio de um administrador já existente.
5. Em produção, `ADMIN_PASSWORD` só é exigida pelo seed quando a conta administrativa ainda precisa ser criada.
6. O seed recusa colisão quando `ADMIN_EMAIL` já pertence a uma conta não administrativa.
7. O aluno demo existente também tem senha/status preservados; o seed recusa colisão com conta de outro papel.
8. `LINUX-START.md` e `START-HERE.md` foram alinhados ao novo fluxo (`npm ci`, lockfile preservado e credenciais locais vindas do `.env`).

## Validações realizadas

- `bash -n` nos scripts alterados: OK.
- parsing/transpilação sintática do `seed.ts`: 0 erros.
- cruzamento das variáveis de ambiente usadas pelo código com `.env.example`: nenhuma variável detectada ficou sem documentação.

## Aplicação

Na raiz do projeto, substitua/crie os arquivos mantendo os caminhos. Depois, em ambiente local limpo:

```bash
npm run linux:setup
```

Em produção, não copie o `.env.example` sem revisar. Use secrets próprios, `NODE_ENV=production`, URLs HTTPS e as credenciais reais das integrações.

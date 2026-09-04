# Pacote cumulativo: Etapas 1 a 13

Este ZIP reúne as versões finais de todos os arquivos criados ou alterados nas 13 etapas de correção do Academy Play.

Ele foi preparado para ser extraído sobre a raiz do mesmo sistema dividido nos quatro ZIPs originais enviados para auditoria.

## O que este pacote preserva

- não contém o arquivo `.env`;
- não contém dump nem arquivos do PostgreSQL;
- não remove arquivos que não foram alterados;
- não apaga cursos, alunos, progresso, certificados ou integrações;
- não substitui o `package-lock.json`;
- não exige reset do ambiente;
- aplica somente migrations aditivas e índices.

O arquivo `.env.example` será atualizado, mas o seu `.env` real permanece intacto.

## Antes de aplicar

1. Faça backup da pasta atual do projeto.
2. Faça backup do PostgreSQL pelo procedimento já utilizado no servidor.
3. Guarde uma cópia do arquivo `.env`.
4. Pare temporariamente API, frontend e worker.
5. Não execute `npm run linux:reset`.

## Como aplicar

Extraia o conteúdo deste ZIP diretamente na raiz do projeto, mesclando as pastas e permitindo a substituição dos arquivos com o mesmo caminho.

Não apague a pasta atual do sistema antes da extração. Este é um pacote cumulativo de atualização, não uma cópia completa do projeto.

Depois execute:

```bash
cd /caminho/do/academy
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run test:typecheck
npm test
npm run build
```

Em seguida, reinicie API, frontend e worker pelo gerenciador utilizado no servidor.

Valide:

```bash
curl -i http://localhost:4000/health/live
curl -i http://localhost:4000/health/ready
```

O endpoint `health/live` deve retornar HTTP 200. O `health/ready` só retorna HTTP 200 quando banco, Redis, fila, worker, storage e configurações obrigatórias estão prontos.

## Migrations incluídas

| Migration | Alteração |
| --- | --- |
| `20260902120000_admin_audit_log` | Cria o histórico administrativo |
| `20260902143000_data_retention_indexes` | Adiciona índices para retenção e limpeza |
| `20260902170000_watch_progress_verification` | Adiciona a posição máxima validada da reprodução |

As migrations não removem tabelas, cursos, alunos, progresso ou certificados.

## Correções reunidas

1. Setup, reset e seed seguros.
2. Sincronização correta da TheMembers.
3. PostgreSQL e Redis sem exposição pública.
4. Revogação imediata de reprodução.
5. Jobs de produção sem fallback inline.
6. Healthchecks completos de produção.
7. Lifecycle de vídeos e assets órfãos.
8. Convite com tratamento de falha parcial.
9. Auditoria administrativa.
10. Retenção de dados operacionais.
11. Progresso real de vídeo.
12. Validação pública de certificados.
13. Validação matemática de CPF.

Os documentos `ETAPA-1-CORRECOES.md` até `ETAPA-13-CORRECOES.md` detalham cada alteração.

## Validação do pacote

O pacote foi aplicado sobre uma reconstrução limpa dos quatro ZIPs originais e verificado novamente.

Resultados obtidos:

- 102 arquivos finais no pacote cumulativo;
- 13 documentos de etapa presentes;
- zero divergências entre o pacote e a reconstrução usada nos testes;
- scripts de setup e reset aprovados por `bash -n`;
- todas as variáveis de configuração detectadas estão documentadas no `.env.example`;
- configuração de segurança do Docker Compose aprovada;
- `prisma validate` e `prisma generate` aprovados;
- arquivos gerados do Prisma idênticos aos arquivos regenerados;
- typecheck aprovado;
- 167 de 167 testes automatizados aprovados;
- build completo do frontend Next.js e da API NestJS aprovado;
- todas as sete migrations do projeto executadas em um banco PostgreSQL compatível e descartável;
- usuário, curso, aula, progresso, certificado e sessão de reprodução preservados após as migrations.

O download limpo das dependências por `npm ci` não pôde ser repetido no ambiente de validação por restrição de rede. Os testes e builds utilizaram uma instalação existente gerada pelo mesmo `package-lock.json`, cuja integridade foi comparada por SHA-256. Execute `npm ci` normalmente no servidor antes das demais validações.

Panda, Mux, TheMembers, Resend, S3/R2 e demais serviços externos não foram acionados com credenciais reais. A confirmação final dessas integrações deve ser feita no ambiente de staging ou produção após configurar o `.env`.

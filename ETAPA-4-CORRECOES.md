# Etapa 4 — Revogação imediata de reprodução

Esta etapa encerra reproduções ativas quando uma aula, curso ou matrícula deixa de autorizar o acesso ao vídeo.

## Correções aplicadas

### 1. Curso despublicado ou arquivado

Quando um curso muda de `PUBLISHED` para `DRAFT` ou `ARCHIVED`:

- `publishedAt` é removido;
- todas as sessões `ACTIVE` das aulas daquele curso passam para `BLOCKED`;
- `endedAt` é registrado;
- o motivo técnico fica como `course_unpublished`.

### 2. Aula despublicada

Quando uma aula publicada recebe `published=false`, somente as sessões ativas daquela aula são bloqueadas, com o motivo `lesson_unpublished`.

### 3. Sincronização TheMembers

A Etapa 2 já despublicava aulas bloqueadas ou removidas na origem. Agora a mesma transação também encerra as sessões ativas ligadas às aulas afetadas.

Conteúdo, progresso e histórico continuam preservados.

### 4. Heartbeat com revalidação de autorização

Cada heartbeat agora confirma novamente:

- se a sessão continua ativa;
- se o dispositivo não foi revogado;
- se a aula continua publicada;
- se o curso continua publicado;
- se a matrícula do aluno continua ativa, iniciada e dentro da validade.

Se uma dessas autorizações deixar de ser válida, a sessão é bloqueada e nenhum novo tempo assistido é contabilizado.

Aulas de preview e usuários `ADMIN` ou `INSTRUCTOR` continuam dispensados da matrícula, mas ainda respeitam a publicação da aula e do curso, de forma coerente com a autorização inicial do playback.

## Motivos técnicos registrados

- `course_unpublished`
- `lesson_unpublished`
- `course_access_inactive`
- `source_content_unavailable`

## Arquivos alterados

- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/video/playback-session.service.ts`
- `apps/api/src/integrations/themembers.service.ts`
- `apps/api/test/themembers-courses.test.ts`
- `apps/api/test/playback-revocation.test.ts`

## Banco e ambiente

- Nenhuma alteração no schema Prisma.
- Nenhuma migration necessária.
- Nenhuma nova variável de ambiente.
- Nenhum conteúdo, progresso ou histórico é removido.

## Validação

Execute:

```bash
npm ci
npm run test:typecheck
npm run test:api
npm run build
```

Depois do deploy, valide em staging:

1. inicie um vídeo com uma conta de aluno;
2. despublique a aula;
3. confirme que o player perde a autorização no heartbeat seguinte;
4. repita publicando a aula e despublicando o curso;
5. repita com uma matrícula cancelada ou expirada.

O backend encerra a sessão no momento da alteração administrativa. O heartbeat é a confirmação para o player já aberto, respeitando o intervalo configurado em `WATCH_SESSION_HEARTBEAT_SEC`.

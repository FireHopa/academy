# Etapa 11: progresso real de vídeo

Esta etapa corrige a possibilidade de acumular `watchedSec` mantendo o heartbeat ativo com o vídeo parado e depois enviando uma posição próxima ao final.

## Regra anterior

O backend creditava o tempo transcorrido desde o último heartbeat, limitado a duas vezes o intervalo configurado. A posição do vídeo era armazenada, mas não participava do cálculo.

Assim, uma página aberta e pausada podia continuar aumentando `watchedSec`.

## Nova regra

O servidor calcula:

```text
tempo válido = mínimo entre:
  tempo transcorrido limitado
  avanço positivo da posição
```

Antes de creditar, o avanço precisa caber em:

```text
tempo transcorrido x velocidade máxima + tolerância de busca
```

Com os valores padrão, um intervalo real de 20 segundos aceita avanço plausível de até 45 segundos. Isso cobre reprodução em 2x e pequenas diferenças de arredondamento.

| Situação | Atualiza posição | Credita `watchedSec` |
| --- | --- | --- |
| Reprodução normal | Sim | Sim |
| Reprodução em 2x | Sim | Somente o tempo real |
| Vídeo pausado | Sim | Não |
| Retrocesso | Sim | Não naquele heartbeat |
| Busca grande para frente | Sim | Não naquele heartbeat |
| Posição acima da duração | Limitada à duração | Somente avanço plausível |
| Heartbeat sem posição | Não | Não |

## Conclusão da aula

Para um aluno concluir uma videoaula, o backend exige:

1. posição solicitada de pelo menos 92%;
2. maior `maxCreditedPositionSec` de pelo menos 92%, atualizado somente com avanço válido;
3. soma de `watchedSec` de pelo menos 45% da duração.

Administradores e instrutores mantêm o comportamento anterior para testes e revisão de conteúdo.

O frontend envia um heartbeat final antes do pedido de conclusão. Isso evita que o vídeo termine entre dois intervalos periódicos sem registrar a posição final.

## Concorrência

Cada heartbeat adquire um lock transacional por sessão antes de ler e atualizar `WatchSession`. Dois pedidos simultâneos não conseguem usar a mesma posição anterior nem duplicar o crédito.

Bloqueios por curso despublicado, aula despublicada ou matrícula inativa são gravados dentro da transação e o erro HTTP é lançado somente depois do commit.

## Retomada

Quando o aluno abre novamente uma aula incompleta, a nova `WatchSession` recebe como posição inicial o progresso já salvo. O primeiro heartbeat após a retomada não é confundido com uma busca desde o segundo zero.

## Configuração

```env
WATCH_SESSION_HEARTBEAT_SEC=20
WATCH_SESSION_STALE_SEC=75
WATCH_PROGRESS_MAX_PLAYBACK_RATE=2
WATCH_PROGRESS_SEEK_TOLERANCE_SEC=5
```

Limites aceitos pelo backend:

- velocidade máxima: 1x a 4x;
- tolerância: 0 a 30 segundos;
- heartbeat: 10 a 60 segundos.

## Limitação técnica

Um cliente modificado ainda pode tentar simular uma reprodução válida enviando posições progressivas no ritmo permitido. Sem telemetria assinada pelo provedor de vídeo, nenhum navegador consegue provar matematicamente que uma pessoa assistiu ao conteúdo.

A nova regra remove a fraude trivial de página pausada, saltos grandes e chamadas diretas apenas ao endpoint de progresso. DRM, watermark, sessão, ritmo plausível e posição confirmada continuam funcionando como camadas complementares.

## Banco de dados

A migration `20260902170000_watch_progress_verification` adiciona `maxCreditedPositionSec` à `WatchSession`, com zero como valor padrão. Nenhuma sessão, progresso ou certificado existente é removido ou redefinido.

Após aplicar os arquivos:

```bash
npm run db:generate
npm run db:migrate:deploy
```

## Arquivos desta etapa

- `.env.example`
- `README.md`
- `TESTING-V10.md`
- `ETAPA-11-CORRECOES.md`
- `prisma/schema.prisma`
- `prisma/migrations/20260902170000_watch_progress_verification/migration.sql`
- arquivos atualizados do Prisma Client em `apps/api/src/generated/prisma/`
- `apps/api/src/video/playback-session.service.ts`
- `apps/api/src/video/video.service.ts`
- `apps/api/src/progress/progress.service.ts`
- `apps/web/components/secure-player.tsx`
- `apps/api/test/playback-limits.test.ts`
- `apps/api/test/playback-revocation.test.ts`
- `apps/api/test/progress-certificate.test.ts`
- `apps/api/test/panda-playback.test.ts`

## Validações

- TypeScript de API e testes: OK.
- Testes automatizados: 155/155.
- Prisma schema validate: OK.
- Build da API: OK.
- Build do frontend: OK.
- Estrutura e conteúdo do ZIP: OK.

O comportamento Panda e Mux real, incluindo pausa, busca, retomada, velocidade 2x e término, deve ser repetido em staging com vídeos dos dois provedores.

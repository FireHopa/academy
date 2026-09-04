# Etapa 7: lifecycle de vídeos e assets órfãos

Esta etapa impede que desvinculações e exclusões deixem registros abandonados indefinidamente ou assets Mux gerando custo sem uso.

## Política aplicada

### Panda

- o vídeo remoto nunca é apagado automaticamente;
- após o período de segurança, somente o `VideoAsset` local sem aulas é removido;
- o vídeo continua disponível na Biblioteca Panda e pode ser vinculado novamente.

### Mux criado pelo Academy

- novos assets vindos do fluxo de upload direto recebem uma marca de propriedade no metadata;
- após o período de segurança, o worker confirma novamente que não existe aula vinculada;
- o asset remoto é removido primeiro;
- o registro local só é removido depois do sucesso remoto;
- HTTP 404 do Mux é aceito como asset já removido.

### Mux antigo sem marca de propriedade

- não é apagado automaticamente;
- aparece na contagem `muxManualReview`;
- pode ser incluído na limpeza somente após revisão e ativação explícita de `VIDEO_ASSET_CLEANUP_DELETE_UNMARKED_MUX=true`.

## Proteções contra exclusão acidental

- carência padrão de 24 horas;
- substituição ou remoção de vídeo reinicia a carência;
- exclusão de aula, módulo ou curso reinicia a carência antes do cascade;
- o job consulta novamente o vínculo imediatamente antes de chamar o Mux;
- falha externa preserva o registro para nova tentativa;
- retorno do job contém somente contagens e não expõe IDs, URLs ou erros do provedor;
- processamento limitado a 100 registros por execução por padrão.

## Job periódico

O worker registra automaticamente:

```text
video-assets.cleanup
```

Intervalo padrão: 24 horas.

Configuração:

```env
VIDEO_ASSET_CLEANUP_ENABLED=true
VIDEO_ASSET_CLEANUP_INTERVAL_MS=86400000
VIDEO_ASSET_ORPHAN_GRACE_HOURS=24
VIDEO_ASSET_CLEANUP_BATCH_SIZE=100
VIDEO_ASSET_CLEANUP_DELETE_UNMARKED_MUX=false
```

## Endpoints administrativos

```text
GET  /api/admin/integrations/video-assets/lifecycle
POST /api/admin/integrations/video-assets/cleanup
```

O diagnóstico informa:

- total de assets órfãos;
- total já elegível pela carência;
- total Panda;
- total Mux;
- Mux marcado como pertencente ao Academy;
- Mux antigo que exige revisão manual.

A execução manual é enviada à fila. Em produção, ela nunca roda dentro da requisição HTTP.

## Arquivos alterados ou criados

- `.env.example`
- `README.md`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/integrations/integrations.controller.ts`
- `apps/api/src/jobs/job-processor.service.ts`
- `apps/api/src/jobs/job-worker.service.ts`
- `apps/api/src/jobs/jobs.types.ts`
- `apps/api/src/video/providers/mux-video.provider.ts`
- `apps/api/src/video/video-asset-lifecycle.service.ts`
- `apps/api/src/video/video.module.ts`
- `apps/api/src/video/video.service.ts`
- `apps/api/test/course-deletion.test.ts`
- `apps/api/test/performance-stage3.test.ts`
- `apps/api/test/video-lifecycle.test.ts`

## Banco e dados

- nenhuma alteração no schema Prisma;
- nenhuma migration;
- nenhum vídeo existente é apagado durante a aplicação do ZIP;
- Mux antigo permanece preservado por padrão;
- a primeira limpeza só ocorre pelo worker ou pela execução manual e respeita a carência configurada.

## Aplicação

Copie os arquivos mantendo os caminhos do ZIP e execute:

```bash
npm ci
npm run test:typecheck
npm run test:api
npm run build
```

Reinicie primeiro o worker e depois a API.

Antes de permitir a exclusão de Mux antigos sem marca, consulte:

```bash
curl -b cookies.txt http://localhost:4000/api/admin/integrations/video-assets/lifecycle
```

Mantenha `VIDEO_ASSET_CLEANUP_DELETE_UNMARKED_MUX=false` até revisar os ativos antigos e confirmar que todos foram criados pelo Academy.

# Academy Play V10-010 a V10-013 — Panda Video, DRM e diagnóstico

## Escopo concluído

A V10-010 finaliza em código a autenticação da API, biblioteca, busca, vínculo, metadados, status, playback e webhook Panda. A V10-011 torna o DRM obrigatório em produção e endurece a watermark individual. A V10-012 adiciona o diagnóstico operacional no admin. A V10-013 alinha a comunicação do editor ao fluxo Panda sem remover o fallback Mux.

Nenhuma variável nova foi criada. Os valores reais devem existir somente no ambiente seguro do servidor e nunca no repositório.

## Contrato de segurança

- `PANDA_API_KEY` e `PANDA_DRM_GROUP_SECRET` existem somente no processo da API.
- O token da API é enviado ao Panda no header `Authorization`, sem prefixo `Bearer`.
- A API não segue redirecionamentos e encerra chamadas externas após 10 segundos.
- Mensagens e corpos de erro externos não são repassados ao navegador.
- A Biblioteca Panda devolve somente ID interno, título, thumbnail, duração e status.
- URL HLS, player bruto, ID externo, ID de biblioteca e API Key não são devolvidos pela biblioteca administrativa.
- O player é criado somente após autenticação, matrícula, dispositivo e sessão válidos.
- O endpoint de autorização usa `Cache-Control: no-store, private`.
- O JWT DRM usa `HS256`, expiração limitada entre 30 minutos e 24 horas e os campos oficiais `drm_group_id`, `string1`, `string2` e `string3`.
- A watermark contém nome, e-mail e ID completo do aluno, com caracteres de controle removidos.
- O parâmetro `watermark` só é anexado a `player.pandavideo.com.br` ou a um subdomínio oficial `*.tv.pandavideo.com.br` no caminho `/embed/`.
- `PANDA_REQUIRE_DRM=false`, ausente ou inválido impede a inicialização com Panda em produção.
- O webhook falha fechado quando `PANDA_WEBHOOK_TOKEN` não está configurado.
- O diagnóstico administrativo não devolve API Key, secrets, URL de player ou mensagens externas.

## Painel de diagnóstico

O painel fica em `Admin -> Integrações -> Panda` e consulta:

```http
GET /api/admin/integrations/panda/diagnostics
```

A rota exige administrador e responde com `Cache-Control: no-store, private`:

```json
{
  "panda": {
    "connected": true,
    "drm_enabled": true,
    "webhook_configured": true,
    "videos_linked": 12,
    "processing_videos": 2,
    "error_videos": 1
  }
}
```

`connected` executa uma consulta real e segura à API Panda. Os demais estados de configuração são calculados no backend. Os três contadores consultam o banco local e incluem somente vídeos Panda vinculados a pelo menos uma aula. `processing_videos` agrega `UPLOADING` e `PROCESSING`.

O botão `Testar conexão` usa `POST /api/admin/integrations/panda/test`, atualiza todo o diagnóstico e não repete a chamada externa depois de um teste bem-sucedido. Falha da Panda aparece como conexão offline. Falha do banco torna o diagnóstico indisponível, evitando contadores falsos.

## Comunicação do editor

Em `Admin -> Cursos -> Conteúdo do curso`, a orientação principal usa Biblioteca Panda, DRM/Watermark e autorização por sessão. Os textos antigos de upload direto, asset ID e playback ID do Mux não aparecem mais como fluxo padrão.

Essa alteração é somente visual. O uploader, o player, as rotas, o provider e os webhooks Mux continuam preservados para fallback técnico e vídeos legados.

## Configuração obrigatória

Obtenha o ID e o secret no painel Panda, em `Security → Integrate DRM → API`, e configure no gerenciador de segredos da VPS:

```env
VIDEO_PROVIDER="panda"
PANDA_API_KEY="VALOR-REAL-SOMENTE-NO-SERVIDOR"
PANDA_FOLDER_ID="UUID-DA-PASTA"
PANDA_DRM_GROUP_ID="UUID-DO-GRUPO-DRM"
PANDA_DRM_GROUP_SECRET="SECRET-DO-GRUPO-DRM"
PANDA_REQUIRE_DRM=true
PANDA_WATERMARK_TTL_SEC=28800
PANDA_WEBHOOK_TOKEN="TOKEN-ALEATORIO-LONGO"
```

`PANDA_DRM_GROUP_ID` deve ser um UUID válido. `PANDA_WATERMARK_TTL_SEC` é normalizado pela aplicação para o intervalo de 1.800 a 86.400 segundos.

## Conteúdo da watermark

O backend assina o token no momento da autorização:

```text
string1 = Nome: NOME DO ALUNO
string2 = E-mail: EMAIL DO ALUNO
string3 = ID: ID COMPLETO DO ALUNO
```

O JWT é enviado ao player no parâmetro `watermark`. O `drm_group_id` permanece como claim do token, conforme o contrato Panda, e não é duplicado como parâmetro de URL ou campo da resposta JSON.

## Matriz de aceite

| Item do plano | Implementação | Validação antes da produção |
| --- | --- | --- |
| API Key | Header criado exclusivamente no backend | Testar conexão no admin |
| Biblioteca | `GET /api/admin/integrations/panda/videos` | Conferir vídeos da conta/pasta |
| Busca | Título, status e paginação | Buscar um título real e navegar páginas |
| Vinculação | `POST /api/admin/lessons/:id/video/panda/attach` | Vincular vídeo pronto a uma aula |
| Thumbnail | Normalizada e persistida no `VideoAsset` | Conferir card e editor |
| Duração | Arredondada em segundos e persistida | Comparar com o dashboard Panda |
| Status | Mapeamento seguro para Academy | Testar CONVERTING, CONVERTED e FAILED |
| Playback | Player oficial liberado por sessão | Assistir como aluno matriculado |
| Webhook | Token obrigatório e atualização idempotente | Alterar status no Panda e conferir aula |
| DRM | Obrigatório e fail-closed em produção | Confirmar reprodução com grupo real |
| Watermark | Nome, e-mail e ID completo no JWT e na camada visual | Confirmar os três campos no player real |
| Diagnóstico | Seis indicadores e teste de conexão no admin | Comparar conexão e contadores com Panda e banco reais |

## Checklist de staging

1. Conclua a validação funcional da V10-010 com conta, pasta, vídeo e webhook reais.
2. Crie ou selecione o grupo DRM no painel Panda e confirme que o vídeo de teste está protegido por ele.
3. Copie o Group ID e o secret para o ambiente seguro de staging.
4. Configure `PANDA_REQUIRE_DRM=true` e reinicie a API.
5. Confirme `GET /health` com `panda_configuration: true`.
6. Abra `Admin -> Integrações -> Panda` e confirme conexão online, DRM ativo e webhook configurado.
7. Vincule um vídeo `CONVERTED` e acesse a aula com um aluno matriculado.
8. Confirme visualmente nome, e-mail e ID do aluno na watermark Panda.
9. Confirme que outro aluno recebe uma watermark diferente.
10. Teste acesso sem matrícula, conta bloqueada, limite de dispositivos e reprodução concorrente.
11. Confirme que a resposta de playback usa `Cache-Control: no-store, private` e não contém API Key nem secret.
12. Provoque uma credencial DRM inválida em ambiente controlado e confirme que o player não é liberado.
13. Compare os contadores de vídeos vinculados, processando e com erro com os registros reais da Academy.
14. Use `Testar conexão`, confirme a atualização dos seis indicadores e verifique que nenhuma credencial aparece na resposta.
15. Restaure a credencial, valide novamente o healthcheck e só então replique a configuração em produção.

## Rollback controlado

Fora de produção, `PANDA_REQUIRE_DRM=false` mantém um caminho explícito para diagnóstico. Em produção, esse valor impede a inicialização da API por decisão de segurança. Um rollback de provedor exige `VIDEO_PROVIDER=mux` e toda a configuração Mux válida.

## Fontes oficiais usadas

- https://docs.pandavideo.com/reference/list-videos
- https://docs.pandavideo.com/reference/get-video-properties
- https://docs.pandavideo.com/reference/webhook-call-example
- https://docs.pandavideo.com/reference/player-api
- https://docs.pandavideo.com/reference/receive-events
- https://docs.pandavideo.com/reference/send-events
- https://help.pandavideo.com/en-us/article/how-to-integrate-panda-videos-drm-via-api-lne5eb/

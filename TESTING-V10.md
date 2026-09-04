# Academy Play V10 — Testes críticos e de integração

Este documento registra a suíte iniciada na `TASK V10-002` e ampliada continuamente pelas etapas de segurança, integrações, operação e auditoria. A suíte possui 167 cenários automatizados.

## Comandos

```bash
npm test
npm run test:typecheck
npm run test:api:coverage
```

O comando de cobertura falha se o conjunto importado ficar abaixo de 50% em linhas, branches ou funções.

## Matriz de aceite

| Fluxo crítico | Cenário positivo | Cenário negativo | Arquivo |
| --- | --- | --- | --- |
| Login | Credencial bcrypt válida, e-mail normalizado e `lastLoginAt` atualizado | Senha incorreta sem atualização | `auth-flows.test.ts` |
| Logout | Cookie `academy_session` removido com domínio correto | Operação idempotente sem sessão/domínio | `auth-flows.test.ts` |
| Usuário bloqueado | Sessão ativa e `sessionVersion` compatível | Conta bloqueada rejeitada mesmo com token anterior | `auth-flows.test.ts` |
| Matrícula | Acesso manual ativo com datas válidas | Expiração anterior ao início rejeitada | `access-flows.test.ts` |
| Matrícula expirada | Matrícula ativa libera recursos | Matrícula `ACTIVE` vencida é bloqueada | `access-flows.test.ts` |
| Curso sem acesso | Aula preview não exige matrícula | Aula regular sem matrícula é bloqueada | `access-flows.test.ts` |
| Progresso | Posição é normalizada e persistida | Aluno sem acesso não grava progresso | `progress-certificate.test.ts` |
| Conclusão | Posição creditada ≥92% e tempo creditado ≥45% concluem | Posição enviada somente ao progresso é ignorada | `progress-certificate.test.ts` |
| Certificado | Todas as aulas publicadas concluídas emitem certificado | Aula pendente impede emissão | `progress-certificate.test.ts` |
| Validação pública de certificado | Código legado ou novo retorna somente nome, curso, data e código | Código malformado ou inexistente retorna resposta negativa uniforme | `certificate-verification.test.ts` |
| CPF | Valor válido com ou sem máscara é normalizado | Dígitos incorretos, repetidos, incompletos ou misturados são rejeitados antes do banco | `cpf-validation.test.ts` |
| Limite de dispositivos | Novo dispositivo abaixo do máximo é autorizado | Terceiro dispositivo é bloqueado | `playback-limits.test.ts` |
| Limite de streams | Sessão inicia sem reprodução concorrente | Outra reprodução ativa gera conflito | `playback-limits.test.ts` |
| Takeover | Outras sessões são bloqueadas e uma nova é criada | Takeover não contorna limite de dispositivos | `playback-limits.test.ts` |
| Panda playback | URL por sessão com DRM/watermark e sem API key | DRM obrigatório sem configuração falha fechado | `panda-playback.test.ts` |
| Panda DRM em produção | Flag, UUID e credenciais completas autorizam o boot | Flag falsa, credencial ausente ou UUID inválido bloqueiam | `panda-playback.test.ts` |
| Diagnóstico Panda | Conexão, configuração e contadores vinculados são consolidados | Falha externa marca offline e falha do banco não vira zero | `panda-diagnostics.test.ts` |
| Comunicação do provider | Editor orienta Biblioteca Panda e DRM/Watermark | Textos Mux antigos não reaparecem e fallback continua funcional | `provider-visual-copy.test.ts` |
| Webhook TheMembers | Produto mapeado cria grant e matrícula | Assinatura ou JSON inválidos são rejeitados | `themembers-webhook.test.ts` |
| TheMembers ponta a ponta | Compra libera os cursos na biblioteca | Cancelamento recalcula grants e bloqueia somente o acesso perdido | `themembers-e2e.test.ts` |
| Webhook duplicado | Segunda entrega não concede acesso novamente | Evento `FAILED` continua elegível para reprocessamento | `themembers-webhook.test.ts` |
| Recuperação de senha | Token aleatório é salvo somente como hash e enviado | E-mail inexistente não vaza cadastro; token inválido é rejeitado | `auth-flows.test.ts` |
| Auditoria administrativa | Ação concluída registra ator, request ID e estados | Falha de negócio não cria sucesso falso e dados sensíveis são removidos | `audit-log.test.ts` |
| Retenção operacional | Histórico vencido é removido em lotes e payload `raw` é limpo | Sessões ativas e webhooks pendentes nunca entram na seleção | `data-retention.test.ts` |
| Crédito de reprodução | Avanço normal e até 2x credita apenas o tempo transcorrido | Pausa, retrocesso e salto não aumentam `watchedSec` | `playback-revocation.test.ts` |

## Cobertura adicionada na V10-010

Os 17 cenários de `panda-integration.test.ts`, complementados por `panda-playback.test.ts`, validam:

- API Key somente no header enviado pelo backend;
- filtros, paginação e escopo por pasta;
- thumbnail, duração e estados oficiais;
- remoção de player, HLS e IDs externos da resposta da biblioteca;
- erros externos e falhas de rede sem vazamento;
- vínculo e rejeição de vídeos com erro;
- DTOs e UUIDs;
- token, atualização e fallback do webhook;
- player HTTPS, DRM e os três campos da watermark.

## Cobertura adicionada na V10-011

Cinco novos cenários em `panda-playback.test.ts` validam:

- DRM obrigatório por padrão e configuração parcial bloqueada;
- sanitização de nome, e-mail e ID completo antes da assinatura;
- bloqueio de host HTTPS não oficial e ID externo inválido;
- rollback explícito sem watermark apenas fora de produção;
- validação de produção para flag, credenciais e UUID do grupo DRM.

Os testes também conferem algoritmo `HS256`, expiração, ausência do secret, ausência do parâmetro redundante `drm_group_id` e encerramento da sessão quando o provedor não autoriza o playback.

## Cobertura adicionada na V10-012

Seis cenários em `panda-diagnostics.test.ts` validam:

- conexão Panda consultada em tempo real quando a API está configurada;
- falha externa convertida em `connected: false`, sem vazar mensagem remota;
- ausência de chamada externa quando a API Panda não está configurada;
- contagem somente de vídeos Panda vinculados a pelo menos uma aula;
- `UPLOADING` e `PROCESSING` agregados no indicador de processamento;
- falha do banco propagada, sem apresentar zero enganoso;
- botão de teste reutilizando a conexão já validada;
- rota administrativa `GET`, protegida, privada e sem cache.

Após a V10-012, a cobertura global medida é 63,64% de linhas, 70,63% de branches e 69,75% de funções.

## Cobertura adicionada na V10-013

Dois cenários em `provider-visual-copy.test.ts` validam:

- presença da orientação para Biblioteca Panda, DRM/Watermark e autorização por sessão;
- ausência dos textos antigos de upload direto e vídeo protegido pelo Mux;
- seleção de `MUX` pelo backend quando o fallback é configurado;
- criação funcional do Direct Upload Mux e persistência do estado `UPLOADING`.

Após a V10-013, a cobertura global medida é 64,26% de linhas, 70,17% de branches e 70,25% de funções.

## Cobertura adicionada na V10-020

Quatro cenários em `themembers-e2e.test.ts` validam:

- payload oficial entrando pelo controller do Checkout com token válido;
- compra criando aluno, cliente, assinatura, grants e matrículas;
- cursos concedidos aparecendo na biblioteca do aluno;
- cancelamento preservando curso compartilhado por outro produto;
- cancelamento preservando matrícula manual válida;
- bloqueio seletivo das sessões sem acesso efetivo;
- reentrega idempotente sem registros duplicados.

Após a V10-020, a cobertura global medida é 67,84% de linhas, 73,22% de branches e 73,50% de funções. O serviço TheMembers alcança 73,41% de linhas e o controller de webhook, 100%.

## Cobertura adicionada na Etapa 9

Seis cenários em `audit-log.test.ts` validam:

- remoção de senhas, tokens, CPF, telefone e parâmetros assinados;
- captura do administrador, IP, navegador e request ID;
- estados anterior e posterior das entidades alteradas;
- ausência de registro de sucesso quando a operação falha;
- filtros, período e paginação da consulta;
- rota exclusiva para administradores, privada e sem cache;
- migration, relação opcional do ator e índices operacionais.

## Cobertura adicionada na Etapa 10

Cinco cenários em `data-retention.test.ts` validam:

- proteção explícita de sessões `ACTIVE` e webhooks `RECEIVED`;
- exclusão separada de webhooks processados e falhos conforme seus prazos;
- limpeza do payload `raw` sem excluir cliente ou assinatura normalizados;
- limites de lote e de lotes por execução;
- exposição das políticas e totais protegidos no diagnóstico administrativo;
- encaminhamento correto do job periódico pelo processador;
- rotas administrativas privadas e solicitação manual registrada para auditoria.

## Cobertura adicionada na Etapa 11

Oito novos cenários validam:

- posição de retomada transferida para a nova sessão;
- avanço normal creditado conforme o tempo transcorrido;
- vídeo pausado sem incremento de `watchedSec`;
- salto para frente sem crédito artificial;
- retrocesso sem crédito e retomada a partir da posição nova;
- reprodução em 2x limitada ao tempo real;
- posição do heartbeat limitada à duração conhecida;
- conclusão recusada quando os 92% não foram confirmados por heartbeat;
- lock por sessão executado antes do cálculo e da atualização;
- migration aditiva da posição máxima creditada.

## Cobertura adicionada na Etapa 12

Seis novos cenários em `certificate-verification.test.ts` validam:

- normalização de letras e espaços em códigos legados;
- compatibilidade com o novo código de 64 bits;
- seleção mínima de dados sem e-mail, IDs internos ou slug;
- uso do título comum quando o título específico do certificado não existe;
- resposta negativa uniforme e ausência de consulta ao banco para formato inválido;
- rota pública `GET`, sem cache e limitada a 10 consultas por minuto;
- páginas públicas fora do matcher de autenticação e links de acesso no login e no certificado privado.

## Cobertura adicionada na Etapa 13

Seis novos cenários em `cpf-validation.test.ts` validam:

- CPF válido com e sem máscara;
- normalização para exatamente 11 dígitos;
- rejeição de dígitos verificadores incorretos;
- rejeição de sequências repetidas, tamanho incorreto e caracteres estranhos;
- transformação e mensagem específica no DTO;
- bloqueio defensivo dentro do serviço antes de consultar ou gravar no banco;
- permanência da máscara, validação e normalização já existentes no frontend.

## Estratégia

- runner nativo do Node.js;
- TypeScript executado com `tsx` como loader;
- serviços reais da aplicação;
- dependências externas e Prisma substituídos por doubles controlados;
- nenhuma chamada para Panda, TheMembers, Resend ou banco de produção;
- testes de efeitos observáveis, incluindo gravações, bloqueios e idempotência;
- testes de produção excluídos do build NestJS por `apps/api/tsconfig.json`.

## Escopo desta suíte

Esta é a suíte mínima rápida para cada alteração e para CI. Ela valida as regras de negócio sem exigir infraestrutura externa.

Antes da produção, continue mantendo testes de staging para:

1. migrations em uma cópia restaurada do PostgreSQL;
2. Panda DRM e watermark com conta real;
3. TheMembers com webhook de sandbox/tenant;
4. Resend com domínio de teste;
5. fluxo HTTP completo atrás do proxy reverso.

Esses testes externos complementam a suíte e não devem usar credenciais em arquivos versionados.

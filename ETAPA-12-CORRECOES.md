# Etapa 12: validação pública de certificados

Esta etapa transforma o código de autenticidade do certificado em uma verificação utilizável por empresas e terceiros, sem exigir conta ou sessão na plataforma.

## Novas rotas

```text
GET /api/certificates/verify/:code

/verify-certificate
/verify-certificate/[code]
```

A página sem código exibe o formulário de consulta. A página com código executa a validação e pode ser compartilhada diretamente.

## Dados públicos

Quando o código existe, a API retorna somente:

- código;
- nome do aluno;
- título do curso ou título específico do certificado;
- data de emissão.

A consulta ao Prisma seleciona exclusivamente esses campos. E-mail, CPF, telefone, ID do aluno, ID e slug do curso, matrícula e demais dados internos não são carregados.

## Proteções

| Proteção | Comportamento |
| --- | --- |
| Autenticação | A rota é explicitamente pública |
| Rate limit | 10 consultas por IP a cada 60 segundos |
| Cache | `Cache-Control: no-store` |
| Código malformado | Retorna `{ valid: false, certificate: null }` sem consultar o banco |
| Código inexistente | Usa exatamente a mesma resposta negativa |
| Indexação | As páginas usam `noindex, nofollow` |
| Sessão do aluno | A página privada `/certificate/[code]` continua protegida |

A resposta negativa uniforme evita diferenciar erro de formato de registro inexistente. O rate limit usa o tracker global da API, que identifica visitantes públicos pelo endereço IP.

## Códigos novos e compatibilidade

O formato visual permanece:

```text
CERT-ANO-IDENTIFICADOR
```

Certificados antigos possuem 10 caracteres hexadecimais no identificador e continuam aceitos. As novas emissões usam 16 caracteres hexadecimais, aumentando a aleatoriedade de 40 para 64 bits.

Nenhum certificado existente precisa ser alterado ou reemitido.

## Experiência de uso

- o login agora oferece o link `Validar um certificado`;
- a página privada do certificado oferece `Validar publicamente`;
- o formulário normaliza letras minúsculas para maiúsculas;
- um resultado válido mostra nome, curso, emissão e código;
- falhas temporárias de rede são diferenciadas de certificado não encontrado.

## Banco de dados

Esta etapa não altera o schema e não possui migration.

## Arquivos desta etapa

- `ETAPA-12-CORRECOES.md`
- `README.md`
- `TESTING-V10.md`
- `apps/api/src/experience/certificate-verification.controller.ts`
- `apps/api/src/experience/experience.module.ts`
- `apps/api/src/experience/experience.service.ts`
- `apps/api/src/progress/progress.service.ts`
- `apps/api/test/certificate-verification.test.ts`
- `apps/api/test/progress-certificate.test.ts`
- `apps/web/app/certificate/[code]/page.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/login/page.tsx`
- `apps/web/app/verify-certificate/layout.tsx`
- `apps/web/app/verify-certificate/page.tsx`
- `apps/web/app/verify-certificate/[code]/page.tsx`
- `apps/web/components/certificate-verifier.tsx`

## Validações executadas

- TypeScript da API e dos testes: OK.
- Testes automatizados: 161/161.
- Build da API NestJS: OK.
- Build do frontend Next.js: OK.
- Rotas `/verify-certificate` e `/verify-certificate/[code]` confirmadas no build.
- Estrutura e conteúdo do ZIP: OK.

O deploy desta etapa exige apenas a atualização da API e do frontend. Não execute migration exclusivamente por causa desta etapa.

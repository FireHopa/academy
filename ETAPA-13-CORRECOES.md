# Etapa 13: validação matemática de CPF

Esta etapa fecha a possibilidade de cadastrar um aluno com qualquer sequência de 11 números no campo CPF.

## Problema anterior

O DTO validava somente este formato:

```text
11 caracteres numéricos
```

Por isso, valores como `00000000000` ou CPFs com dígitos verificadores incorretos podiam passar pela API. O frontend já possuía uma validação matemática, mas uma chamada direta ao backend conseguia ignorá-la.

## Nova regra

O backend agora exige simultaneamente:

1. exatamente 11 dígitos após remover máscara e espaços;
2. ausência de sequência com todos os dígitos iguais;
3. primeiro dígito verificador correto;
4. segundo dígito verificador correto;
5. ausência de letras ou símbolos que não façam parte da máscara comum.

São aceitos:

```text
52998224725
529.982.247-25
```

O valor persistido continua normalizado, sem pontos ou hífen.

## Dupla proteção

| Camada | Função |
| --- | --- |
| Frontend | Máscara, retorno imediato ao administrador e envio normalizado |
| DTO | Normalização e rejeição antes de entrar no controller |
| Serviço | Verificação defensiva antes de qualquer consulta ou gravação |
| PostgreSQL | Restrição `unique` continua impedindo CPF duplicado |

A validação no serviço protege chamadas internas e testes que não atravessam o `ValidationPipe` do NestJS.

## Compatibilidade com dados existentes

Esta etapa não executa limpeza automática, não remove CPFs e não altera o schema.

Se já existir um CPF inválido no banco, a conta continua funcionando normalmente. A nova regra atua somente quando um CPF é enviado para um novo cadastro. Isso evita bloquear alunos por dados históricos sem revisão humana.

## Respostas da API

| Situação | Resposta |
| --- | --- |
| CPF válido e ainda não utilizado | Cadastro continua normalmente |
| CPF matematicamente inválido | `400 Bad Request` com `CPF inválido` |
| CPF válido já cadastrado | `409 Conflict` com a mensagem de duplicidade existente |
| CPF ausente | Cadastro continua, pois o campo permanece opcional |

## Banco de dados

Não existe migration nesta etapa.

## Arquivos desta etapa

- `ETAPA-13-CORRECOES.md`
- `README.md`
- `TESTING-V10.md`
- `apps/api/src/common/cpf.ts`
- `apps/api/src/admin/dto/student.dto.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/test/cpf-validation.test.ts`

## Validações

- TypeScript da API e dos testes: OK.
- Testes específicos de CPF e cadastro: 11/11.
- Suíte automatizada completa: 167/167.
- Build da API NestJS: OK.
- Build do frontend Next.js: OK.
- Estrutura e conteúdo do ZIP: OK.

O deploy exige apenas a atualização da API. O frontend foi validado porque já possui a mesma regra, mas não precisou ser alterado nesta etapa.

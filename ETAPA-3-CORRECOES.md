# Etapa 3 — Proteção do PostgreSQL e Redis

Esta etapa elimina a exposição direta das portas do PostgreSQL e Redis na rede pública sem interromper o acesso da API e do worker executados no próprio servidor.

## Correções aplicadas

### 1. Portas restritas ao servidor local

Antes:

```yaml
5432:5432
6379:6379
```

Nesse formato, o Docker pode publicar os serviços em todas as interfaces de rede do servidor.

Agora:

```yaml
127.0.0.1:5432:5432
127.0.0.1:6379:6379
```

PostgreSQL e Redis continuam disponíveis para os processos locais, mas não aceitam conexão direta pelo IP público da VPS.

### 2. Healthcheck do Redis

O Redis agora possui healthcheck com `redis-cli ping`. O PostgreSQL já possuía healthcheck e recebeu um período inicial de tolerância.

### 3. Reinício automático

Os dois serviços usam `restart: unless-stopped`, permitindo recuperação automática após reinício do Docker ou da VPS, salvo quando o serviço tiver sido interrompido manualmente.

### 4. Restrição de privilégios

Os containers usam `no-new-privileges:true`, impedindo que processos adquiram privilégios adicionais dentro do container.

### 5. Teste contra regressão

Foi incluído o comando:

```bash
npm run test:infra-security
```

Ele reprova se PostgreSQL ou Redis voltarem a ser publicados sem o endereço `127.0.0.1` e também verifica os healthchecks.

## Arquivos alterados

- `docker-compose.yml`
- `package.json`
- `scripts/test-compose-security.mjs`

## Banco de dados

Esta etapa não altera volumes, dados, schema Prisma ou credenciais existentes. Não exige migration e não recria os containers com `down -v`.

## Aplicação segura

Copie os arquivos mantendo os caminhos do ZIP e execute:

```bash
npm run test:infra-security
docker compose config
docker compose up -d postgres redis
docker compose ps
```

Não execute `docker compose down -v`, pois a opção `-v` remove os volumes locais.

## Verificação no servidor

Após recriar os containers, confirme os bindings:

```bash
docker compose port postgres 5432
docker compose port redis 6379
```

Os resultados devem começar com `127.0.0.1:`.

Se a API e o worker forem futuramente movidos para containers na mesma rede Docker, as portas poderão ser removidas por completo. Na arquitetura atual, o binding local mantém a compatibilidade com os processos Node executados no host.

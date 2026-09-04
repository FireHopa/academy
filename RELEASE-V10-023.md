# Academy Play V10.0.23

## Upload direto de imagens

- troca os campos obrigatórios de URL por upload com clique ou arrastar e soltar;
- aplica o fluxo à capa do curso, ao banner do curso e ao banner da trilha;
- mantém URL externa dentro de uma opção avançada;
- mostra preview, estado de processamento, confirmação e erros no próprio campo;
- permite substituir ou remover a imagem sem acessar arquivos do servidor;
- mantém os placeholders automáticos quando nenhuma imagem estiver definida.

## Tratamento e segurança

- exige autenticação administrativa nos endpoints de upload;
- aceita somente JPG, PNG e WebP;
- limita cada arquivo a 8 MB e a 40 milhões de pixels de entrada;
- corrige a orientação, remove metadados, redimensiona e converte para WebP;
- usa nomes aleatórios e não aceita caminhos enviados pelo navegador;
- apaga arquivos locais antigos quando uma imagem é substituída ou removida.

## Armazenamento

Por padrão, as imagens ficam em:

```text
storage/uploads/images
```

Essa pasta é criada automaticamente no primeiro upload e deve fazer parte do backup do servidor. O local pode ser alterado em `.env`:

```env
UPLOAD_DIR="storage/uploads"
UPLOAD_PUBLIC_URL=""
```

`UPLOAD_PUBLIC_URL` vazio publica os arquivos em `NEXT_PUBLIC_API_URL/uploads`.

## Atualização

Esta versão adiciona a dependência `sharp`, usada para otimizar as imagens:

```bash
npm install
npm run build
```

Não há migração de banco de dados.

## Validação executada

- build de produção do frontend;
- build de produção da API;
- teste de conversão, publicação e remoção do arquivo;
- teste de rejeição de arquivo inválido.

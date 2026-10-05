# Contrato: cadastros únicos de cliente e fornecedor

- **Normalização**: documento = só dígitos (CPF com 11, CNPJ com 14; outros tamanhos não são tratados como documento). E-mail = minúsculas e sem espaços. Mesmas funções na API e na web (`packages/shared/src/cadastros.ts`).
- **Criação**: se documento ou e-mail normalizado já existir, a API responde `CONFLITO_UNICIDADE` com `{ existenteId }` e a tela oferece usar o cadastro existente. Sem documento: só aviso por e-mail ou nome, nunca bloqueio.
- **Fila**: `GET /cadastros/decisoes?tipo=` (admin ou pessoa designada); `POST /cadastros/decisoes/:id/unir {mantidoId}` ou `/manter-separados`. Nenhuma união ocorre sem esse POST.
- **União**: uma transação move todos os vínculos para o cadastro mantido, marca `merged_into_id`, grava `cadastro_uniao` e o evento `cadastros.<tipo>.unido`. Conflito de campos: ficam todos, com o principal indicado.
- **Desfazer**: `POST /cadastros/unioes/:id/desfazer` até `desfazivel_ate` (30 dias); depois, erro `LIMITE_EXCEDIDO`.
- **Visibilidade (cliente)**: nome, documento e contatos para quem tem papel comercial em qualquer empresa; negócios sempre filtrados pela empresa do registro (`CompanyScope`).
- **Eventos**: sem dado pessoal no payload (só ids e contagens).

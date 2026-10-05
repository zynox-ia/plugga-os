# Contrato: envelope de erro da API

Valida FR-030 e FR-031. Hoje não há filtro global: erros do Prisma viram 500, conflitos de corrida voltam como 400, mensagens misturam inglês e português e o erro interno do S3 chega ao usuário.

## Formato

Toda resposta de erro (status ≥ 400) da API tem este corpo, definido em `packages/shared` (zod) e consumido pelo web:

```json
{
  "codigo": "CONFLITO_ESTADO",
  "mensagem": "Este estudo já foi aprovado por outra pessoa.",
  "requestId": "01J9ZQ3W2K8V4M7X1A5B6C0D9E",
  "detalhes": [{ "campo": "status", "problema": "já aprovado" }]
}
```

| Campo | Regra |
|---|---|
| `codigo` | Constante em maiúsculas (catálogo abaixo). Estável: o web decide comportamento por ele, não pela mensagem. |
| `mensagem` | Português do Brasil, frase completa, **sem detalhe interno** (sem pilha, SQL, nome de tabela, `erro.message` de terceiros). |
| `requestId` | Mesmo identificador do registro de acesso e do rastreador de erros. |
| `detalhes` | Opcional. Só para validação de campo; nunca valor pessoal. |

## Catálogo de códigos

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | `REQUISICAO_INVALIDA` | Corpo, parâmetro ou identificador malformado (inclui UUID inválido) |
| 401 | `NAO_AUTENTICADO` | Sem sessão ou sessão inválida |
| 403 | `ACESSO_NEGADO` | Autenticado sem papel exigido |
| 404 | `NAO_ENCONTRADO` | Inexistente **ou de empresa que a pessoa não alcança** (não revela existência) |
| 409 | `CONFLITO_ESTADO` | Transição já feita por outra requisição (aprovação duplicada, assinatura repetida) |
| 409 | `CONFLITO_UNICIDADE` | Violação de unicidade (Prisma `P2002`) que não pôde ser repetida |
| 413 | `ARQUIVO_GRANDE_DEMAIS` | Acima do limite de tamanho |
| 415 | `TIPO_NAO_PERMITIDO` | Conteúdo real diferente do tipo permitido |
| 422 | `ARQUIVO_RECUSADO` | Páginas, dimensão ou pixels acima do limite; arquivo corrompido |
| 429 | `MUITAS_TENTATIVAS` | Limite de taxa; inclui `Retry-After` |
| 503 | `SERVICO_INDISPONIVEL` | Dependência fora (armazenamento, fila); mensagem genérica |
| 500 | `ERRO_INTERNO` | Qualquer outro; mensagem fixa "Algo deu errado. Informe o código <requestId>." |

## Regras de implementação (para o plano e as tarefas)

- Um `ExceptionFilter` global converte: exceções HTTP do Nest, erros do Prisma (`P2002`→`CONFLITO_UNICIDADE`, `P2025`→`NAO_ENCONTRADO`, `P2034`→repete a transação uma vez e, se persistir, `CONFLITO_ESTADO`), erros de validação zod, erros de domínio tipados.
- A camada de persistência **não** lança exceções HTTP; lança erros de domínio (`EstadoInvalido`, `NaoEncontrado`, `Conflito`), que o filtro mapeia.
- Mudança de status de HTTP em rota existente é compatível: o web ainda não distingue 400 de 409 nas operações citadas; os testes e2e são atualizados na mesma mudança.
- O web valida o envelope com o mesmo schema e mostra mensagem por `codigo`.
- Teste: cada código tem um caso que o produz; um teste varre as mensagens procurando termos internos (`prisma`, `postgres`, `ECONN`, caminhos de arquivo).

## Compatibilidade transitória (implementada em T020)

Até a US12 mover o web para o envelope, o filtro global também devolve os campos do corpo antigo: `message` (o texto original, só quando é erro do cliente e sem detalhe interno; senão repete `mensagem`), `issues` (validação por zod) e as chaves próprias de quem lançou a exceção, como o `code` do login com Google. Erros 5xx nunca repetem o texto original. Esses campos saem junto com a US12; o web novo lê só `codigo`, `mensagem`, `requestId` e `detalhes`.

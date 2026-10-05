# Modelo de dados: Produto unificado

Todas as mudanças são aditivas (expandir) e cada migração traz `rollback.sql`. Nomes em snake_case como o restante do schema.

## 1. `clients` (alterada)

| Campo | Tipo | Regra |
|---|---|---|
| `documento_normalizado` | text null | só dígitos de CPF/CNPJ; índice único parcial `WHERE documento_normalizado IS NOT NULL AND merged_into_id IS NULL` |
| `email_normalizado` | text null | minúsculas, sem espaços; índice único parcial no mesmo padrão |
| `merged_into_id` | uuid null, FK para `clients` | preenchido quando o cadastro foi unido; o registro some das listas |

Dados conflitantes (dois e-mails, dois telefones) ficam como contatos adicionais, com marca de principal. Sem `company_id` em `clients` (cadastro único; 002 T141 confirma).

## 2. `fornecedores` (alterada)

| Campo | Regra |
|---|---|
| `documento_normalizado` text null | só dígitos; depois da fila, único parcial `WHERE merged_into_id IS NULL` |
| `merged_into_id` | idem clientes |
| `company_id` | continua existindo e deixa de entrar na unicidade; a remoção fica para uma feature futura (contrair) |

A unicidade `(company_id, documento)` só é removida **depois** da fila resolvida e de a conferência de contagens passar.

## 3. `cadastro_decisao` (nova)

`id`, `tipo` (`cliente`|`fornecedor`), `candidato_a`, `candidato_b`, `motivo` (`documento`|`email`|`nome`), `estado` (`pendente`|`unir`|`manter_separados`|`desfeita`), `decidido_por`, `decidido_em`, `criado_em`. Único em `(tipo, candidato_a, candidato_b)`.

## 4. `cadastro_uniao` (nova)

`id`, `tipo`, `mantido_id`, `unido_id`, `vinculos` jsonb (lista `{tabela, id}` movidos), `desfazivel_ate` (+30 dias), `definitiva_em`, `feito_por`, `feito_em`. Desfazer restaura os vínculos listados e zera `merged_into_id`.

## 5. `feature_flags` (nova)

`key` text PK, `enabled` bool, `atualizado_por`, `atualizado_em`. Semente: `menu_unificado = false`.

## 6. Sem mudança

`user_company_roles`, `user_department_access`, `pedidos_de_compra` (já com `company_id` e numeração por empresa), `obras`.

## Contagens que a migração preserva (SC-006)

Antes e depois, por cadastro mantido: oportunidades, contratos, pedidos de compra, cotações, obras e estudos ligados. O script de conferência soma por cadastro e falha se alguma contagem cair ou se a entrada estiver vazia.

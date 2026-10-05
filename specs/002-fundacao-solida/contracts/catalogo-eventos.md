# Contrato: catálogo de eventos de auditoria

Valida FR-028, FR-034 e FR-076. Hoje `packages/shared/src/events.ts` tem só eventos de auth, canal, LLM e Pluggamob, enquanto 38 nomes literais são usados na API (`clientes.client_created`, `commercial.opportunity_lost` etc.), em estilos diferentes, e cada repositório de Compras e Obras tem seu `registrarEvento`.

## Padrão de nome

`<dominio>.<entidade>.<acao_no_passado>`, tudo em minúsculas, snake_case dentro de cada parte, ASCII, em inglês para o nome técnico (a descrição é em português).

Exemplos: `auth.login.succeeded`, `commercial.opportunity.won`, `compras.pedido.created`, `obras.apr.signed`, `energy_efficiency.study.approved`, `llm.chave.updated`.

Os nomes existentes mantêm-se **como apelidos aceitos** por uma versão (lista `legados` no catálogo) para não quebrar telas e consultas; um teste garante que nenhum nome novo fora do padrão seja criado.

## Estrutura do catálogo (em `packages/shared`)

```ts
export const eventNames = {
  "commercial.opportunity.won": { descricao: "Oportunidade ganha", escopo: "empresa", pii: false },
  // ...
} as const;
export type EventName = keyof typeof eventNames;
```

| Campo | Significado |
|---|---|
| chave | Nome do evento (único) |
| `descricao` | Frase em português |
| `escopo` | `empresa` (grava `company_id`) ou `plataforma` |
| `pii` | `false` para todos; a presença de `true` é erro de catálogo |

## Registro único

Um componente `AuditAppender` em `audit/` expõe `append(tx, evento)`:
- exige `EventName` do catálogo (tipado);
- exige estar dentro de uma transação (`tx`) quando o evento acompanha uma mutação;
- grava `actor_type`, `actor_id`, `entity_type`, `entity_id`, `company_id` e `payload`;
- valida o `payload` contra a regra "só identificadores e nomes de campos" (lista de chaves proibidas: nome, e-mail, telefone, documento, cnpj, cpf, endereço; e valores com formato de e-mail ou documento);
- os `registrarEvento` dos repositórios são removidos.

## Operações que exigem evento (FR-028)

| Operação | Evento |
|---|---|
| Aprovar estudo | `energy_efficiency.study.approved` |
| Enviar estudo ao cliente | `energy_efficiency.study.sent` |
| Aprovar tipo de fatura | `energy.invoice_type.approved` |
| Assinar APR | `obras.apr.signed` |
| Conferir EPI | `obras.epi.checked` |
| Registrar e revogar liberação | `obras.release.recorded`, `obras.release.revoked` |
| Lançar pendência e medição | `obras.pendency.recorded`, `obras.measurement.recorded` |
| Criar versão de projeto | `obras.project_version.created` |
| Ganhar oportunidade | `commercial.opportunity.won` (e `clientes.client.created` na mesma transação, se criar cliente) |
| Numerar pedido | `compras.pedido.created` |
| Aprovar fechamento Pluggamob | `pluggamob.settlement.approved` |
| Alterar acesso, desativar usuário | `auth.access.changed`, `auth.user.deactivated` |
| Mudar modo de integração | `integrations.mode.changed` |

## Testes

- Nenhum `eventLog.create` fora do `AuditAppender` (verificação estática no lint).
- Para cada operação da tabela: duas execuções concorrentes geram exatamente um evento.
- Teste do `payload`: rejeita chaves e valores proibidos.

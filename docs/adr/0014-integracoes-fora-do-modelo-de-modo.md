# ADR-0014 — Integrações fora do modelo de modo: e-mail, armazenamento S3 e Redis

- **Status:** Aceito
- **Data:** 2026-10-05
- **Decisores:** dono do sistema, ARCHITECT (revisão pendente)
- **Contexto:** spec `specs/002-fundacao-solida`, história 6 (T083)
- **Depende de:** ADR-0005, ADR-0009, ADR-0010

## Contexto

O modelo de modo (`mock < read_only < bridge < write`, ADR-0005/0009) decide o que uma
integração com sistema **de terceiros** pode fazer. A história 6 passou a exigir o
`IntegrationGate` nos adaptadores que falam com esses sistemas (OpenRouter hoje, Bitrix
com gate próprio). Falta dizer o que **não** entra nesse modelo, para a verificação
estática (`scripts/verifica-rede-externa.mjs`) não virar ruído.

## Decisão

1. **E-mail transacional (Brevo)** fica fora do modelo de modo. É saída transacional
   própria (convite, redefinição de senha), não leitura nem escrita num sistema de produção
   de terceiros. O isolamento em desenvolvimento e teste continua sendo o `EmailPort` com
   Mailpit (ADR-0010). É a exceção ao ADR-0010 que a spec pede para registrar: o adaptador
   `email/brevo-email.adapter.ts` chama a rede sem passar pelo gate.
2. **Armazenamento S3 (SeaweedFS/MinIO) e Redis** são infraestrutura própria do produto,
   não integrações. Têm modo de falha próprio (indisponibilidade), não modo de capacidade.
3. **Bitrix** mantém o gate do ADR-0009 (`read_only` mais flag), aplicado pelo
   `BitrixImportService` antes de qualquer leitura; o cliente HTTP cru não consulta o gate.
4. **Toda integração externa nova** passa pelo `IntegrationGate` e entra com modo `mock` no
   seed. Em `mock` não há chamada de rede: o adaptador devolve resultado simulado
   identificado (como o `openrouter.gateway.ts`).

## Lista de exceções da verificação estática

`scripts/verifica-rede-externa.mjs` (ligado ao `lint` do API) falha se um arquivo sob
`apps/api/src` chamar `fetch`, importar cliente HTTP externo ou `node:http(s)` sem citar o
`IntegrationGate`, salvo estes:

| Arquivo | Motivo |
| --- | --- |
| `email/brevo-email.adapter.ts` | Decisão 1 |
| `integrations/bitrix/http-bitrix-read.client.ts` | Decisão 3 |

Acrescentar exceção exige emendar este ADR e o script no mesmo PR.

## Consequências

- Uma integração nova sem gate quebra o lint, não a produção.
- A troca de modo é auditada (`integrations.mode.changed`, com autor e horário).
- A verificação é textual: não prova que o gate é chamado antes da rede, só que o adaptador
  o conhece. A prova do comportamento fica nos testes de cada adaptador
  (`apps/api/test/llm-mock.e2e.spec.ts` para o OpenRouter).

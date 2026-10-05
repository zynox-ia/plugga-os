# Relatório de dados de cliente na árvore (T034)

Gerado por `node scripts/scan-dados-cliente.mjs --tree` em 2026-10-05. Traz diretório e tipo; **nunca valores e nunca nomes de arquivo** (vários nomes de arquivo continham o número da unidade consumidora). Os nomes de cliente não entraram na busca: dependem da lista do dono (T006).

## Antes (116 ocorrências na árvore)

| Onde | Ocorrências | Tipo |
|---|---|---|
| `packages/auditoria-oraculo` (referência, casos, scripts, manifesto) | ~60 | UC e CNPJ |
| `apps/api/src/energy-efficiency` (golden, templates, specs de corpus) | ~30 | UC e CNPJ |
| `apps/web/app/lib/mock`, `docs/mockup` | ~14 | UC |
| `apps/api/prisma/seed.ts`, `apps/api/test` | 2 | UC (código curto de mock) |

No histórico (`--history`): 184 ocorrências em linhas adicionadas, a serem tratadas na reescrita (T047).

## Decisão (2026-10-05, dono)

A auditoria de faturas **sai da árvore em vez de ser anonimizada**: módulo `energy-efficiency` da API, pacote `auditoria-oraculo`, tela e rotas web de eficiência, scripts e testes de corpus. Uma spec própria a trará de volta, com fixtures sintéticas desde o início. As tabelas e migrations do banco ficam como estão.

## Depois

- Árvore: 0 ocorrências com a lista de permitidos (`scripts/dados-sinteticos-permitidos.json`).
- Mocks e seed: um número de UC real virou `UC 9999001` (faixa sintética); os códigos de 4 dígitos (`UC-0001`, `UC 4471` etc.) são placeholders sequenciais e entraram na lista de permitidos como falsos positivos (T041).
- O balde `plugga-corpus-faturas` não foi tocado; os arquivos reais continuam no histórico do git até a reescrita (T047).

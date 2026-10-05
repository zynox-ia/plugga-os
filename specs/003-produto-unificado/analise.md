# Análise de consistência: spec 003 (spec × plano × tarefas)

> Atualizada após o realinhamento de 2026-10-05 (ver [realinhamento.md](realinhamento.md)). Os achados A1 e A2 continuam valendo.

Data: 2026-10-05. Análise somente leitura, feita sobre `spec.md`, `plan.md`, `tasks.md`, contratos e a constituição. Severidade: crítico, alto, médio, baixo.

## Resultado

- Constituição: nenhuma violação (Constitution Check do plano passa nos 7 princípios; um desvio justificado: `feature_flags`).
- Cobertura: os 29 requisitos funcionais têm ao menos uma tarefa (tabela abaixo). Os 12 critérios de sucesso têm verificação, 3 deles manuais (SC-003, SC-008, SC-012).
- Achados críticos: 0. Altos: 2. Médios: 3. Baixos: 2.

## Achados

| # | Sev. | Achado | Recomendação |
|---|---|---|---|
| A1 | Alto | **Dependência de calendário com a 002.** A história 4 da 002 está na Fatia 3 (T139 a T155). Sem ela, filtro real, rótulos, etiqueta de empresa, dashboard e visibilidade de cliente não podem ir à produção. Só Fundação e US1 (menu) andam antes. | Pedir ao agente da 002 que antecipe T139, T140, T141 a T145 e T148 a T150 (ou aceitar a ordem atual e entregar primeiro Fundação + US1). Decisão do dono. |
| A2 | Alto | **Não existe módulo Financeiro nem lançamento.** FR-019 e o cenário 3 da história 5 ("lançamento sem empresa é recusado") não têm onde ser testados; T348 entrega só a regra e o schema compartilhado. | Aceitar que FR-019 fica como contrato até o módulo existir (a spec já diz que "Contas a pagar/receber" estão fora de escopo) e ajustar o critério do cenário 3 para "tipo compartilhado recusa". Registrar na spec. |
| A3 | Baixo | Desfazer de 30 dias (FR-016): a data é conferida na chamada, sem job de expiração. | Resolvido no realinhamento (T364 removida). |
| A4 | Médio | **Área de Pluggamob/`produto-tecnologia` indefinida** (spec lista 7 áreas, o catálogo atual tem 3 departamentos Plugga + 3 Waze). | T301 pergunta ao dono; proposta: Eletromobilidade. |
| A5 | Médio | **A união de cadastros precisa tratar toda FK para `clients`/`fornecedores`**; esquecer uma perde histórico (SC-006). | Corrigido em T339: teste lê o schema e falha com FK não tratada. |
| A6 | Baixo | O teste do catálogo (T307) deve aceitar `/clientes` como tela de cadastro sem filtro de empresa, mas exigir o filtro nos negócios da ficha. | Contrato já lista a exceção; implementar a exceção na T307. |
| A7 | Baixo | SC-003, SC-008 e SC-012 são medidas com pessoas; não há teste automatizado. | Registrar como verificação manual (T362 cobre SC-012). |

## Cobertura de requisitos

| Requisito | Tarefas |
|---|---|
| FR-001, FR-002, FR-004 | T304, T305, T313, T314 |
| FR-003 | T316, T317, T318 |
| FR-005, FR-006, FR-007, FR-008 | T308, T309, T321 a T329 |
| FR-009 | T306, T307, T309 |
| FR-010 | T310, T332 |
| FR-011, FR-012 | T333, T334, T335 |
| FR-013, FR-014 | T336, T340, T342 |
| FR-015, FR-016 | T337 a T339, T341, T343 |
| FR-017, FR-018, FR-020 | T346, T347, T350, T351 |
| FR-019 | T348 (ver A2) |
| FR-021 a FR-024 | T352 a T355, T365 |
| FR-025, FR-026 | T357, T358 |
| FR-027 | T337, T344, T345, T350, T351 (migrações aditivas, `[VPS]`) |
| FR-028 | T311, T312, T315, T320 |
| FR-029 | nenhuma tarefa toca sistema externo; coberto pelo Constitution Check |

## Itens que exigem o dono

1. Decidir A1 (antecipar a história 4 da 002 ou aceitar a ordem).
2. Responder T301: área de Pluggamob, quem resolve a fila, e flag em tabela ou em variável de ambiente.
3. Aprovar cada `[VPS]` (T344, T350) e a ativação em produção (T362).

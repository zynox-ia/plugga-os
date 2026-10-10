# Guia de seleção de agentes e modelos

> Lido pelo Traycer antes de criar ou reconfigurar qualquer agente filho neste repositório.
> Gerenciado por `docs/fluxo/04-atualizar-fluxo.md` (dev-workflow). Não edite no projeto: mude no repositório central.

## Regra

Escolha o modelo pelo **papel** do agente que vai ser criado, nesta tabela. Use a **opção 1**; a **opção 2** só quando a opção 1 estiver indisponível (cota esgotada, modelo fora do ar). Nunca use um modelo fora da tabela, nem um modelo da tabela em outro papel (Opus 5 só no 03 Arquiteto), sem pedido explícito do André.

| Papel do agente criado | Quem cria | Opção 1 | Opção 2 |
|---|---|---|---|
| 00 Condutor (turno seguinte) e auxiliares (`Auditor`, `Release`) | Condutor | Terra Medium | Sonnet 5.5 |
| 03 Arquiteto | Condutor | Sol Max | Opus 5 |
| 01 Especificador, 02 Esclarecedor, 04 Planejador, 05 Analista, 06 Implementador, 07 Convergência, 09 Verificador | Condutor | Luna Max | Haiku 4.5 |
| Agente da sessão visual (`03-visual.md`) | André | Luna Max | Haiku 4.5 |
| 08 Revisor (`08 Revisor`; na sessão visual, `08 Revisor · visual`) | Condutor ou sessão visual | O modelo da tabela que **não** implementou (06, ou o agente da sessão visual) | — |

## 08 Revisor

O revisor nunca usa o mesmo modelo que implementou. 06 com Luna Max → 08 com Haiku 4.5; 06 com Haiku 4.5 → 08 com Luna Max. Se a implementação usou os dois (troca por cota), o 08 usa Terra Medium. Se o outro modelo estiver indisponível, pergunte ao André antes de revisar com o mesmo.

## Ao criar

1. Escolha o coding agent e o modelo da tabela no seletor do Traycer (o nome exato pode variar com a versão; escolha o equivalente mais próximo e informe qual usou).
2. Registre o modelo usado em `.pipeline/<ID>.md` (`modelos:`).
3. Os dois modelos de uma linha estão indisponíveis → não crie o agente com outro; pare e registre (no modo automático, encerre com o relatório).

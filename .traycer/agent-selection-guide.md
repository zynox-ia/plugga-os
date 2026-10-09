# Guia de seleção de agentes e modelos

> Lido pelo Traycer antes de criar ou reconfigurar qualquer agente filho neste repositório.
> Gerenciado por `docs/fluxo/04-atualizar-fluxo.md` (dev-workflow). Não edite no projeto: mude no repositório central.

## Regra

Escolha o modelo pelo **papel** do agente que vai ser criado, nesta tabela. Use a **opção 1**; a **opção 2** só quando a opção 1 estiver indisponível (cota esgotada, modelo fora do ar). Nunca use um modelo fora da tabela, nem um modelo da tabela em outro papel (Opus 5 só no plan), sem pedido explícito do André.

| Papel do agente criado | Quem cria | Opção 1 | Opção 2 |
|---|---|---|---|
| Diretor 01, 02, 03 | Coordenador | Terra Medium | Sonnet 5.5 |
| Auxiliares do Coordenador (`Auditor`, `Release`) | Coordenador | Terra Medium | Sonnet 5.5 |
| Agente da fase **plan** (`<ID> · plan`) | Diretor | Sol Max | Opus 5 |
| Demais agentes de fase (`<ID> · <fase>`: specify, clarify, tasks, analyze, implement, converge, bug-assess, bug-fix, bug-test, conflitos, Linear) | Diretor | Luna Max | Haiku 4.5 |
| Revisor independente (`<ID> · revisão`) | Diretor | O modelo da tabela que **não** fez a implementação da issue | — |

## Revisor independente

O revisor nunca usa o mesmo modelo que implementou. Implementação com Luna Max → revisão com Haiku 4.5; implementação com Haiku 4.5 → revisão com Luna Max. Se o outro modelo estiver indisponível, o Diretor pergunta ao André antes de revisar com o mesmo.

## Ao criar

1. Escolha o coding agent e o modelo da tabela no seletor do Traycer (o nome exato pode variar com a versão; escolha o equivalente mais próximo e informe qual usou).
2. Registre o modelo usado no arquivo de estado (`.pipeline/<ID>.md` para o Diretor; `.pipeline/coordenacao.md` para o Coordenador).
3. Os dois modelos de uma linha estão indisponíveis → não crie o agente com outro; pare e pergunte ao André.

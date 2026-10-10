---
name: registrar-linear
description: Registra trabalho no Linear no padrão do fluxo, pelo MCP do Linear. Use quando o André pedir para criar, registrar ou "mandar pro Linear" uma demanda (bug, hotfix, feature, ajuste, manutenção), ou quando o 04 Planejador precisar criar as sub-issues de uma spec a partir do tasks.md. Segue docs/fluxo/00-convencoes.md.
---

# Registrar no Linear

Você registra trabalho no Linear exatamente no padrão de `docs/fluxo/00-convencoes.md` (seções 2 a 6). Em caso de dúvida, as convenções valem. Os modelos de descrição estão em `docs/fluxo/linear/templates.md`.

| Quem pede | Modo |
|---|---|
| André: "cria uma issue", "registra esse bug", "manda pro Linear" | **A — Nova demanda** |
| 04 Planejador, na trilha SDD | **B — Sub-issues da spec** |

O time do Linear deste repositório está em `.specify/memory/projeto.md` (seção `## Linear`). Se o pedido for de outro cliente, pergunte o time.

---

## Modo A — Nova demanda

Você descreve **O QUÊ e POR QUÊ**, nunca **COMO**. Não invente arquivos, tabelas, rotas ou soluções. Você pode ler o código para **localizar** a tela ou o fluxo citado e escrever um contexto correto, mas a descrição continua em linguagem de usuário.

### A1. Classificar
1. **Prefixo e Type**
   - Defeito em produção → `[HOTFIX]` · Hotfix. Defeito na develop ou não liberado → `[FIX]` · Bug.
   - Novo ou melhoria percebida pelo usuário → `[FEAT]` · Feature.
   - Interno, sem efeito visível → `[REFACTOR]`, `[PERF]`, `[INFRA]`, `[CHORE]`, `[DOCS]`.
   - Autenticação, permissões, dados pessoais → `[SECURITY]` · Security.
2. **Estimate:** XS (texto, ordem, um campo) · S (mudança localizada) · M (funcionalidade com tela e dados) · L (várias funcionalidades relacionadas) · XL (não cria; proponha quebrar em 2–6 issues e espere o ok).
3. **Sessão visual** (`docs/fluxo/03-visual.md`): sempre avulsa, título `[FEAT] <resultado visual>` (ou `[REFACTOR]`), flag `Visual`, status In Progress. Fora isso:
   **Spec ou avulsa:** spec (issue pai, `[TIPO] Spec NNN — ...`) para todo `[FEAT]`, `[REFACTOR]`, `[PERF]`, `[SECURITY]` e `[INFRA]`, qualquer tamanho; avulsa para `[FIX]`, `[HOTFIX]`, `[CHORE]` e `[DOCS]`.
4. **Bug/hotfix:** Severity S1–S4; HOTFIX S1/S2 → Priority Urgent.

### A2. Localizar
1. Projeto da capacidade (na dúvida, o projeto ativo) e milestone (na dúvida, o mais antigo em aberto: Alpha → Beta → GA).
2. Labels de domínio do time; flags (`Breaking Change`, `DB Migration`, `Needs Design`, `Blocked: Client`).
3. Duplicatas: busque issues abertas com termos parecidos; achou → mostre e pergunte.
4. Dependências citadas → *blocked by* (campo `blockedBy` do `save_issue`, com o ID da issue que precisa vir antes). A issue citada não existe ainda → pergunte se ela deve ser registrada primeiro.
5. Spec: `NNN` = maior `Spec NNN` do time + 1 (3 dígitos).

### A3. Perguntar
No máximo 3 perguntas, todas de uma vez, só se faltar: o time/tela, o resultado esperado ou, num defeito, como reproduzir. O resto vai para "Dúvidas em aberto".

### A4. Redigir e confirmar
Use o template do tipo. Título no padrão (convenções, seção 5); bug com o sintoma, não a correção. Critérios de aceite em Dado / Quando / Então. "Fora de escopo" obrigatório (sugira e marque "(sugerido)" se nada foi dito). Spec: liste as user stories previstas como frases afirmativas e verificáveis.

Mostre e pergunte:
```
Título: <título>
Time: <time> · Projeto: <projeto> · Milestone: <milestone>
Type: <type> · Estimate: <estimate> · Priority: <priority> · Severity: <se bug> · Domínio: <labels> · Flags: <se houver>
Bloqueada por: <IDs ou "—">
<descrição>

Crio assim? Fica em Backlog ou já vai para Ready?
```
Se o André já disse nesta conversa "pode criar" ou "manda pra fila", não pergunte de novo.

### A5. Criar
Crie com todos os campos e relações; status Backlog (padrão) ou Ready (com o ok). Responda em uma linha:
`Criada: <ID> <título> · <projeto> · <milestone> · <estimate> · <status>`

---

## Modo B — Sub-issues da spec (04 Planejador)

Entrada: o ID da issue pai, a pasta da spec (`specs/NNN-<slug>/`) e o `tasks.md` já gerado.

### B1. Ler o tasks.md
Identifique as fases na ordem: Setup, Foundational, uma por user story, Polish. Para cada fase, o intervalo de tasks (primeira e última `T0xx`). Para cada user story, o título da US e seus critérios na `spec.md`.

### B2. Criar uma sub-issue por fase
| Fase | Título |
|---|---|
| Setup | `[TIPO] Spec NNN Setup` |
| Foundational | `[TIPO] Spec NNN Fundação` |
| User Story n | `[TIPO] Spec NNN USn <comportamento afirmativo e verificável>` |
| Polish | `[TIPO] Spec NNN Polimento` |
| Tarefas do converge fora das fases | `[TIPO] Spec NNN Convergência` |

- `[TIPO]` = o da issue pai. Comportamento da US: frase no presente, do ponto de vista de quem usa (ex.: "Cliente é cadastrado com nome e telefone"); reescreva o título da US do Spec Kit se ele estiver técnico.
- Pai: a issue pai. Mesmo time, projeto e milestone. Labels de `Type` e de domínio da pai. Status **Ready**.
- Descrição (template "Sub-issue"):
  ```
  Tasks: T0xx–T0yy · Spec: specs/NNN-<slug>/
  ## Comportamento
  <frase da US e como verificar>
  ## Critérios de aceite
  - [ ] <copiados da spec para esta US; nas fases técnicas, o que precisa estar pronto>
  ```

### B3. Conferir e devolver
Liste as sub-issues da pai pelo MCP e confira: uma por fase, na ordem, títulos no padrão, intervalos de tasks que cobrem o `tasks.md` inteiro sem sobreposição. Devolva ao Condutor:
```
SUB-ISSUES: <ID> Setup · <ID> Fundação · <ID> US1 · ... (na ordem)
```

### B4. Atualizar após o converge
Quando o converge acrescentar tarefas: atualize a linha `Tasks:` da sub-issue da fase correspondente (o status é o Condutor quem move); se as tarefas não pertencem a nenhuma fase, crie `[TIPO] Spec NNN Convergência`.

---

## Nunca
- Criar issue sem time, Type ou Estimate; criar issue XL.
- No modo A: criar sub-issues de spec; mover para status além de Backlog/Ready (exceção: a issue da sessão visual nasce em In Progress).
- No modo B: alterar a issue pai além de vincular as sub-issues.
- Inventar detalhes técnicos na descrição de uma demanda.

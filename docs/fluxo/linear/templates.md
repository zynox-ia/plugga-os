# Templates do Linear

> Crie estes templates no Linear: os de issue em *Settings → Team → Templates* (ou no workspace), e o de projeto em *Settings → Templates → Project*.
> Os campos entre `<>` são preenchidos na criação.

---

## 1. Template de projeto: "Projeto padrão"

- **Milestones:** `Alpha`, `Beta`, `GA`
- **Descrição do projeto:**
```markdown
## Objetivo
<o que esta capacidade entrega e por quê, em 1–2 linhas>

## Critério de pronto
- [ ] <item verificável>

## Fora de escopo
- <...>
```
- **Descrição dos milestones:**
  - Alpha: `Saída: o fluxo principal funciona de ponta a ponta na develop.`
  - Beta: `Saída: escopo completo, validado pelo André e pelo cliente.`
  - GA: `Saída: em produção, com o critério de pronto do projeto atendido.`

---

## 2. Issue pai (spec)

- **Título:** `[FEAT] Spec NNN — <capacidade entregue>`
- **Campos:** Type `Feature` · Estimate `M` · Status `Backlog`
```markdown
## Contexto
<quem usa e o que faz hoje>

## Objetivo
<o que passa a existir e por quê>

## User stories previstas
- US1 <comportamento afirmativo e verificável>
- US2 <...>

## Critérios de aceite
- [ ] **Dado** <situação> **quando** <ação> **então** <resultado visível>

## Fora de escopo
- <...>

## Dúvidas em aberto
- <...>

## Notas
- <decisões, links, pedido original entre aspas>
```

---

## 3. Sub-issue (criada pelo 04 Planejador)

- **Título:** `[TIPO] Spec NNN USn <comportamento>` ou `[TIPO] Spec NNN Setup | Fundação | Polimento`
- **Campos:** herdados da issue pai; Status `Ready`
```markdown
Tasks: T0xx–T0yy · Spec: specs/NNN-<slug>/

## Comportamento
<a frase da US e como verificar>

## Critérios de aceite
- [ ] <copiados da spec para esta US>
```

---

## 4. Avulsa

- **Título:** `[TIPO] <resultado esperado>`
- **Campos:** Type conforme o prefixo (`[CHORE]`, `[DOCS]`; sessão visual: flag `Visual`) · Estimate até `L` · Status `Backlog`
```markdown
## Contexto
<situação atual>

## Objetivo
<o que muda e por quê>

## Critérios de aceite
- [ ] **Dado** <situação> **quando** <ação> **então** <resultado>

## Fora de escopo
- <...>
```

---

## 5. Bug

- **Título:** `[FIX] <sintoma observado>`
- **Campos:** Type `Bug` · Severity `S3` · Estimate `S` · Status `Backlog`
```markdown
## Passos para reproduzir
1. <...>
2. <...>

## Esperado
<...>

## Obtido
<...>

## Ambiente
<develop / produção · navegador · usuário de teste>

## Severidade
<S1–S4> — <motivo>

## Critérios de aceite
- [ ] Os passos acima produzem o resultado esperado
- [ ] Um teste automatizado reproduz o defeito e passa após a correção
- [ ] O comportamento continua correto após recarregar a página / reabrir a tela

## Fora de escopo
- <...>
```

---

## 6. Hotfix

- **Título:** `[HOTFIX] <sintoma observado em produção>`
- **Campos:** Type `Hotfix` · Severity `S1` ou `S2` · Priority `Urgent` · Estimate `S` · Status `Backlog` (Ready com o ok do André, imediatamente)
- **Descrição:** igual à do Bug, com o **Ambiente** sempre "produção" e mais esta seção:
```markdown
## Impacto
<quem é afetado, desde quando, se há contorno>
```

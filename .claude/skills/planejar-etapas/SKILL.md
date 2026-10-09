---
name: planejar-etapas
description: Planeja e audita a ordem do trabalho de um sistema de cliente no Linear. Use para (1) planejar o sistema ou um projeto novo em projetos, milestones (Alpha, Beta, GA) e specs na ordem certa; (2) auditar o projeto ao entrar nele, dizendo onde estamos, o que ficou incompleto e o que vem a seguir; (3) assumir um sistema já existente sem roadmap; (4) quebrar uma issue XL. Mantém docs/roadmap e cria a estrutura no Linear.
---

# Planejar e auditar o trabalho

Você ajuda o André a nunca se perder na ordem do trabalho. Você **propõe**; quem decide é ele.
Siga `docs/fluxo/00-convencoes.md` (estrutura, nomes, labels) e use `docs/guias/05-ordem-de-construcao.md` como referência de método.

| Pedido | Modo |
|---|---|
| "planejar o sistema", "planejar o próximo projeto" | **A — Planejar** |
| "auditar", "onde estamos?", "o que vem agora?", ou o Coordenador ao abrir a sessão | **B — Auditar** |
| Sistema com código, sem `docs/roadmap/ROADMAP.md` | **C — Assumir** |
| "quebrar <ID>", issue com estimativa XL | **D — Quebrar** |

---

## Método (vale para todos os modos)

**Ordem padrão de construção:** 1 Fundação → 2 Dados → 3 Esqueleto andante (fluxo principal de ponta a ponta, mínimo) → 4 Engordar o fluxo → 5 Integrações externas → 6 Relatórios e painéis → 7 Polimento. Inverter a ordem exige uma decisão registrada em `decisoes.md`.

**Entre duas coisas:** se uma precisa da outra, a outra vem antes (*blocked by*); se não, primeiro a de **maior valor e maior risco**.

**Unidades e tamanhos:**
| Unidade no Linear | Representa | Tamanho saudável |
|---|---|---|
| Projeto | Uma capacidade (`Gestão de clientes`) | Semanas; 2–6 specs |
| Milestone | Alpha · Beta · GA | — |
| Issue pai | Uma spec (`[FEAT] Spec NNN — <capacidade>`); obrigatória para M/L e todo `[SECURITY]` | Poucos dias; até ~5 user stories; estimativa M ou L |
| Issue avulsa | Bug, hotfix, ou mudança XS/S (exceto `[SECURITY]`) | Horas |

**Fatias verticais, nunca camadas.** Cada spec e cada user story entrega algo testável na tela. Proibido "todo o backend" ou "todas as telas".
**Menor passo que fecha valor.** O que não foi pedido fica fora.
**Decisão antes de construção.** O que precisa ser escolhido vira pergunta ao André, com recomendação.

---

## Modo A — Planejar

### A1. Entrevista (no máximo 6 perguntas, todas de uma vez)
1. **Destino:** quando estiver pronto, o que o sistema faz? (uma frase)
2. **Perfis** de usuário e a ação mais importante de cada um.
3. **Fluxo principal:** o caminho que, funcionando, já gera valor.
4. **Integrações** obrigatórias.
5. **Datas ou entregas** combinadas com o cliente.
6. **O que já existe** (código, telas, banco).

Para cada domínio presente (autenticação, pagamentos, uploads…), mostre o menu de `references/checklists-de-dominio.md` e deixe o André escolher o que entra.

### A2. Decisões pendentes
Cada uma com pergunta, opção recomendada e motivo.

### A3. Proposta
Na ordem padrão, no formato:

```
Projeto: Fundação                                  (depende de: —)
  Objetivo: ... · Critério de pronto: ...
  Alpha: login e deploy no ar
    [INFRA] Spec 001 — Ambiente, CI e deploy               M · Infra
    [SECURITY] Spec 002 — Login com e-mail e senha         M · Autenticação   blocked by Spec 001
  Beta / GA: ...
Projeto: Gestão de clientes                        (depende de: Fundação)
  Alpha: fluxo de ponta a ponta
    [FEAT] Spec 003 — Cadastro e listagem de clientes      M · Clientes
      US previstas: Cliente é cadastrado com nome e telefone · Lista pode ser filtrada por etapa
  ...
```

Para cada spec: título no padrão, estimativa (M/L), labels de domínio, bloqueios, user stories previstas (frases afirmativas e verificáveis) e 2–4 critérios de aceite em linguagem de usuário.
**Numeração:** o próximo `NNN` livre do time (maior `Spec NNN` existente no Linear + 1), em sequência na ordem da proposta.

**Mostre ao André e espere aprovação.** Ajuste quantas vezes ele pedir.

### A4. Criar no Linear (só após aprovação)
1. **Labels de domínio** do time que ainda não existem.
2. **Projetos** (a partir do template com Alpha, Beta e GA), com objetivo, critério de pronto e fora de escopo na descrição, e **dependências** fim → início.
3. **Critério de saída** na descrição de cada milestone.
4. **Issues pai** no milestone certo, com labels de `Type` e domínio, estimativa, prioridade e relações *blocked by*. A descrição segue o modelo de issue pai (`docs/fluxo/linear/templates.md`). **Sub-issues não são criadas aqui**: o Diretor cria a partir do `tasks.md`.
5. Status inicial **Backlog**. Pergunte quais já vão para **Ready**.

### A5. Gravar o roadmap
- Atualize `docs/roadmap/ROADMAP.md` (modelo em `references/modelo-roadmap.md`) com os links do Linear.
- Acrescente as decisões em `docs/roadmap/decisoes.md` (data, decisão, motivo, alternativas).
- Branch `docs/roadmap-<data>`, commit `docs(roadmap): <resumo>`, PR para a `develop`. O merge é do André.

---

## Modo B — Auditar (somente leitura)

### B1. Coletar
- `docs/roadmap/ROADMAP.md` (não existe → ofereça o modo C).
- **Linear**, time do repositório (`projeto.md`): por projeto e milestone, contagem de issues pai e avulsas por status; issues bloqueadas; issues em In Progress, In Review ou Verifying há mais de 3 dias; issues XL em Ready; issues sem projeto ou sem milestone; sub-issues abertas de issues pai já Done.
- **Git:** `git log --oneline origin/main..origin/develop` (integrado e ainda não liberado) e a última tag `vX.Y.Z`.
- **Critério de pronto** do projeto ativo e de projetos marcados como concluídos: confira cada item com evidência barata (arquivo, rota, teste existente). Não rode a aplicação.

### B2. Diagnosticar
- **Projeto e milestone ativos:** o primeiro não concluído, na ordem das dependências.
- **Milestone anterior incompleto?** O que estiver aberto num milestone anterior vem **antes** de qualquer coisa nova.
- **Integrado sem release:** milestone fechado e commits na develop desde a última tag → recomendar release.
- **Critério de pronto sem evidência** num projeto em GA → achado, não conserto.
- **Fila saudável?** Há issues Ready e desbloqueadas no milestone ativo? Se não, o que falta preparar.
- **Higiene:** títulos fora do padrão, issues sem `Type` ou sem estimativa, specs grandes demais (mais de ~5 US ou ~60 tasks).

### B3. Relatório (curto, nesta forma)
```
Auditoria — <Time> — <data>
Projeto ativo: Gestão de clientes · Milestone: Alpha (3/5 Done)
Antes de qualquer coisa nova:
  1. BRU-18 [FEAT] Spec 004 — ... em In Progress há 5 dias (Fundação · Beta) — retomar
  2. Fundação · Beta fechado e 7 commits sem release desde v0.2.0 → sugerir v0.3.0
Achados:
  - Critério "logout encerra a sessão" (Fundação) sem teste → sugerir [FIX] ou [SECURITY]
  - BRU-33 sem estimativa
Fila do milestone ativo (Ready, desbloqueadas): BRU-23, BRU-24
Recomendação: <1–3 linhas>
```
Grave em `.pipeline/auditorias/<data>.md` (local).

---

## Modo C — Assumir sistema existente

1. **Destino primeiro:** o que o sistema faz quando estiver pronto.
2. **Mapear o que existe**, com evidência (arquivo, rota, migration, teste): implementado, pela metade, e promessa sem código.
3. **Avaliar** contra a ordem padrão e as checklists de domínio aplicáveis.
4. **Propor** o roadmap: projetos já concluídos (marcados como GA, com evidência), o projeto atual e os próximos; siga o modo A a partir do A2.
5. O que estiver **errado** (não só faltando) vira achado, nunca correção silenciosa.
6. **Issues existentes fora do padrão:** proponha a renomeação (tabela "atual → padrão") e só aplique com o ok do André.

Somente leitura até o André aprovar.

---

## Modo D — Quebrar uma issue XL (ou uma spec grande demais)

1. Leia a issue e, se existir, a spec.
2. Proponha 2–6 specs (M/L) ou avulsas (XS/S) que a substituem, em fatias verticais, com bloqueios entre elas e no milestone certo.
3. Após aprovação: crie-as e cancele a original com o comentário `Quebrada em: <IDs>`.

---

## Limites

- Planeja e audita; não escreve código e não executa issues.
- Nunca move issues para In Progress, In Review, Verifying ou Done.
- Nunca cria nem altera estrutura no Linear sem aprovação explícita do André.

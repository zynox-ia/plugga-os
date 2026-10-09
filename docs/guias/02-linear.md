# 02 · Linear

O Linear é a fonte da verdade do trabalho: o que existe, em que estado está e em que ordem vem. O código e o git dizem **como** foi feito; o Linear diz **o quê** e **quando**.

## 1. Hierarquia

```
Workspace
└── Time ............ 1 cliente/sistema = 1 repositório           Bruno CRM (BRU)
    └── Projeto ..... 1 capacidade do produto                     Gestão de clientes
        ├── Milestones  Alpha · Beta · GA
        └── Issue pai ... 1 spec do Spec Kit                      [FEAT] Spec 003 — Cadastro e listagem de clientes
            └── Sub-issues  fases e user stories do tasks.md      [FEAT] Spec 003 US1 Cliente é cadastrado com nome e telefone
```

| Nível | O que representa | Regra de tamanho |
|---|---|---|
| **Time** | Um cliente ou sistema, ligado a um repositório. Tem status, labels de domínio, estimativas e automações próprios | — |
| **Projeto** | Uma capacidade do produto com começo e fim (ex.: "Gestão de clientes", "Faturamento") | Semanas |
| **Milestone** | Um portão de maturidade dentro do projeto | Sempre Alpha, Beta, GA |
| **Issue pai (spec)** | Uma especificação do Spec Kit: um pedaço entregável da capacidade | Poucos dias; até ~5 user stories |
| **Sub-issue** | Uma fase ou user story do `tasks.md` daquela spec | Horas |
| **Issue avulsa** | Trabalho que não precisa de spec: bug, hotfix, ajuste pequeno, manutenção | Horas |

**Quando algo é spec e quando é avulsa:** tudo de estimativa M ou L vira spec (issue pai), assim como todo `[SECURITY]`. Bugs e hotfixes ficam avulsos em qualquer tamanho até L, e mudanças XS/S dos demais tipos também.

## 2. Status (iguais em todos os times)

| Status | Categoria | Significado | Quem move |
|---|---|---|---|
| **Backlog** | Backlog | Registrada, ainda não preparada para execução | Agente do Linear / planejar-etapas |
| **Ready** | Unstarted | Escopo e critérios de aceite claros; está na fila. Sub-issues nascem em Ready (criadas pelo Diretor) e não entram na fila | André |
| **In Progress** | Started | Em execução pelo time de um Diretor (inclui esperar resposta sua e os ajustes que você pedir em Verifying) | Diretor |
| **In Review** | Started | PR aberto; revisão independente em andamento | Diretor |
| **Verifying** | Started | Revisão aprovada; você valida no ambiente local | Diretor |
| **Done** | Completed | Mesclada na develop (ou na main, no caso de hotfix) | Automação do GitHub / Coordenador |
| **Canceled** | Canceled | Abandonada, ou substituída ao ser quebrada | André |

**Done significa "integrada", não "em produção".** Produção é marcada pela release (guia 04).

**Sub-issues:** vão de Ready para In Progress quando a fase começa e para **In Review** quando a fase passa no portão do Diretor. Elas são fechadas automaticamente quando a issue pai é fechada (automação do time, seção 7).

## 3. Milestones: Alpha, Beta, GA

Todo projeto nasce com os mesmos três milestones (template de projeto). O nome é sempre igual; o que muda é o critério, escrito na descrição do milestone.

| Milestone | Critério de saída | Exemplo em "Gestão de clientes" |
|---|---|---|
| **Alpha** | O fluxo principal funciona de ponta a ponta na develop, mesmo simples | Cadastrar, listar e abrir um cliente |
| **Beta** | Escopo completo; validado por você e pelo cliente | Edição, busca, filtros, validações, permissões |
| **GA** | Em produção, critério de pronto do projeto atendido | Release publicada e usada pelo cliente |

As issues pai (specs) são atribuídas ao milestone que ajudam a fechar. A barra de progresso do Linear mostra quanto falta para cada portão.

## 4. Campos e labels

| Campo | Tipo | Valores | Para que serve |
|---|---|---|---|
| **Type** | Grupo de labels exclusivo (workspace) | `Feature` · `Bug` · `Hotfix` · `Refactor` · `Performance` · `Security` · `Infra` · `Chore` · `Docs` | Filtrar e medir; corresponde ao prefixo do título |
| **Estimate** | Campo nativo, escala T-shirt | `XS` · `S` · `M` · `L` · `XL` | Define a trilha: XS/S rápida; M/L SDD; XL precisa ser quebrada |
| **Priority** | Campo nativo | Urgent · High · Medium · Low | Ordem da fila dentro do milestone |
| **Severity** | Grupo de labels exclusivo, só bugs | `S1` · `S2` · `S3` · `S4` | Gravidade do defeito (independente da prioridade) |
| **Domínio** | Labels do time, não exclusivas | Definidas por projeto: `Autenticação`, `Clientes`, `Funil`, `Financeiro` | Contexto e evitar paralelismo no mesmo domínio |
| **Flags** | Labels de workspace | `Breaking Change` · `DB Migration` · `Needs Design` · `Blocked: Client` | Sinalizar riscos e bloqueios externos |

**Severity**

| Nível | Significado | Efeito |
|---|---|---|
| `S1` | Produção parada ou dado sendo corrompido | Hotfix imediato; fura a fila |
| `S2` | Funcionalidade importante quebrada, sem contorno | Próxima vaga livre |
| `S3` | Quebrada, mas com contorno | Fila normal |
| `S4` | Cosmético | Fila normal, baixa prioridade |

**Estimativa → trilha**

| Estimate | Referência | Trilha |
|---|---|---|
| `XS` | Texto, ordem, um campo existente | Rápida |
| `S` | Uma mudança localizada, até ~3 arquivos, sem migration | Rápida |
| `M` | Uma fatia vertical com tela e dados | SDD (vira spec) |
| `L` | Várias fatias relacionadas | SDD (vira spec) |
| `XL` | Grande demais | Quebrar antes (skill planejar-etapas) |

**Exigem sua aprovação do plano antes de implementar:** prefixo `[SECURITY]` e flag `Breaking Change`.

## 5. Ordem e dependências

- **Dependência entre projetos** (fim → início): "Faturamento" só começa quando "Gestão de clientes" chega a GA. Aparece na linha do tempo.
- **Relação de bloqueio entre issues** (*blocked by*): a spec 004 bloqueada pela 003. O Coordenador nunca despacha issue bloqueada.
- **Ordem da fila:** milestone mais antigo em aberto → prioridade → ordem manual do Linear.

## 6. O agente do Linear

O agente nativo do Linear substitui o antigo Hermes: você conversa com ele e ele cria as issues no padrão. Para isso:
- **Guidance do workspace:** cole o conteúdo de [`fluxo/linear/guidance-agente-linear.md`](../fluxo/linear/guidance-agente-linear.md) em *Settings → Agents → Guidance*.
- **Templates:** crie os templates de [`fluxo/linear/templates.md`](../fluxo/linear/templates.md) (issue pai, sub-issue, bug, hotfix, avulsa e o template de projeto).
- **Skill `/nova-issue`:** [`fluxo/linear/skills/nova-issue.md`](../fluxo/linear/skills/nova-issue.md), salva como skill pessoal.

**Pelo Traycer:** a mesma tarefa é feita pela skill `registrar-linear`, em qualquer agente do projeto (`/registrar-linear <pedido>`). Ela também é usada pelo Diretor para criar as sub-issues de cada spec.

## 7. Configuração de um time novo

Checklist, uma vez por cliente:

1. **Time:** nome `<Cliente> <Sistema>`, identificador de 3 letras.
2. **Status** (*Settings → Team → Workflow*): Backlog · Ready · In Progress · In Review · Verifying · Done · Canceled.
3. **Sub-issues:** ativar "fechar sub-issues quando a issue pai for fechada".
4. **Estimates:** escala T-shirt.
5. **Labels de domínio** do time (as do primeiro projeto).
6. **GitHub:** conectar o repositório e configurar as automações:
   - PR aberto ou em rascunho: **nenhuma ação**;
   - PR mesclado em `develop`: **Done**;
   - PR mesclado em `main` com branch `hotfix/*`: **Done**.
7. **Formato de branch** (*Settings → Integrations → GitHub*): `<tipo>/<identificador>-<título>` (ver guia 03).
8. **Releases:** pipeline do repositório ligado à `main` (guia 04).
9. **Project template:** "Projeto padrão" com os milestones Alpha, Beta e GA.

As labels de workspace (`Type`, `Severity`, flags) são criadas uma vez só e valem para todos os times. A preparação da casa confere e cria as que faltarem.

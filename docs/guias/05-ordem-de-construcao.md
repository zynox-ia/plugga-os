# 05 · Ordem de construção

O erro mais comum ao planejar é decidir a ordem **tarefa por tarefa**. Times profissionais partem de um esqueleto fixo e encaixam as tarefas nele.

## 1. A ordem padrão

Quase todo sistema é construído nesta sequência. Um projeto pode juntar passos, mas não deve inverter a ordem sem uma decisão registrada.

| # | Passo | O que entra | Por que nesta posição |
|---|---|---|---|
| 1 | **Fundação** | Projeto rodando, autenticação, layout base, deploy, CI | Tudo depende disso |
| 2 | **Dados** | Entidades principais e cadastros simples | As telas precisam do que mostrar |
| 3 | **Esqueleto andante** | O fluxo principal de ponta a ponta, mínimo e simples | Prova a arquitetura cedo e já gera valor |
| 4 | **Engordar o fluxo** | Regras de negócio, validações, telas secundárias, filtros | Só faz sentido sobre um fluxo que já funciona |
| 5 | **Integrações externas** | Pagamentos, e-mail, WhatsApp, APIs de terceiros | Dependem do fluxo e dos dados estáveis |
| 6 | **Relatórios e painéis** | Dashboards, exportações | Dependem de dados reais |
| 7 | **Polimento** | Performance, acabamento visual, acessibilidade | Por último, sobre o que já está estável |

**Esqueleto andante** (*walking skeleton*): a versão mais fina possível do fluxo principal, ligando tudo do banco à tela. Num CRM: cadastrar cliente → criar proposta → mudar de etapa → ver no funil. Feio, simples, mas inteiro.

## 2. Como os passos viram estrutura no Linear

| Passo | Vira | Milestone típico |
|---|---|---|
| Fundação | Projeto "Fundação" | Alpha: login e deploy no ar |
| Dados + esqueleto andante | Primeiro projeto de negócio (ex.: "Gestão de clientes") | Alpha: o fluxo de ponta a ponta |
| Engordar o fluxo | Specs seguintes do mesmo projeto | Beta |
| Integrações | Projetos próprios ("Pagamentos", "Notificações") | Alpha → GA |
| Relatórios | Projeto "Relatórios" | Alpha → GA |
| Polimento | Specs de `[PERF]`, `[REFACTOR]` e ajustes | GA |

## 3. Decidir entre duas coisas

```
Uma precisa da outra para funcionar?
 ├─ Sim → a outra vem antes. Registre "blocked by" no Linear.
 └─ Não → qual tem mais valor e mais risco?
          → essa vem antes (o que pode dar errado, você quer descobrir cedo).
```

| Situação | Decisão |
|---|---|
| Cadastro de cliente × funil de vendas | Cadastro antes: o funil precisa de clientes |
| Integração de pagamento × tela de relatórios | Pagamento antes: mais risco e mais valor |
| Filtro na lista × exportar CSV | Empate técnico; vai antes o que o cliente usa mais |
| Novo provedor de e-mail × qualquer coisa | Primeiro a **decisão** (qual provedor), depois a construção |

## 4. Como fatiar

**Fatias verticais, nunca camadas.** Cada spec e cada user story entrega algo que alguém consegue testar na tela.

| Fatia vertical (certo) | Camada (errado) |
|---|---|
| `Cliente é cadastrado com nome e telefone` | `Criar tabelas do banco` |
| `Lista de clientes pode ser filtrada por etapa` | `Fazer todo o backend de clientes` |
| `Proposta muda de etapa arrastando no funil` | `Criar todas as telas do CRM` |

**Tamanho de cada coisa**

| Unidade | Tamanho saudável | Sinal de que ficou grande |
|---|---|---|
| Projeto | Semanas; 2–6 specs | Mais de ~8 specs |
| Spec (issue pai) | Poucos dias; até ~5 user stories | Mais de ~60 tasks ou mais de uma semana |
| User story (sub-issue) | Horas | Mais de um dia |

Spec grande demais (como uma "fundação" com 15 user stories) atrasa tudo: a revisão fica enorme, a spec envelhece antes de terminar e o paralelismo trava. Quebre em specs menores dentro do mesmo projeto.

## 5. Decisões antes de construção

Antes de uma spec que depende de uma escolha (provedor de e-mail, modelo de dados, biblioteca de autenticação), a escolha vira pergunta para você, com uma recomendação, e a resposta vai para `docs/roadmap/decisoes.md`:

```markdown
## 2026-10-09 — Provedor de e-mail transacional
Decisão: Resend
Motivo: API simples, plano gratuito suficiente para o volume atual, SDK oficial para Node
Alternativas consideradas: Amazon SES (mais barato em volume, configuração mais longa)
```

## 6. Auditoria: onde estamos?

A skill `planejar-etapas` (modo Auditar) responde, ao abrir uma sessão:
- qual projeto e milestone estão ativos e quanto falta;
- se ficou algo **incompleto num milestone anterior**, que deve ser resolvido **antes** de qualquer coisa nova;
- se algum critério de pronto de um projeto "concluído" não tem evidência;
- se há milestone fechado sem release;
- se a fila do milestone ativo tem issues prontas e desbloqueadas.

## 7. Pasta do roadmap

```
docs/roadmap/
├── ROADMAP.md      destino, projetos na ordem, milestones, critérios de pronto, links do Linear
└── decisoes.md     decisões tomadas e por quê
```

O Linear guarda o estado do trabalho; o `ROADMAP.md` guarda o plano e o raciocínio. As auditorias ficam em `.pipeline/auditorias/` (local, fora do git).

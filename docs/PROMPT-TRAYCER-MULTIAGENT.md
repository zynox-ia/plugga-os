# Prompt Traycer — Epic Plugga OS (multi-agentes)

Cole o bloco abaixo no Traycer como **epic / briefing inicial**.  
Repo: `https://github.com/zynox-ia/plugga-os` (privado)  
Workspace local: clone deste repo (não usar o extract 3.2GB de `knowledge/openclaw` no git).

---

## EPIC: Plugga OS — Bloco A (fundação profissional)

### Contexto do produto

Estamos construindo o **Plugga/Waze OS**: sistema operacional interno da Plugga (CRM, PluggaMob, OPM, financeiro operacional, integrações, API para agentes).

Fontes obrigatórias (ler antes de codar):

1. `docs/PRD-plugga-waze-os.md` (v1.1) — contrato de produto  
2. `docs/fontes/modelo-telas-mvp-2026-08-05.md` — 28 telas  
3. `docs/fontes/diagnostico-escopo-sistema-proprio-2026-08-05.md` — diagnóstico  
4. `docs/mapa-produto-mvp.md` — mapa resumido  
5. `docs/mockup/index.html` — direção visual (marca Plugga)

### Regra crítica (não negociável)

**NÃO alterar operação real:** nenhum cron, Bitrix write, WhatsApp write em produção, OMIE write, OpenClaw config, ou cutover.  
Tudo começa **local + CI**. Integrações só em modo **read-only / mock** neste epic.

### Objetivo deste epic (Bloco A)

Entregar a **fundação robusta** do monorepo, pronta para desenvolvimento profissional e multi-agente:

1. Monorepo `pnpm` + Turborepo  
2. `apps/web` (Next.js) + `apps/api` (NestJS) + `packages/shared` + `packages/config`  
3. Docker Compose: Postgres + Redis  
4. CI GitHub Actions: lint, typecheck, unit, build  
5. ADRs em `docs/adr/`  
6. `docs/AGENT.md` + templates de Issue/PR  
7. Shell web navegável com menu do PRD §7 (mock ok)  
8. API health + endpoint stub `POST /agent-actions` + modelagem inicial  
9. Tela Integrações com cards: Bitrix, OMIE, PluggaMob, PagBank, **WhatsApp (P0)**, Telegram (status mock `read-only`)  
10. Tela Jobs (inventário mock)  
11. README atualizado com como rodar local

**Fora deste epic:** write em CRM/OPM/fechamento, envio WhatsApp real, bridge Bitrix write, as 28 telas completas.

### Critérios de aceite

- [ ] `pnpm install && pnpm build && pnpm test && pnpm lint` passam  
- [ ] CI verde na `main` / PR  
- [ ] `docker compose up -d` sobe postgres+redis  
- [ ] Web abre com menu das 12 áreas (itens V2 podem ser “em breve”)  
- [ ] API `/health` 200  
- [ ] Integrações mostra WhatsApp como card P0  
- [ ] ADRs commitados  
- [ ] Nenhum secret no repo; `.env.example` apenas  
- [ ] Identidade visual: Petróleo `#003333`, Folha `#00AF88`, Areia `#E0DBC7`, tipografia Anybody/Anek quando possível  

### Trabalho em paralelo (worktrees)

Cada agente trabalha em **branch/worktree própria**.  
PRs pequenos, 1 tema por PR.  
Orquestrador integra e resolve conflitos.

---

## Time multi-agente — papéis fixos

### 1) Cursor Auto — `ORCHESTRATOR`

**Modelo:** Auto (Cursor)  
**Papel:** chefe de epic / coordenação

**Faz:**
- Quebrar o epic em tasks ordenadas e dependências  
- Criar/atualizar checklist e combinar handoffs  
- Abrir PRs de merge/integração quando as peças estiverem prontas  
- Garantir que ninguém viole a regra de operação  
- Pedir review ao Opus nos PRs críticos  
- Manter `docs/AGENT.md` e board alinhados ao PRD  

**Não faz:**
- Arquitetura profunda sozinho  
- Implementação pesada de domínio  

**Entregáveis:** plano de tasks, ordem de merge, PR final de integração do Bloco A.

---

### 2) Claude Opus 4.8 — `ARCHITECT`

**Modelo:** Claude Opus 4.8  
**Papel:** arquiteto / tech lead / reviewer

**Faz:**
- Escrever ADRs: monorepo, NestJS+Next, Postgres, Auth/RBAC, integrações read-only→write, WhatsApp P0  
- Definir boundaries: `apps/api` modules, `packages/shared` contracts  
- Revisar PRs de Sol/Sonnet/Luna (segurança, acoplamento, desvio do PRD)  
- Validar modelo inicial de `agent_actions`, `event_log`, `integration`  
- Diz “não” a overengineering (sem Kafka/K8s/microserviços agora)  

**Não faz:**
- Scaffold mecânico completo (deixa pro Sol)  
- Pixel-pushing de UI  

**Entregáveis:** `docs/adr/*.md`, review comments, OK/NO-GO de merge.

---

### 3) Codex Sol — `PLATFORM`

**Modelo:** Codex Sol  
**Papel:** platform / backend foundation

**Faz:**
- Scaffold monorepo (pnpm/turbo/tsconfig/eslint)  
- NestJS bootstrap: health, config module, logging estruturado  
- Docker Compose (postgres, redis) + `.env.example`  
- CI workflows  
- Esqueleto Drizzle/Prisma (escolher 1 com ADR do Opus; preferência Prisma se Opus não objetar)  
- Migrations iniciais mínimas: users/roles stub, `agent_actions`, `integrations`, `job_runs`  
- Stub `POST /agent-actions` com validação zod/DTO  

**Não faz:**
- UI além do necessário para health checks  
- Regras de negócio CRM/OPM  

**Entregáveis:** PRs `chore/platform-*`, API rodando local, CI verde.

---

### 4) Claude Sonnet 5 — `FEATURE`

**Modelo:** Claude Sonnet 5  
**Papel:** full-stack de produto (fatias verticais)

**Faz:**
- Ligar web↔api para telas do Bloco A  
- Dashboard mock com cards do PRD  
- Central de pendências mock  
- Integrações (UI + API read mock) incluindo **WhatsApp P0**  
- Jobs mock (lista + status)  
- Auth stub / sessão local se PLATFORM já tiver base  

**Não faz:**
- Redesenhar stack  
- Mexer em CI/docker sem necessidade  

**Entregáveis:** PRs `feat/shell-*`, `feat/integrations-*`, `feat/jobs-*`.

---

### 5) Codex Luna — `UI_QA`

**Modelo:** Codex Luna  
**Papel:** UI system + qualidade

**Faz:**
- Aplicar marca Plugga no shell (cores, tipografia, layout do mockup)  
- Componentes base: sidebar, topbar, cards, pills, tabelas  
- Acessibilidade básica e responsivo desktop-first  
- Playwright smoke: login/shell → navegar Dashboard, Integrações, Jobs  
- Checklist visual vs `docs/mockup/index.html`  

**Não faz:**
- Domínio financeiro/OPM  
- Infra CI além de e2e job  

**Entregáveis:** PRs `ui/shell-brand`, `test/e2e-smoke`.

---

## Protocolo de colaboração (Traycer)

1. **ORCHESTRATOR** publica o plano e a ordem.  
2. **ARCHITECT** fecha ADRs (bloqueante para PLATFORM).  
3. **PLATFORM** sobe base; avisa inbox quando `api` + compose + CI estiverem verdes.  
4. **FEATURE** e **UI_QA** partem em paralelo depois do ok do PLATFORM (UI_QA pode começar tokens/layout cedo em worktree, mas não mergeia antes da base).  
5. Reviews: todo PR de FEATURE/PLATFORM passa por **ARCHITECT**; UI por **UI_QA** + ORCHESTRATOR.  
6. Comunicação entre agentes: handoff explícito (“pronto para X”, “bloqueado por Y”, “precisa ADR Z”).  
7. Conflitos de merge: ORCHESTRATOR resolve; se for design de domínio, sobe pro ARCHITECT.

### Mensagens de handoff (usar assim)

```text
Handoff → PLATFORM
ADRs 0001–0005 aprovados. Pode scaffold monorepo + Nest + compose + CI.
Restrição: sem write em integrações reais.
```

```text
Handoff → FEATURE
API /health + tabelas stub prontas na branch platform/xxx.
Implementar shell + Integrações (WhatsApp P0) + Jobs mock contra contratos em packages/shared.
```

```text
Handoff → ARCHITECT
PR #N pronto para review: feat/integrations. Foco: vazamento de secret, modo read-only, desvio do PRD §11.1.
```

---

## Definição de pronto do epic

Bloco A mergeado em `main` com CI verde, docs/ADR/AGENT.md ok, app navegável, API saudável, integrações mock (WhatsApp visível como P0), e zero contato write com sistemas reais.

Próximo epic (não agora): **Bloco B — Auth/RBAC real + Integrações read-only com dados** → depois **CRM PluggaMob write**.

---

## Primeira mensagem do ORCHESTRATOR (Auto)

Comece por:

1. Confirmar repo e ler o PRD §6–§11 e §15 Fase 0.  
2. Criar as tasks do Bloco A e atribuir aos 4 agentes acima.  
3. Pedir ADRs ao ARCHITECT.  
4. Só então liberar PLATFORM.

Trabalhem como time de engenharia sênior: pouco teatro, muito contrato, PRs pequenos, operação real intocável.

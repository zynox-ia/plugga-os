# Prompt para o OpenClaw (DK Junior / Plugga)

Cole o bloco abaixo na conversa com o OpenClaw.

---

## REGRA CRÍTICA — NÃO MUDAR A OPERAÇÃO AGORA

Isto é **somente planejamento**.
**Não** desative jobs, crons, automações, skills, integrações Bitrix, Telegram ou qualquer serviço.
**Não** altere configs, `openclaw.json`, permissões nem rotinas.
A operação continua **100% como está** até decidirmos, em etapa futura e explícita, o cutover.
Agora: inventário + escopo + handoff. Zero mudança operacional.

## CONTEXTO

Estamos iniciando um projeto para **desenvolver um sistema próprio** da Plugga/Waze Energia, com o objetivo de:

1. **Extrair e consolidar** o conhecimento, processos, automações e inteligência que hoje estão centralizados em você (OpenClaw).
2. **Construir um sistema** (CRM + operações + auditorias + APIs) que assuma as funcionalidades que hoje dependem de você e/ou do Bitrix.
3. **No futuro**, você (OpenClaw) continua como **agente assistente** — ajudando pessoas e orquestrando — mas **não** como o lugar onde vivem relatórios de auditoria, CRM, filas operacionais e a maior parte das automações. Isso passa a ser do sistema, acessível via API.

Já fizemos uma extração técnica da VPS (`/root/.openclaw`) para pasta local `plugga-sistema/knowledge/`, incluindo:
- workspace core (`SOUL`, `AGENTS`, `MAPA`, `MEMORY`, brains, skills, scripts)
- workspaces dos agentes filhos
- configs de agentes (sem sessions)
- memória SQLite
- cron (`jobs.json` — ~57 jobs)
- flows
- e de propósito os arquivos `CRM_PLUGGAMOB_BLUEPRINT_v2` + `CRM_PLUGGAMOB_PROJETO_v1`

**Excluímos** de propósito: sessions (~19GB), media, backups, reports em massa, credentials/secrets.

## O QUE EU PRECISO DE VOCÊ AGORA

Não quero código ainda. Quero um **diagnóstico + escopo** honestos, como se você fosse o arquiteto que já vive a operação.

Responda em português, estruturado, com substância. Se algo for incerto, marque como **hipótese** vs **fato**.

### 1) Inventário operacional (o que existe de verdade hoje)

Liste e classifique o que a operação usa no dia a dia:

| Domínio | O que existe hoje | Onde vive (OpenClaw / Bitrix / script / cron / manual) | Quem usa | Criticidade (P0/P1/P2) |
|---------|-------------------|--------------------------------------------------------|----------|------------------------|

Cubra no mínimo:
- CRM / leads / pipeline comercial
- OS / engenharia / obras
- Financeiro / pagamentos / alertas
- OPM / auditoria energética / relatórios
- PluggaMob / EV Point / eletropostos / cupons / OCPP
- Conteúdo / Cafeína / marketing
- Backoffice / demandas / atestados / processos
- Integrações (Bitrix, Omie, Telegram, Cloudflare, etc.)

### 2) O que DEVE virar sistema (sair do OpenClaw e/ou do Bitrix)

Para cada item candidato a sistema, diga:
- **Por que** não deveria mais depender de agente
- **Dados** necessários (entidades, campos, estados)
- **Regras de negócio** críticas
- **APIs/eventos** que o sistema precisaria expor
- **O que o OpenClaw ainda faria** depois (só assistência? disparo? revisão?)

### 3) O que DEVE ficar no OpenClaw (agente assistente)

Liste o que continua fazendo sentido como agente:
- decisão estratégica
- redação / análise ad-hoc
- orquestração humana
- exceções
- etc.

### 4) Bitrix — mapa de substituição

Seja explícito:
- Quais módulos/uso do Bitrix a operação realmente depende hoje?
- O que é CRM de verdade vs “gambiarra operacional”?
- O que um CRM próprio precisaria ter no **MVP** para o Bitrix deixar de ser crítico?
- O que **não** tentar substituir no começo?

Use o `CRM_PLUGGAMOB_BLUEPRINT` / `PROJETO` se ainda forem válidos. Se estiverem desatualizados, diga o que mudou.

### 5) Crons e relatórios → produto

Olhando os jobs atuais (ex.: relatórios PluggaMob, monitor cupons, batimento OS, alertas financeiros, auditorias, Cafeína), classifique cada família:
- **Automatizar no sistema** (job/API/scheduler)
- **Manter no OpenClaw** (precisa julgamento)
- **Matar** (não agrega / redundante)

### 6) Arquitetura sugerida do sistema (MVP → V2)

Proponha:
- módulos do MVP (máx. 5)
- módulos da V2
- stack preferida (se tiver opinião operacional — não acadêmica)
- como o OpenClaw consome o sistema via API
- como humanos acessam (web app? painéis?)

### 7) Riscos e ordem de ataque

- Top 10 riscos de migrar errado
- Ordem recomendada de implementação (semanas 1–2, 3–4, 5–8)
- Dependências (dados sujos no Bitrix, permissões, integrações)

### 8) Entregável final deste prompt

Ao final, produza:

**A) One-pager do produto** (o que é / para quem / o que não é)  
**B) Backlog MVP** (lista priorizada, formato: épico → features)  
**C) Prompt de handoff** curto que eu posso passar para o time de desenvolvimento (eu + Cursor) já com escopo fechado  

## REGRAS DE RESPOSTA

- Seja direto e opinativo. Discorde se o plano de “substituir tudo de uma vez” for ruim.
- Prefira **menos módulos bem definidos** a um monólito genérico.
- Não invente integrações que não existem. Se não souber, diga “preciso verificar X”.
- Quando citar arquivos/pastas do workspace, use caminhos reais.
- Se faltar contexto que só está em sessions/relatórios não lidos, diga o que precisa puxar.

Pode começar pelo inventário e ir fechando até o handoff.

# PRD — Plugga/Waze OS

| Campo | Valor |
|---|---|
| **Produto** | Plugga/Waze OS |
| **Versão do PRD** | 1.1 |
| **Data** | 05/08/2026 |
| **Status** | Rascunho para validação |
| **Owner de produto** | A definir (Dilkson / operação Plugga) |
| **Owner técnico** | Time de desenvolvimento + Cursor |
| **Timezone oficial** | America/Manaus |

### Fontes oficiais deste PRD

1. `knowledge/.../diagnostico-escopo-sistema-proprio-2026-08-05.md`
2. `knowledge/.../modelo-telas-mvp-2026-08-05.md`
3. Blueprint CRM PluggaMob v2
4. Extração local OpenClaw (`knowledge/openclaw/`)
5. Mockup visual de referência: `docs/mockup/index.html` (apenas direção de marca/UI)

### Regra crítica de operação

> Este PRD **não autoriza** alteração em crons, jobs, configs, skills, Bitrix, OpenClaw, Telegram, WhatsApp, OMIE, PluggaMob ou qualquer serviço em produção.  
> Cutover só por domínio, com aprovação explícita, após período de operação em paralelo.

---

## 1. Resumo executivo

A Plugga/Waze centralizou grande parte da operação no **OpenClaw** (agente + scripts + crons + memória) e no **Bitrix24** (CRM + workflows improvisados). Isso funciona, mas não escala com segurança: estado operacional, filas, regras financeiras, documentos e KPIs estão espalhados.

**Plugga/Waze OS** é o sistema próprio que passa a ser a **fonte de verdade operacional**. O OpenClaw permanece como **agente assistente** via API. O Bitrix vira **legado/ponte temporária**. OMIE, PagBank e PluggaMob/OCPP continuam fontes externas.

### Em uma frase

Sistema operacional interno web + API para CRM, PluggaMob, financeiro operacional, OPM, compras e automações — com trilha de auditoria e agentes IA como consumidores, não como banco de dados.

---

## 2. Problema

Hoje a operação depende de:

| Camada | Papel atual | Dor |
|---|---|---|
| OpenClaw | Assistente + executor + memória + scripts | Estado e regras críticas vivem no agente |
| Bitrix24 | CRM + OPM + compras + tarefas | Mistura CRM real com gambiarra operacional |
| Crons/scripts | Relatórios, avisos, gates, D+14 | Pouca observabilidade, difícil auditar |
| Planilhas/arquivos | CRM PluggaMob, fechamentos, bases | Sem fila, sem conversão rastreável |
| Canais (Telegram/WhatsApp) | Interface humana | Viraram “sistema” sem serem fonte de verdade |

Consequências: onboarding difícil, risco financeiro no fechamento PluggaMob, OPM dependente de cards/anexos, compras rodando em funil CRM, cutover impossível sem produto próprio.

---

## 3. Objetivos

### 3.1 Objetivos de negócio

1. Tirar do OpenClaw/Bitrix a responsabilidade de guardar **estado operacional crítico**.
2. Criar CRM de reativação PluggaMob (R0–R6) mensurável.
3. Tornar fechamento PluggaMob / D+14 auditável e aprovável.
4. Dar workflow nativo ao OPM (hoje Bitrix C7).
5. Preparar saída gradual do Bitrix sem big-bang.
6. Expor API para o OpenClaw operar com trilha (`agent_actions`).

### 3.2 Objetivos de produto (MVP)

1. Web app navegável com menu completo (itens V2 podem aparecer como “em breve”).
2. 28 telas MVP detalhadas neste PRD.
3. Modo **espelho read-only** antes de qualquer write.
4. Primeiro domínio write: **CRM PluggaMob + Ops**.
5. Depois: **Fechamento** → **OPM** → **Compras** (MVP tardio).

### 3.3 Não-objetivos (MVP)

1. Substituir OpenClaw.
2. Substituir Bitrix por completo.
3. Substituir OMIE ou PagBank.
4. Construir plataforma OCPP própria.
5. Portal do cliente/parceiro.
6. Engenharia/O.S. madura.
7. Marketing/Cafeína como produto.
8. BI sofisticado sem dado limpo.
9. Migrar todo histórico/anexo do Bitrix.
10. Automação de envio externo sem aprovação humana.

---

## 4. Personas e papéis

| Persona | Precisa no dia a dia |
|---|---|
| **Dilkson** | Dashboard, aprovações, KPIs CRM/financeiro, visão P0 |
| **Operação PluggaMob** | Fila CRM, usuários EV, sessões, locais, avisos, cupons |
| **Financeiro PluggaMob** | Fechamentos, conciliação, D+14, exports |
| **Financeiro Waze/Plugga** | Alertas D+14 OMIE, contas, comprovantes |
| **OPM / Zulk** | Ciclos, docs, auditoria, relatório, envio |
| **Compras** | Solicitações, cotações, aprovações, scorecard |
| **Comercial** | Leads/oportunidades, clientes (read → write gradual) |
| **DK / Tech** | Jobs, integrações, ações do agente, saúde |
| **OpenClaw (agente)** | API: consultar, comentar, rascunhar, pedir aprovação — nunca ser fonte de verdade |

---

## 5. Princípios de produto

1. **Sistema = fonte de verdade; OpenClaw = assistente.**
2. **Não copiar o Bitrix** — separar CRM real de workflow operacional.
3. **Kanban + ficha + timeline + anexos + aprovação** (o que o Bitrix faz bem).
4. **Read-only primeiro; write por domínio; cutover explícito.**
5. **Toda ação de agente gera `agent_action` auditável.**
6. **Envio externo (WhatsApp/Telegram/cliente) exige política + log; críticos exigem aprovação humana.**
7. **Timezone Manaus em toda regra de data/hora.**
8. **Menos tarefa avulsa; mais entidade de domínio.**
9. **Identidade visual Plugga:** Petróleo `#003333`, Folha `#00AF88`, Areia `#E0DBC7`, tipografia Anybody + Anek Devanagari.
10. **Preferir menos módulos bem definidos** a monólito genérico.

---

## 6. Escopo MVP

### 6.1 Módulos

| # | Módulo | Prioridade | Papel no MVP |
|---|---|---|---|
| 1 | Core / Workflow / Auth | P0 | Usuários, áreas, permissões, tarefas, aprovações, docs, logs |
| 2 | PluggaMob CRM + Ops | P0 | Reativação R0–R6, usuários, sessões, locais, avisos, cupons |
| 3 | Financeiro PluggaMob | P0 | Fechamento, conciliação TOKEN/RFID, D+14, aprovação |
| 4 | OPM | P0 | Ciclos, docs, auditoria, relatório, bridge Bitrix C7 |
| 5 | Integrações & Scheduler | P0 | Bitrix/OMIE/PluggaMob/PagBank/**WhatsApp**/Telegram + jobs com log/retry |
| 6 | CRM comercial (Vendas C0) | P1 | Começa read-only; write controlado depois |
| 7 | Financeiro OMIE operacional | P1 | Alertas/contas/comprovantes (OMIE continua oficial) |
| 8 | Compras | P1 tardio | Workflow nativo no lugar do funil C43 |
| 9 | Agentes IA | P0 | Trilha de ações / aprovações do OpenClaw |
| 10 | Documentos | P1 | Biblioteca mínima ligada a processos |

### 6.2 Ordem estratégica recomendada

1. Shell + observabilidade (Jobs/Integrações)  
2. Espelho Bitrix/PluggaMob read-only  
3. **CRM PluggaMob write**  
4. **PluggaMob Ops write**  
5. **Fechamento/D+14**  
6. **OPM**  
7. Compras (V1.1 se necessário)

---

## 7. Arquitetura de informação — menu

```text
Plugga/Waze OS
├── 1. Dashboard
│   ├── Visão geral
│   ├── Pendências críticas
│   ├── Agenda operacional
│   └── Jobs e integrações (atalho)
├── 2. CRM
│   ├── Leads e oportunidades
│   ├── Clientes
│   ├── Empresas
│   ├── Funil comercial
│   ├── Reativação PluggaMob
│   └── Campanhas e contatos
├── 3. OPM
│   ├── Ciclos mensais
│   ├── Faturas recebidas
│   ├── Auditorias
│   ├── Relatórios
│   ├── Aprovações
│   ├── Envio ao cliente
│   └── KPIs
├── 4. PluggaMob
│   ├── Dashboard
│   ├── Usuários EV Point
│   ├── Sessões
│   ├── Locais e conectores
│   ├── Ocupação ao vivo
│   ├── Cupons
│   ├── Fechamentos
│   ├── D+14 e repasses
│   └── Alertas e mensagens
├── 5. Financeiro Operacional
│   ├── D+14 Waze/Plugga
│   ├── Contas a pagar
│   ├── Contas a receber
│   ├── Alertas
│   ├── Comprovantes
│   └── Integração OMIE
├── 6. Compras e Suprimentos
│   ├── Solicitações
│   ├── Cotações
│   ├── Aprovações
│   ├── Pagamentos
│   ├── Recebimentos
│   └── Scorecard
├── 7. Engenharia e Obras          [V2 / em breve]
├── 8. Documentos
├── 9. Jobs e Automações
├── 10. Integrações
├── 11. Agentes IA
└── 12. Administração
```

Itens V2 no menu podem existir como “em breve”, para o produto já nascer com arquitetura futura.

---

## 8. Inventário completo das 28 telas MVP

Cada tela abaixo é requisito de produto. Detalhamento adicional (campos longos) está no anexo `modelo-telas-mvp-2026-08-05.md`; o PRD fixa o contrato mínimo.

---

### Tela 1 — Dashboard Geral

- **Usuários:** Dilkson, gestores, DK, operação  
- **Objetivo:** saúde da operação em ~30s  
- **Abas:** Hoje · Semana · P0/P1 · Integrações · Pendências por área  
- **Conteúdo:** KPIs (tarefas críticas, OPM atrasado, fechamentos, alertas PluggaMob, jobs falhos, aprovações); lista “atenção agora”; vencimentos; eventos  
- **Ações:** abrir pendência; filtrar área; pedir resumo ao agente; criar processo; ir ao detalhe  

### Tela 2 — Central de Pendências

- **Usuários:** gestores e operadores  
- **Objetivo:** substituir parte da visão de tarefas Bitrix  
- **Abas:** Minhas · Da minha área · Atrasadas · Sem dono · Sem área · Aguardando aprovação  
- **Conteúdo:** lista/kanban com título, área, dono, prazo, criticidade, origem, vínculo, status  
- **Ações:** atribuir; alterar prazo c/ justificativa; comentar; anexar; concluir c/ resultado; escalar  
- **Regra:** pendência crítica exige área + dono + prazo + origem + status  

### Tela 3 — CRM / Leads e Oportunidades

- **Usuários:** comercial, Dilkson, Thiago  
- **Base Bitrix:** VENDAS `categoryId 0` (início read-only)  
- **Abas:** Kanban · Lista · Leads novos · Revisitados · Ganhos · Perdidos · Fontes  
- **Estágios:** Leads → Qualificação → Estudo de economia → Vendas → Sucesso do cliente → Revisitar → Ganho / Perdido  
- **Ações:** criar/qualificar/converter; registrar contato; proposta; ganho/perdido; enviar p/ OPM ou PluggaMob  

### Tela 4 — Clientes

- **Usuários:** quem consulta histórico  
- **Objetivo:** ficha única (CRM + OPM + financeiro + PluggaMob)  
- **Abas:** Todos · Ativos · Prospects · OPM · PluggaMob · Associações/GD · Inativos  
- **Ações:** abrir ficha; contato; vincular UC; criar ciclo OPM; oportunidade; documento  

### Tela 5 — Ficha do Cliente CRM

- **Tipo:** detalhe  
- **Abas:** Resumo · Contatos · Oportunidades · OPM · PluggaMob · Financeiro · Documentos · Timeline · Ações do agente  
- **Deve mostrar:** cadastro, responsáveis, produtos, UCs, status, histórico unificado  

### Tela 6 — Reativação PluggaMob (CRM EV)

- **Usuários:** Dilkson, Thiago, operação PluggaMob  
- **Objetivo:** blueprint R0–R6 vira produto  
- **Abas:** Fila do dia · Segmentos · Campanhas · Contatos · Conversões · KPIs  
- **Conteúdo:** kanban do dia; contagens R0–R6; campanhas c/ limite/dia; conversão 7/14/30d  
- **Ações:** trabalhar fila; registrar contato; opt-out; criar/aprovar campanha; recalcular segmentos  
- **Réguas:** ver §9.1  

### Tela 7 — Usuário EV Point / PluggaMob

- **Tipo:** ficha  
- **Abas:** Resumo · Sessões · Carteira · Segmento · Campanhas · Contatos · Timeline  
- **Campos-chave:** app_user_id, telefone mascarado, saldo, recência, lealdade, gap, segmento atual/anterior  

### Tela 8 — Sessões de Recarga

- **Abas:** Todas · Ativas · Finalizadas · Com erro · Por local · Por parceiro · Financeiro  
- **Conteúdo:** id, usuário, local, conector, início/fim, kWh, valor, status, TOKEN/RFID, flags cupom/privilegiado  
- **Ações:** filtrar; abrir detalhe; marcar para conciliação; exportar  

### Tela 9 — Detalhe da Sessão

- **Abas:** Resumo · Técnica · Financeira · Pagamento · Fechamento · Logs  
- **Deve permitir:** vincular pagamento; ver classificação; abrir fechamento  

### Tela 10 — Locais e Conectores

- **Abas:** Locais · Estações · Conectores · Políticas · Status  
- **Hierarquia:** Parceiro → Local → Estação → Conector  
- **Regra:** local/parceiro inativo não dispara push  

### Tela 11 — Detalhe do Local / Eletroposto

- **Abas:** Resumo · Conectores · Ocupação · Avisos · Incidentes · Config  
- **Regra crítica:** validar ocupação real antes de envio; se inconclusivo → bloquear e logar  

### Tela 12 — Cupons PluggaMob

- **Abas:** Ativos · Uso · Abuso · Relatórios · Histórico  
- **Ações:** auditar uso; cruzar com fechamento; exportar  

### Tela 13 — Fechamentos PluggaMob

- **Abas:** Semanas · Por parceiro · Em auditoria · Prontos · Aprovados · Exportados  
- **Ações:** importar sessões; importar PagBank; reconciliar; abrir detalhe  

### Tela 14 — Detalhe do Fechamento

- **Abas:** Resumo · Sessões · Classificação · PagBank · Divergências · Taxa/Repasse · Aprovação · Export  
- **Classificações:** topup novo · saldo antigo · cupom · privilegiado · sem pagamento · estorno · crédito D+14  
- **Regra:** não aprovar se auditoria não bater; chave = TOKEN/RFID (não telefone)  

### Tela 15 — D+14 e Repasses

- **Abas:** A liberar · Liberados · Bloqueados · Por parceiro · Calendário  
- **Ações:** liberar/bloquear com responsável e log  

### Tela 16 — OPM / Ciclos Mensais

- **Base Bitrix:** OPERAÇÃO MÊS A MÊS `categoryId 7` (131 deals)  
- **Abas:** Kanban · Lista · Atrasados · Sem docs · Em auditoria · Aguardando envio · Enviados · Churn  
- **Estágios nativos sugeridos:** Aguardando fatura → Fatura recebida → Aguardando NF/encargos → Em auditoria → Relatório → Validação → Aprovado → Enviar → Enviado → Bloqueado → Churn  

### Tela 17 — Detalhe do Ciclo OPM

- **Abas:** Resumo · Documentos · Auditoria · Relatório · Aprovação · Envio · Bitrix bridge · Timeline · Agente  
- **Regras:** não fechar sem encargos (ou premissa explícita); não enviar sem aprovação; ambiguidade UC/período bloqueia avanço  

### Tela 18 — Auditorias de Fatura

- **Abas:** Fila · Em análise · Concluídas · Com exceção · Premissas  
- **Papel OpenClaw:** análise consultiva; estado da auditoria fica no sistema  

### Tela 19 — Relatórios OPM/Auditoria

- **Abas:** Rascunhos · Em validação · Aprovados · Enviados · Arquivo  
- **Ações:** gerar/versionar; pedir revisão ao agente; aprovar; registrar data de envio; export PDF  

### Tela 20 — Financeiro D+14 Waze/Plugga

- **Abas:** Projeção · Alertas · Histórico · OMIE sync  
- **Fonte:** OMIE read-only; sistema orquestra alerta e acompanhamento  

### Tela 21 — Contas a Pagar / Receber

- **Abas:** Pagar · Receber · Vencendo · Vencidas · Conciliadas  
- **Regra:** OMIE permanece sistema financeiro oficial; esta tela é operacional/acompanhamento  

### Tela 22 — Comprovantes

- **Abas:** Inbox · Processados · Vinculados · Exceções  
- **Ações:** anexar; vincular título; pedir parsing ao agente; confirmar humano  

### Tela 23 — Compras / Solicitações

- **Base Bitrix:** COMPRAS `categoryId 43`  
- **Abas:** Kanban · Minhas · Aguardando cotação · Aguardando aprovação · Pedido · Recebimento · Scorecard  
- **Regra:** card/processo é centro; subtarefa aberta bloqueia avanço; sem tarefa avulsa duplicada  

### Tela 24 — Detalhe da Solicitação de Compra

- **Abas:** Resumo · Itens · Cotações · Subtarefas · Aprovações · Pagamento · Recebimento · Anexos · Timeline  

### Tela 25 — Jobs e Automações

- **Abas:** Ativos · Histórico · Falhas · Agendamentos · Eventos  
- **Conteúdo:** inventário de crons atuais + runs futuros do scheduler  
- **Regra MVP:** começar **read-only**; pausar/reprocessar só pós-cutover do domínio  

### Tela 26 — Integrações

- **Abas:** Bitrix · OMIE · PluggaMob/OCPP · PagBank · **WhatsApp** · Telegram · RapidAPI · Saúde  
- **Cada card:** modo (`read-only` / `bridge` / `write`), última sync, erro, dono  
- **Segurança:** credenciais nunca exibidas em claro  
- **WhatsApp (obrigatório no MVP de integrações):** ver §11.1 — não tratar só como “atalho de notificação”; é integração de produto com status, fila, log e políticas  

### Tela 27 — Ações dos Agentes IA

- **Abas:** Todas · Pendentes de aprovação · Executadas · Falhas · Por agente · Por domínio  
- **Campos:** agente, solicitante, canal, ação, input, payload, decisão, aprovação, resultado, timestamp, erro  

### Tela 28 — Documentos / Biblioteca

- **Abas:** Todos · Por processo · Faturas/NFs · Relatórios · Contratos · Templates  
- **Ações:** upload; vincular entidade; versionar; controlar acesso  

---

## 9. Regras de negócio críticas

### 9.1 CRM PluggaMob — réguas R0–R6

| Régua | Regra | Postura |
|---|---|---|
| R0 | Novo &lt;14 dias e 0 sessões | Onboarding |
| R1 | Nunca ativou **com** saldo, cadastro ≥14d | Destravar saldo |
| R2 | Nunca ativou **sem** saldo | Aquecer / educar |
| R3 | 31–60 dias sem uso | Reativar cedo |
| R4 | 61–90 dias | NPS + oferta |
| R5 | &gt;90 dias | Escuta, não spam |
| R6 | Diamante/Platinum com gap de cadência | Contato **pessoal** (sem automação fria) |

Regras adicionais:

1. Um usuário em **um segmento por vez**; migração histórica registrada.  
2. Opt-out permanente respeitado por todas as campanhas.  
3. Ticket de referência: R$ 24,70 (validar com operação).  
4. Limite diário de contatos configurável (ex.: 20/dia no piloto).  
5. Conversão medida em 7/14/30 dias com sessão vinculada.  
6. Portal PluggaMob é fonte de leitura da base; OS não escreve no portal no MVP.

### 9.2 Fechamento PluggaMob

1. Chave de conciliação = **TOKEN/RFID**, não telefone.  
2. Taxa Plugga sobre consumo: EV Point **5%**; Voltz **3%** (envio auto Voltz desativado conforme memória operacional).  
3. Saldo/topup anterior a **01/05/2026** = saldo antigo.  
4. Cortesia/cupom/privilegiado geram taxa; estorno não.  
5. Sessão sem pagamento correspondente pode gerar taxa.  
6. Janela semanal: domingo 00:01 → sábado 23:59 (Manaus).  
7. Sessão válida precisa ter consumo registrado.  
8. **Não aprovar** se auditoria não bater.

### 9.3 Avisos / ocupação

1. Validar ocupação real (portal/API) antes de envio.  
2. Validação inconclusiva → **bloquear** envio + log.  
3. Não misturar EV Point e Voltz.  
4. Debounce / anti-duplicidade.  
5. Parceiro/local inativo não envia.  
6. Separar tipos: horário · mudança · lotação · previsão.

### 9.4 OPM

1. Não fechar relatório sem encargos (ou premissa: encargos mês anterior / consumo MWh mês anterior).  
2. Não avançar com cliente/UC/período ambíguo.  
3. Não enviar ao cliente sem aprovação humana.  
4. Anexos e status sincronizados.  
5. Arquivos sensíveis não em grupo público.  
6. Bridge Bitrix C7 durante transição.

### 9.5 Compras

1. Processo/card é o centro (não tarefa avulsa duplicada).  
2. Subtarefa aberta bloqueia avanço.  
3. Compra relevante exige aprovação humana.  
4. Prazo máximo 18h Manaus para tarefas criadas/ajustadas por agente (regra operacional atual — preservar no MVP).  
5. Histórico/anexos não apagados sem segurança.

### 9.6 Agentes / envio externo

1. OpenClaw não grava estado crítico sem `agent_action`.  
2. Envios externos críticos passam por aprovação ou política explícita.  
3. Telegram/WhatsApp = canais, não banco.

---

## 10. Modelo de dados (entidades mínimas)

### Core
User, Team, Role, Permission, Area, Task, Workflow, WorkflowStage, Approval, Document, EventLog, AgentAction, Integration, JobRun

### CRM
Lead, Customer, Company, Contact, Opportunity, Interaction, Campaign

### OPM
EnergyConsumerUnit, OpmCycle, EnergyInvoice, SupplierInvoice, ChargeFeeDocument, EnergyAudit, OpmReport, ReportApproval

### PluggaMob
EvUser, EvSession, Partner, Location, Station, Connector, Coupon, WalletMovement, Settlement, SettlementLine, D14Credit, AlertPolicy, AlertDispatchLog

### Compras
PurchaseRequest, PurchaseItem, Quote, Supplier, PurchaseApproval, PurchasePayment, PurchaseReceipt

### Relacionamentos-chave
- Customer 1—N UC, OpmCycle, Opportunity, Document  
- EvUser 1—N EvSession, Interaction, Campaign membership  
- Settlement 1—N SettlementLine (sessões classificadas)  
- OpmCycle 1—N documents/audits/reports  
- Toda entidade crítica emite EventLog  

---

## 11. Integrações

| Sistema | Modo MVP inicial | Depois | Observação |
|---|---|---|---|
| Bitrix24 | read-only / bridge | write seletivo por domínio | Pipelines C0, C7, C43 prioridade |
| OMIE | read-only | read-only (oficial) | Não substituir no MVP |
| PluggaMob / portal / OCPP | read-only | eventos/ops controlados | Não escrever no portal no CRM MVP |
| PagBank | import arquivo | import + conciliação | Extratos para fechamento |
| **WhatsApp** | **integração P0** — status + envio controlado + log | templates, fila, webhooks de entrega | **Canal operacional principal** (CRM, alertas, financeiro). Ver §11.1 |
| Telegram | notificação / grupos internos | callbacks leves | Canal interno dos agentes/times |
| RapidAPI | opcional P2 | — | Conteúdo/notícias |
| Cloudflare | verificar | — | Incerto no diagnóstico |

### 11.1 WhatsApp — integração de primeira classe

O cliente validou: **WhatsApp não pode ficar implícito**. No Plugga/Waze OS ele entra como integração formal, no mesmo nível de Bitrix/OMIE/PluggaMob.

**Uso atual na operação (fato / diagnóstico):**

1. Envio financeiro/operacional via Plugguinha (`send-whatsapp`, scripts manuais).
2. Contatos de reativação CRM PluggaMob (réguas R0–R6).
3. Avisos de ocupação / tomadas (quando política autorizar).
4. Comunicação pontual com clientes/parceiros.

**O que a integração WhatsApp deve expor no MVP:**

| Capacidade | Requisito |
|---|---|
| Saúde da conexão | Status do gateway (conectado / desconectado / risco de ban) na Tela 26 |
| Identidades/números | Quais números/instâncias estão ativos (ex.: operação, Plugguinha) |
| Envio | API interna `POST /channels/whatsapp/send` com template/texto, destino, domínio de origem |
| Fila | Rate limit, retry, debounce; não disparar rajada sem política |
| Log de entrega | `message_id`, destino mascarado, status (queued/sent/failed/blocked), domínio (CRM/Ops/Financeiro), usuário/agente |
| Opt-out | Bloqueio permanente respeitado em todas as campanhas |
| Aprovação | Envios de campanha/massa e críticos exigem aprovação humana ou política explícita |
| Auditoria | Toda mensagem disparada por agente gera `agent_action` + log de canal |
| LGPD | Máscara de telefone na UI; retenção configurável; base legal documentada |

**O que WhatsApp NÃO é:**

1. Não é CRM.  
2. Não é banco de conversas oficiais (a ficha/timeline do OS é a fonte).  
3. Não substitui o gateway atual no dia 1 — no espelho, o OS observa/orquestra; cutover do envio é fase própria.

**Telas impactadas:**

- Tela 6 (Reativação) — registrar contato via WhatsApp  
- Tela 11 (Local) — avisos com log de envio  
- Tela 26 (Integrações) — card WhatsApp obrigatório  
- Tela 27 (Ações do agente) — envios do OpenClaw/Plugguinha  

**Entidades mínimas adicionais:** `WhatsappAccount`, `WhatsappMessageLog`, `WhatsappOptOut` (além de `AlertDispatchLog` / contatos CRM).

### Pipelines Bitrix relevantes (raio-X read-only)

| ID | Nome | Deals | MVP |
|---|---|---:|---|
| 7 | OPERAÇÃO MÊS A MÊS | 131 | Sim (OPM) |
| 0 | VENDAS | 80 | Read-only → gradual |
| 35 | PLUGGA MOB | 52 | Apoio / depois nativo |
| 43 | COMPRAS | 11 | MVP tardio |
| 9 | AUDITORIAS | 23 | V2 / aba OPM |
| 5 | MIGRAÇÃO | 16 | V2 |
| 47 | GESTÃO DE CONTRATOS | 2 | V2 |

---

## 12. Papel do OpenClaw e API

### O OpenClaw continua responsável por
Decisão estratégica, redação, análise ad-hoc, exceções, copy, orquestração humana, resumo, auditoria consultiva, interface conversacional.

### O OpenClaw deixa de ser responsável por
Filas, CRM como fonte, estado de processo, scheduler crítico, KPIs oficiais, documentos finais, regras financeiras finais.

### Contratos de API (mínimo)

```text
GET  /tasks?assigned_to=openclaw
GET  /cases/:id/context
GET  /crm/users/:id
GET  /opm/cycles/:id
GET  /settlements/:id
GET  /alerts/pending
POST /events
POST /comments
POST /documents/draft
POST /approvals/request
POST /agent-actions
POST /channels/whatsapp/send   (quando domínio/política liberar)
POST /crm/contacts          (quando domínio write liberado)
POST /opm/reports/draft
```

Toda chamada mutável registra `agent_actions` com: agente, solicitante, canal, ação, input, payload, decisão, aprovação, resultado, erro, timestamp.

---

## 13. Experiência e UI

1. Web app desktop-first (Next.js).  
2. Shell: sidebar + topbar + conteúdo.  
3. Padrões: kanban, lista, ficha com abas, timeline, upload, aprovação.  
4. Marca Plugga (cores/fontes oficiais).  
5. Mockup de referência visual: `docs/mockup/index.html` (não é spec de escopo).  
6. Mobile: V2, exceto se O.S. de campo entrar (fora do MVP).

---

## 14. Stack recomendada

| Camada | Escolha | Nota |
|---|---|---|
| Backend | NestJS (alt. FastAPI) | Modularidade + TypeScript |
| Banco | PostgreSQL (Supabase no MVP) | Relacional + storage + auth |
| Jobs | BullMQ + Redis | Temporal na V2 se workflows complexos |
| Frontend | Next.js | App + painéis |
| Storage | Supabase Storage / S3 | Documentos |
| Auth | Supabase Auth + RBAC por área | |
| Logs | event_log, agent_actions, integration_logs, job_runs | Obrigatório dia 1 |

---

## 15. Plano de entrega

### Fase 0 — Shell (dias)
Login, layout, menu, dashboard mock, pendências mock, integrações/jobs mock.  
**Aceite:** navegar o produto sem backend completo.

### Fase 1 — Espelho read-only
Dashboard real agregado; pendências Bitrix RO; CRM C0 RO; OPM C7 RO; Compras C43 RO; inventário de jobs; status integrações.  
**Aceite:** painel útil **sem** alterar operação.

### Fase 2 — CRM PluggaMob write
Import base EV; segmentos R0–R6; fila; campanhas; contatos; conversões; KPIs; OpenClaw consulta API.  
**Aceite:** operação de reativação sem planilha.

### Fase 3 — PluggaMob Ops
Sessões, locais, conectores, ocupação, cupons, alertas com log/bloqueio.  
**Aceite:** ops diária na UI.

### Fase 4 — Fechamento + D+14
Import sessões/PagBank; classificação; taxa/repasse; divergências; aprovação; export.  
**Aceite:** 2 ciclos em paralelo com processo atual antes do cutover.

### Fase 5 — OPM MVP
Ciclos nativos; docs; auditoria; relatório; aprovação; envio; bridge C7.  
**Aceite:** 2 ciclos mensais em paralelo.

### Fase 6 — Compras MVP (ou V1.1)
Solicitações nativas no lugar do funil C43.  
**Aceite:** gates/subtarefas/aprovações equivalentes sem regressão.

---

## 16. Critérios de aceite gerais (MVP)

1. Nenhuma mudança em produção sem flag de domínio + aprovação.  
2. Toda mutação de agente gera `agent_action`.  
3. Credenciais nunca renderizadas em claro.  
4. Pendência crítica sem dono/prazo/área é inválida.  
5. Fechamento não aprova com divergência aberta.  
6. Aviso externo não envia se validação inconclusiva.  
7. Relatório OPM não envia sem aprovação.  
8. Timezone Manaus consistente em UI e jobs.  
9. Modo de cada integração visível na Tela 26.  
10. Testes de regressão por domínio antes do cutover.

---

## 17. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Big-bang Bitrix+OpenClaw+scripts | Cutover por domínio; espelho primeiro |
| Errar regra financeira PluggaMob | Paralelo 2 ciclos; aprovação humana; testes com TOKEN/RFID |
| Copiar crons ruins | Inventário → redesenho idempotente |
| Ignorar Manaus | Timezone único no core |
| Misturar parceiros EV/Voltz | Entidades e filtros separados |
| Migrar CRM sem histórico de contato | Importar base + timeline mínima antes de ativar fila |
| Tratar OpenClaw como legado a matar | API + Agentes IA desde o dia 1 |
| Sem trilha de auditoria | Logs obrigatórios |
| Envio automático sem aprovação | Políticas + gates |
| Subestimar anexos | Documentos como entidade de primeira classe |

---

## 18. Fora de escopo / V2

CRM comercial completo com forecasting; migração ACL completa; auditorias com protocolo/contestação completa; contratos; engenharia/O.S. mobile; atestados/CATs; portal cliente/parceiro; BI avançado; marketing/Cafeína; templates avançados; estoque; assinatura digital; substituição total Bitrix/OMIE; OCPP próprio.

---

## 19. Decisões abertas (precisa fechar com o cliente)

1. Owner de produto oficial e comitê de cutover.  
2. Oferta/benefício das réguas de churn/perdido (financeiro).  
3. Copy final por segmento (revisão Edson / operação).  
4. Escopo exato do piloto CRM (limite/dia, locais, período).  
5. NestJS vs FastAPI (preferência PRD: NestJS).  
6. Supabase cloud vs Postgres self-hosted na VPS.  
7. Quando Compras entra (MVP vs V1.1).  
8. Política LGPD/WhatsApp (opt-out, base legal, retenção) — **integração WhatsApp já é P0**; falta fechar provedor/gateway (atual Plugguinha vs oficial Meta) e papéis de aprovação de disparo.  
9. Quem aprova fechamento e relatório OPM (papéis nominais).  
10. Retenção de `agent_actions` e anexos.

---

## 20. Anexos

| Anexo | Caminho |
|---|---|
| Diagnóstico e escopo | `knowledge/openclaw/workspace/reports/plugga-sistema/diagnostico-escopo-sistema-proprio-2026-08-05.md` |
| Modelo de telas (detalhe) | `knowledge/openclaw/workspace/reports/plugga-sistema/modelo-telas-mvp-2026-08-05.md` |
| Blueprint CRM | `knowledge/openclaw/workspace/reports/CRM_PLUGGAMOB_*` |
| Prompt OpenClaw | `knowledge/PROMPT-OPENCLAW.md` |
| Mapa produto resumido | `docs/mapa-produto-mvp.md` |
| Mockup visual | `docs/mockup/index.html` |
| Extração OpenClaw | `knowledge/openclaw/` |

---

## 21. Aprovação

| Papel | Nome | Data | Assinatura |
|---|---|---|---|
| Produto / Cliente | | | |
| Operação PluggaMob | | | |
| Financeiro | | | |
| OPM | | | |
| Desenvolvimento | | | |

**Ao aprovar este PRD:** autoriza-se apenas o desenvolvimento do sistema em paralelo (Fases 0–1 sem write). Qualquer fase write/cutover exige adendo de go-live por domínio.

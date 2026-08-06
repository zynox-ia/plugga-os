# Plugga/Waze OS — Mapa do Produto (MVP palpável)

**Objetivo deste doc:** você conseguir “ver” o sistema — menu, telas, abas, botões e o que cada pessoa faz — sem código ainda.  
**Fonte:** diagnóstico OpenClaw 05/08/2026 + blueprint CRM PluggaMob.  
**Regra:** operação atual não muda; o sistema começa em paralelo.

---

## 1. O que a pessoa vê ao entrar

```
┌──────────────────────────────────────────────────────────────┐
│ Plugga/Waze OS          Dilkson ▾   Notificações   Sair     │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  Início    │   Conteúdo da tela selecionada                 │
│  PluggaMob │                                                 │
│    · Ops   │                                                 │
│    · CRM   │                                                 │
│    · $$    │                                                 │
│  OPM       │                                                 │
│  Operação  │                                                 │
│  Jobs      │                                                 │
│  Admin     │                                                 │
│            │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

- **Web app** (desktop primeiro; mobile depois).
- Telegram/WhatsApp **não são o sistema** — só notificam ou pedem aprovação.
- OpenClaw **consulta/age via API** e tudo fica registrado em “Ações do agente”.

---

## 2. Menu lateral (navegação real)

| Item do menu | Para quem | Em uma frase |
|---|---|---|
| **Início** | Dilkson / gestores | Saúde do dia: o que está parado, o que precisa aprovar, alertas |
| **PluggaMob → Ops** | Operação EV Point | Tomadas, sessões ao vivo, ocupação, avisos |
| **PluggaMob → CRM** | Dilkson / Thiago / operação | Réguas R0–R6, fila do dia, ficha do cliente, campanhas |
| **PluggaMob → Financeiro** | Financeiro PluggaMob | Fechamento semanal, D+14, cupons, aprovação de repasse |
| **OPM** | Zulk / OPM | Ciclos mês a mês: fatura → auditoria → relatório → envio |
| **Operação** | Todos | Caixa de entrada de workflows/aprovações (genérico) |
| **Jobs & Integrações** | DK / tech | Scheduler, logs, saúde Bitrix/OMIE/PluggaMob |
| **Admin** | Dilkson / admin | Usuários, áreas, permissões |

V2 (ainda **não** no MVP de UI): CRM comercial geral, Compras completo, O.S. obras, BI, portal cliente/parceiro.

---

## 3. Tela a tela

### 3.1 Início (Dashboard)

**Abas:** `Hoje` · `Aprovações` · `Alertas`

**Aba Hoje — cards no topo**
- Sessões ativas agora (EV Point)
- Contatos CRM pendentes hoje
- Fechamentos aguardando aprovação
- Ciclos OPM atrasados
- Jobs com erro nas últimas 24h

**Lista abaixo**
- “Precisa de você” (aprovações + exceções)
- “Rodou sozinho” (últimos jobs OK)

**Botões**
- Ir para a fila CRM
- Ir para fechamento da semana
- Ver logs com erro

---

### 3.2 PluggaMob → Ops

**Abas:** `Ao vivo` · `Locais` · `Avisos` · `Relatórios` · `Cupons`

#### Aba Ao vivo
- Mapa/lista de locais (EV Point 01, Alvorada, etc.)
- Por local: conectores livres / ocupados / offline
- Sessões ativas: usuário, kWh parcial, tempo, status
- Filtro: local · status · parceiro

**Ações:** atualizar · abrir ficha da sessão · “por que esse aviso não saiu?”

#### Aba Locais
- Cadastro operacional: parceiro → local → estação → conector
- Status do local (ativo/inativo — se inativo, **não envia push**)
- Timezone Manaus

#### Aba Avisos
- Políticas: por horário · mudança · lotação · previsão
- Destinos autorizados
- Debounce / anti-duplicidade
- Log de cada envio (sucesso/bloqueado/falha)

**Regra na UI:** se validação de ocupação for inconclusiva → status “bloqueado” visível, sem envio.

#### Aba Relatórios
- Manhã / tarde / diário / semanal
- Preview + export PDF/XLSX
- Histórico gerado (não depende do agente guardar arquivo)

#### Aba Cupons
- Cupons ativos, uso, abuso, relatório

---

### 3.3 PluggaMob → CRM (o mais concreto do blueprint)

**Abas:** `Fila do dia` · `Segmentos` · `Campanhas` · `Clientes` · `KPIs`

#### Aba Fila do dia (tela principal do time)
Kanban do dia:

| A contatar | Contatado | Respondeu | Convertido | Sem resposta / Opt-out |
|---|---|---|---|---|

Cada card: nome, telefone mascarado, segmento (R0–R6), saldo, dias sem carregar, campanha.

**Ações no card**
- Abrir ficha
- Registrar contato (canal, mensagem, resultado)
- Marcar convertida (vincula sessão)
- Opt-out permanente

#### Aba Segmentos
Cards R0→R6 com contagem e definição:
- **R0** Novo &lt;14d, 0 sessões
- **R1** Nunca ativou **com** saldo (≥14d)
- **R2** Nunca ativou **sem** saldo
- **R3** Esfriando 31–60d
- **R4** Churn 61–90d
- **R5** Perdido &gt;90d
- **R6** Diamante/Platinum com gap (contato **pessoal**, não automação fria)

Botão: “Recalcular segmentos” (job diário; também manual).

#### Aba Campanhas
Lista: nome · régua · oferta · status (`rascunho` / `aprovada` / `ativa` / `pausada`) · limite/dia · aprovador.

**Tela de campanha**
- Template de mensagem (OpenClaw pode sugerir copy; humano aprova)
- Segmento alvo
- Limite diário
- Funil da campanha (mesmo kanban, filtrado)

#### Aba Clientes (ficha)
Busca por nome/telefone/app_user_id.

**Na ficha — abas internas**
- `Resumo` — segmento atual/anterior, saldo, última sessão, lealdade, gap
- `Timeline` — contatos, respostas, sessões, mudanças de segmento
- `Sessões`
- `Carteira / saldo`
- `Campanhas`

#### Aba KPIs
Do blueprint:
- Saúde da base (distribuição R0–R6)
- Taxa de reativação 7/14/30 dias
- Receita reativada
- Contatos do dia vs limite
- Migração entre segmentos (semana)

---

### 3.4 PluggaMob → Financeiro

**Abas:** `Fechamentos` · `D+14` · `Conciliação` · `Exports`

#### Aba Fechamentos
Lista por semana/parceiro: rascunho → em auditoria → pronto para revisão → aprovado → enviado.

**Dentro de um fechamento**
- Sessões importadas
- Classificação: topup novo · saldo antigo · cupom · privilegiado · sem pagamento · estorno · crédito D+14
- Taxa Plugga (EV Point 5%; Voltz 3% se ativo)
- Repasse parceiro
- Divergências destacadas em vermelho
- Botões: `Importar sessões` · `Importar PagBank` · `Reconciliar` · `Aprovar` · `Exportar`

**Regra na UI:** não deixa “Aprovar” se auditoria não bater.

#### Aba D+14
Calendário/lista de créditos a liberar; status; quem aprovou.

#### Aba Conciliação
Match TOKEN/RFID (não telefone) · itens órfãos · ações de correção com log.

---

### 3.5 OPM

**Abas:** `Ciclos do mês` · `Clientes / UCs` · `Fila de auditoria` · `Relatórios` · `KPIs`

#### Aba Ciclos do mês (Kanban)
Estágios tipo:
`Aguardando fatura` → `Docs incompletos` → `Em auditoria` → `Relatório rascunho` → `Aguardando aprovação` → `Enviado`

Card: cliente · UC · mês · responsável · prazo.

**Dentro do ciclo — abas**
- `Documentos` — fatura, NF, encargos (upload + validação)
- `Auditoria` — premissas, cálculos, pendências (OpenClaw ajuda a analisar; estado fica aqui)
- `Relatório` — versões HTML/PDF, aprovar, marcar data de envio
- `Bitrix` — bridge C7 (somente transição; status espelhado)

**Regras na UI**
- Não fecha sem encargos (ou premissa explícita registrada)
- Não envia ao cliente sem aprovação
- Ambiguidade de UC/período bloqueia avanço

---

### 3.6 Operação (caixa genérica)

**Abas:** `Minha caixa` · `Equipe` · `Aprovações`

- Lista unificada do que o workflow engine gerou (OPM, financeiro, exceções)
- Filtros: área · status · prazo · atribuído a mim / ao OpenClaw
- Útil no MVP mesmo antes de Compras completo

---

### 3.7 Jobs & Integrações

**Abas:** `Jobs` · `Integrações` · `Ações do agente` · `Eventos`

#### Jobs
Tabela: nome · cron · último run · status · duração · dono · criticidade  
Ações: ver log · reprocessar · pausar (**só depois do cutover**; no espelho inicial fica read-only)

#### Integrações
Cards: Bitrix · OMIE · PluggaMob · PagBank · Telegram · WhatsApp  
Cada um: saúde, última sync, modo (`read-only` / `bridge` / `write`)

#### Ações do agente
Toda ação do OpenClaw: quem pediu · canal · input · decisão · aprovação · resultado · erro

#### Eventos
Stream: `user.reactivated`, `settlement.ready_for_review`, `invoice.received`, etc.

---

### 3.8 Admin

**Abas:** `Usuários` · `Áreas` · `Permissões` · `Empresas`

Áreas iniciais: Diretoria · Financeiro · PluggaMob · OPM · Engenharia · Marketing (V2)

---

## 4. Papéis × telas (quem usa o quê)

| Papel | Telas do dia a dia |
|---|---|
| Dilkson | Início, CRM KPIs, Fechamentos (aprovar), Aprovações |
| Operação PluggaMob | Ops Ao vivo, Avisos, CRM Fila do dia |
| Financeiro PluggaMob | Fechamentos, D+14, Conciliação |
| OPM / Zulk | Ciclos do mês, Auditoria, Relatórios |
| OpenClaw | Não tem “login de humano”; usa API e aparece em Ações do agente |
| Admin/DK | Jobs, Integrações, Admin |

---

## 5. Fluxos que tornam o sistema “real”

### Fluxo A — Contato CRM do dia
1. Job recalcula segmentos de madrugada  
2. Operador abre **CRM → Fila do dia**  
3. Trabalha o kanban; registra contato  
4. Se cliente carrega → conversão automática (sessão vinculada)  
5. OpenClaw pode sugerir copy / explicar churn — **não** guarda a fila

### Fluxo B — Fechamento semanal
1. Importa sessões + PagBank  
2. Sistema classifica e calcula taxa/repasse  
3. Divergências ficam na tela  
4. Humano aprova  
5. OpenClaw só explica exceção se pedido

### Fluxo C — Ciclo OPM
1. Sobe fatura/NF/encargos  
2. Status anda no kanban  
3. OpenClaw gera rascunho de relatório via API  
4. Humano aprova e marca envio  
5. KPI de data de envio atualiza sozinho

### Fluxo D — Aviso de tomada
1. Evento de ocupação chega  
2. Política valida (parceiro ativo? debounce? validação conclusiva?)  
3. Envia ou bloqueia com log  
4. Ops vê o motivo na aba Avisos

---

## 6. O que NÃO aparece no MVP (de propósito)

- CRM comercial geral Plugga/Waze (leads obras/solar) — V2  
- Compras/suprimentos completo — V2 (Bitrix 43 continua)  
- O.S. de campo maduro — V2  
- Portal do cliente / área do parceiro — V2  
- Substituir OMIE ou OCPP — nunca no MVP  
- Publicação automática de marketing — fica no OpenClaw

---

## 7. Ordem de construção das telas (para ficar palpável cedo)

| Ordem | Entrega visível | O que você consegue clicar |
|---|---|---|
| 1 | Shell + Início + Admin básico | Login, menu, usuários |
| 2 | Jobs & Integrações (read-only) | Ver jobs/crons atuais e saúde das APIs |
| 3 | CRM: Segmentos + Clientes + Fila | Operar reativação sem planilha |
| 4 | CRM: Campanhas + KPIs | Medir conversão |
| 5 | Ops Ao vivo + Avisos (log) | Ver ocupação e por que avisou/não avisou |
| 6 | Financeiro: Fechamentos | Fechar semana com aprovação |
| 7 | OPM: Ciclos + docs + aprovação | Tirar estado do Bitrix C7 aos poucos |

---

## 8. Resumo em uma frase

**Plugga/Waze OS** é um painel web com 8 áreas no menu, onde o time opera CRM EV Point, eletropostos, fechamento financeiro e OPM com kanban/fichas/aprovações — e o OpenClaw só ajuda via API, sem ser o banco da operação.

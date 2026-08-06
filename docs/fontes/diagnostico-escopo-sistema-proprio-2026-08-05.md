# Diagnóstico e Escopo — Sistema Próprio Plugga/Waze

**Data:** 05/08/2026 — horário de Manaus  
**Contexto:** Planejamento para construção de sistema próprio Plugga/Waze Energia  
**Status:** Inventário + escopo + handoff  
**Regra crítica:** nenhuma mudança operacional agora. Zero alteração em crons, jobs, configs, permissões, integrações ou serviços.

---

## 0. Premissa central

Este documento é apenas planejamento.

A operação atual continua rodando como está em OpenClaw, Bitrix, scripts, crons, Telegram, WhatsApp, OMIE, PluggaMob e demais integrações.

O objetivo é mapear o que existe hoje, decidir o que deve virar sistema próprio e definir um caminho seguro de migração futura.

---

## 1. Diagnóstico executivo

A operação atual não é apenas um bot com scripts.

Ela é uma combinação de:

1. **OpenClaw**
   - agente assistente;
   - memória operacional;
   - skills;
   - scripts;
   - rotinas;
   - orquestração via Telegram/WhatsApp;
   - execução de análises e relatórios.

2. **Bitrix24**
   - CRM;
   - pipelines;
   - tarefas;
   - anexos;
   - prazos;
   - automações operacionais improvisadas.

3. **Scripts locais**
   - Python;
   - JavaScript;
   - Bash;
   - rotinas financeiras;
   - rotinas PluggaMob;
   - automações Bitrix;
   - relatórios.

4. **Crons**
   - jobs recorrentes;
   - alertas;
   - criação de tarefas;
   - monitoramento;
   - relatórios;
   - bloqueios e gates operacionais.

5. **Sistemas externos**
   - OMIE;
   - Bitrix24;
   - PluggaMob/portal/OCPP;
   - PagBank;
   - Telegram;
   - WhatsApp;
   - RapidAPI;
   - possivelmente Cloudflare, a verificar.

6. **Arquivos e documentos**
   - blueprints;
   - relatórios;
   - planilhas;
   - skills;
   - memória;
   - bases exportadas;
   - templates;
   - referências operacionais.

### Posição recomendada

Não tentar substituir tudo de uma vez.

Isso seria arriscado porque a operação mistura dados, regras de negócio, automações, aprovação humana, documentos, exceções, canais de comunicação, memória histórica e scripts com comportamento operacional sensível.

O sistema próprio deve nascer primeiro como **fonte de verdade operacional**, não como uma tentativa de recriar o OpenClaw inteiro.

O OpenClaw deve continuar como agente assistente, mas deixar de ser o lugar onde vivem filas, CRM, relatórios transacionais, estado operacional, jobs críticos, auditorias estruturadas, automações recorrentes e histórico transacional.

---

# 2. Inventário operacional atual

## 2.1 CRM / leads / pipeline comercial

| Domínio | O que existe hoje | Onde vive | Quem usa | Criticidade |
|---|---|---|---|---|
| CRM PluggaMob EV Point | Blueprint de CRM de reativação com réguas R0–R6, segmentação por recência, lealdade e gap de cadência | `reports/pluggamob/crm/Blueprint_CRM_PluggaMob_v2_1_29jul2026.md` | Dilkson, Thiago, DK, operação PluggaMob | P0 |
| Base de usuários EV Point | Base segmentada, listas de reativação, super clientes, nunca ativaram com saldo | Arquivos citados no blueprint e extração local | Operação PluggaMob | P0 |
| Pipeline comercial geral Plugga/Waze | Parcialmente documentado em skills comerciais, mas sem mapa completo validado nesta rodada | Bitrix / skills comerciais | Comercial / Dilkson | P1 |
| Propostas comerciais | Skills e modelos para propostas Plugga/Waze | `brains/time/areas/comercial-propostas/skills/` | Comercial / Dilkson | P1 |

**Observação:** o CRM PluggaMob está mais maduro documentalmente do que o CRM comercial geral.

---

## 2.2 O.S. / engenharia / obras

| Domínio | O que existe hoje | Onde vive | Quem usa | Criticidade |
|---|---|---|---|---|
| O.S. de campo / Obras e Serviços | Skill rascunho para criar/atualizar O.S. no Bitrix com fotos, PDF, assinatura, estágio e pendências | `brains/time/areas/engenharia-projetos-obras/skills/bitrix-os-campo-obras-servicos/SKILL.md` | Engenharia, campo, DK | P1 |
| Documentos técnicos | Skills para documentos formais, cronogramas, relatórios técnicos | `brains/time/areas/engenharia-projetos-obras/skills/documentos-engenharia-waze/` | Engenharia/Waze | P1 |
| Atestados/CATs/acervo técnico | Skill de matriz de atestados e CATs | `brains/time/areas/engenharia-projetos-obras/skills/matriz-atestados-cats-waze/` | Backoffice / engenharia | P1 |
| Análise de energia / RE7000 | Skill específica para relatórios de analisador de energia | `brains/time/areas/engenharia-projetos-obras/skills/re7000-analise-energia/` | Engenharia / Plugga / Waze | P1 |

**Observação:** O.S. de campo ainda está como rascunho e depende de confirmação de pipeline, tipo de O.S., estágios e campos obrigatórios no Bitrix.

---

## 2.3 Financeiro / pagamentos / alertas

| Domínio | O que existe hoje | Onde vive | Quem usa | Criticidade |
|---|---|---|---|---|
| Alerta financeiro D+14 | Projeção de contas a pagar/receber OMIE para próximas duas semanas | `alerta-financeiro-d14/SKILL.md`; `scripts/financeiro/alerta-diario.py`; cron financeiro | Financeiro Waze/Plugga | P0 |
| Acompanhamento contas a pagar/receber | Jobs Bitrix diários úteis para financeiro Plugga/Waze | Crontab: `bitrix-create-acompanhamento-contas-pagar-receber-financeiro*.sh` | Financeiro | P0 |
| OMIE DRE / extrações | Scripts OMIE de DRE, categorias, movimentos e análise saúde | `scripts/omie_*`; `scripts/financeiro/*`; skills OMIE | Financeiro / controladoria | P0 |
| Comprovante de pagamento OMIE/Bitrix | Skills para processar comprovantes e anexar/cadastrar | `skills/comprovante-pagamento-omie/`; `comprovante-bitrix-contas-pagar-waze/` | Financeiro | P1 |
| Demandas bancárias/fiscais recorrentes | Jobs criando tarefas Bitrix para Diane | Crontab + scripts `bitrix-create-demandas-*` | Diane / financeiro / fiscal | P1 |

---

## 2.4 OPM / auditoria energética / relatórios

| Domínio | O que existe hoje | Onde vive | Quem usa | Criticidade |
|---|---|---|---|---|
| Operação Mês a Mês | Pipeline Bitrix C7 com estágios, anexos de fatura/NF/relatório e movimentação | `skills/bitrix-operacao-mes-a-mes/SKILL.md`; `memory/integrations/bitrix24-operacao-mes-a-mes.md` | Zulk Boss, equipe OPM, DK | P0 |
| Auditoria de fatura cativa | Motor de análise de cobrança item a item, Grupo A/cativo, BESS, REH, casos | `skills/analise-fatura-cativa-plugga/SKILL.md` | Plugga / OPM | P0 |
| Relatório de economia Plugga | Relatórios de economia Mercado Livre x Cativo / OPM | `skills/relatorio-economia-plugga/` | Plugga / OPM | P0 |
| Estudo de demanda | Estudos de demanda contratada | `skills/estudo-demanda-plugga/` | Plugga / OPM | P1 |
| KPI OPM | Jobs Bitrix de gestão mensal e KPI de data de envio | Crontab: `bitrix-create-opm-*`, `bitrix-opm-kpi01-stamp-data-envio.py` | Gestão OPM | P1 |

---

## 2.5 PluggaMob / EV Point / eletropostos / cupons / OCPP

| Domínio | O que existe hoje | Onde vive | Quem usa | Criticidade |
|---|---|---|---|---|
| Consulta operacional recargas | Consulta sessões, kWh, faturamento, tentativas e parceiros | `scripts/pluggamob/consulta_operacional.py`; `pluggamob-recargas-operacao/SKILL.md` | Operação PluggaMob | P0 |
| Relatórios EV Point | Relatório manhã/tarde/diário/semanal | `scripts/pluggamob/relatorio_*.py` | Plugguinha / operação | P0 |
| Monitor ao vivo | Sessões iniciadas/preparando/carregando | `monitor_evpoint_live.py`, `monitor_voltz_live.py` | Operação | P1 |
| Ocupação de tomadas | Avisos por horário, mudança, lotação e previsão | Crontab com `aviso_tomadas_eletroposto.py` por local | Clientes / operação | P0 |
| Cupons | Monitoramento e relatórios de cupons | `monitor_cupons.py`, `gerar_relatorio_cupons.py`, exports sintéticos | Operação / financeiro PluggaMob | P0 |
| Fechamento parceiros | Fechamento semanal EV Point/VOLTZ/parceiros com PagBank, FIFO, D+14, taxa Plugga | `pluggamob-fechamento-parceiros/SKILL.md`; scripts PluggaMob | Financeiro PluggaMob / Dilkson | P0 |
| Crédito D+14 | Controle de crédito/repasse D+14 | `controle_credito_repasse.py`; `controle_d14.py`; cron terça/sexta | Financeiro PluggaMob | P0 |
| OCPP/ping | Monitor OCPP/ping | `scripts/plugga_ocpp_ping_*` | Operação técnica | P1 |

---

## 2.6 Conteúdo / Cafeína / marketing

| Domínio | O que existe hoje | Onde vive | Quem usa | Criticidade |
|---|---|---|---|---|
| Cafeína / Plugga Comunica | Fluxo de pauta, notícia, carrossel, conteúdo e validação antes de publicar | `skills/plugga-comunica-cafeina/SKILL.md` | Fernanda, Dilkson, DK, marketing | P1 |
| Monitoramento notícias | Skills de setor elétrico/eletromobilidade/news | `setor-eletrico-comunica`, `eletromobilidade-comunica`, `news-api14-rapidapi` | Marketing / conteúdo | P2 |
| Carrosséis | Padrões visuais e geração de criativos | `skills/carrossel-eletromobilidade/`; `image_generate` | Marketing | P2 |
| Benchmark Instagram | Scripts de benchmark e visual report | `scripts/generate_instagram_*` | Marketing | P2 |

---

## 2.7 Backoffice / demandas / atestados / processos

| Domínio | O que existe hoje | Onde vive | Quem usa | Criticidade |
|---|---|---|---|---|
| Compras/Suprimentos | Funil Bitrix 43, card CRM, tarefa vinculada, subtarefas, gates, scorecard | `bitrix-compras-suprimento-funil/SKILL.md`; scripts `bitrix-compras-*`; crons a cada minuto | Kerolayne, Diane, Fabíola, DK | P0 |
| Demandas fiscais/bancárias | Criação recorrente de tarefas para Diane | Crontab + scripts `bitrix-create-demandas-*` | Diane / financeiro / fiscal | P1 |
| Atestados/CATs | Preservação, extração e cadastro documental | `matriz-atestados-cats-waze` | Backoffice / engenharia | P1 |
| Digest empresa | Consolidação de atividade dos agentes | `digest-empresa`; `scripts/digest_empresa.py` | Dilkson / DK | P2 |
| Governança Bitrix | Auditoria de prazos, bloqueio fim de semana, observadores, lembretes | Crontab + `bitrix-governance-*`, `bitrix-block-weekend-*` | Gestão operacional | P0/P1 |

---

## 2.8 Integrações

| Integração | Uso hoje | Onde vive | Criticidade |
|---|---|---|---|
| Bitrix24 | CRM, tarefas, pipelines, anexos, estágios, recorrências | `skills/bitrix24-webhook`, scripts `bitrix-*`, crons | P0 |
| OMIE | Contas a pagar/receber, DRE, financeiro | `skills/omie-*`, `scripts/omie-*`, `scripts/financeiro/*` | P0 |
| Telegram | Interface principal dos agentes/grupos/tópicos | OpenClaw runtime + skills | P0 |
| WhatsApp | Envio financeiro/operacional via Plugguinha | `scripts/financeiro/send-whatsapp.sh`, `scripts/plugguinha/send_whatsapp_manual.py` | P1 |
| PluggaMob API/portal | Sessões, usuários, carteira/ledger, locais, ocupação | `scripts/pluggamob/*` | P0 |
| PagBank | Conciliação e D+14 por extratos | Arquivos exportados + scripts fechamento | P0 |
| RapidAPI | Notícias, Instagram, clima, Yahoo Finance | skills RapidAPI | P2 |
| Cloudflare | Citado no contexto, mas não validado nesta rodada | Precisa verificar configs/flows | Incerto |

---

# 3. O que deve virar sistema

## 3.1 CRM PluggaMob / EV Point

**Decisão:** deve virar sistema.

**Por que não deve depender de agente:** hoje a inteligência está em blueprint, planilhas, scripts e agente. Isso dificulta rastrear contatos, medir conversão, acompanhar saldo parado, priorizar clientes, rodar réguas, auditar ações e escalar operação.

### Dados necessários

1. Usuário: id, nome, telefone, e-mail, app_user_id, data de cadastro, saldo, status, origem, tags.
2. Sessão: id, usuário, localização, conector, início, fim, kWh, valor, status, forma de ativação, TOKEN/RFID quando aplicável.
3. Segmento CRM: usuário, régua R0–R6, recência, lealdade, frequência atual, gap de cadência, prioridade.
4. Campanha: nome, régua, benefício, validade, copy, status.
5. Contato: usuário, campanha, canal, operador, data, mensagem, resposta, resultado.
6. Conversão: usuário, data, sessão vinculada, receita, saldo destravado, campanha origem.

### Regras críticas

1. R0: novo com menos de 14 dias e 0 sessões.
2. R1: nunca ativou com saldo e cadastro maior ou igual a 14 dias.
3. R2: nunca ativou sem saldo.
4. R3: esfriando, 31–60 dias sem usar.
5. R4: churn recente, 61–90 dias.
6. R5: perdido, mais de 90 dias.
7. R6: clientes Diamante/Platinum com gap de cadência relevante.
8. R6 deve ser contato pessoal, não automação fria.
9. Ticket real de referência: R$ 24,70.
10. Base v9 deve ser validada célula a célula inicialmente.

### APIs/eventos necessários

- `GET /users`
- `GET /users/:id/timeline`
- `GET /crm/segments`
- `POST /crm/campaigns`
- `POST /crm/contacts`
- `POST /crm/conversions/import`
- `GET /crm/kpis`
- evento `user.segment_changed`
- evento `user.reactivated`
- evento `wallet.balance_idle`

### Papel futuro do OpenClaw

- escrever copy;
- sugerir abordagem;
- explicar indicadores;
- analisar exceções;
- resumir performance;
- não guardar a fila nem ser fonte de verdade.

---

## 3.2 PluggaMob Ops / recargas / ocupação

**Decisão:** deve virar sistema.

**Por que não deve depender de agente:** ocupação, disponibilidade, sessão ativa, aviso de lotação e relatórios operacionais são processos críticos e sensíveis. Não devem depender de cron solto, script local e memória de agente.

### Dados necessários

1. Parceiro: id, nome, status, taxa Plugga, política de envio, destinos autorizados.
2. Localização: id, parceiro, nome, endereço, timezone, status.
3. Estação: id, location, nome, identificador técnico, status.
4. Conector: id, estação, tipo, status, última atualização.
5. Sessão ativa: id, usuário, estação, conector, início, SOC, status, valor parcial, kWh parcial.
6. Aviso: tipo, destino, política, payload, enviado_em, status, log.

### Regras críticas

1. Validar ocupação real no portal/API antes de envio.
2. Se validação não for conclusiva, bloquear envio.
3. Não misturar EV Point e Voltz.
4. Parceiro inativo não envia push.
5. Aplicar debounce/anti-duplicidade.
6. Usar horário de Manaus.
7. Separar aviso por horário, mudança, lotação e previsão.
8. Toda mensagem externa deve ter log.

### APIs/eventos necessários

- `GET /ev/locations`
- `GET /ev/locations/:id/connectors`
- `GET /ev/sessions/active`
- `POST /ev/alerts/policies`
- `POST /ev/alerts/dispatch`
- `GET /ev/alerts/logs`
- evento `connector.status_changed`
- evento `location.full`
- evento `session.started`
- evento `session.finished`

### Papel futuro do OpenClaw

- revisar incidente;
- explicar falha;
- ajustar copy;
- tratar exceção;
- não ser fonte primária de ocupação.

---

## 3.3 Fechamento financeiro PluggaMob

**Decisão:** deve virar sistema.

**Por que não deve depender de agente:** o fechamento envolve dinheiro, repasse, taxa Plugga, PagBank, D+14, cupons, usuários privilegiados e saldo antigo. É uma área de alto risco financeiro.

### Dados necessários

1. Fechamento: parceiro, período, status, responsável, aprovado_por, data aprovação.
2. Sessão financeira: transaction_id, TOKEN/RFID, usuário, parceiro, local, kWh, valor, status, data.
3. Pagamento: fonte, PagBank id, valor, data, status, tipo, transação vinculada.
4. Ledger/carteira: usuário, token, movimento, origem, valor, data.
5. Regra de classificação: topup novo, saldo antigo, cupom, privilegiado, sem pagamento, estorno, crédito D+14.
6. Repasse: valor bruto, taxa Plugga, valor parceiro, crédito a liberar, valor a cobrar, status.

### Regras críticas

1. Chave de conciliação = TOKEN/RFID, não telefone.
2. Taxa Plugga incide sobre consumo.
3. EV Point: taxa Plugga usual de 5%.
4. Voltz: taxa Plugga de 3%, mas Voltz está desativado para envio automático conforme memória operacional.
5. Saldo/topup anterior a 01/05/2026 é saldo antigo.
6. Cortesia/cupom/privilegiado geram taxa Plugga.
7. Estorno não gera taxa.
8. Sessão sem pagamento correspondente pode gerar taxa.
9. Janela semanal: domingo 00:01 até sábado 23:59, horário de Manaus.
10. Sessão válida precisa ter consumo registrado.
11. Não fechar relatório se auditoria não bater.

### APIs/eventos necessários

- `POST /settlements/import-sessions`
- `POST /settlements/import-pagbank`
- `POST /settlements/reconcile`
- `GET /settlements/:id`
- `POST /settlements/:id/approve`
- `GET /settlements/:id/export`
- evento `settlement.ready_for_review`
- evento `d14.credit_released`

### Papel futuro do OpenClaw

- revisar divergência;
- explicar exceções;
- redigir resumo executivo;
- não calcular regra financeira como fonte final.

---

## 3.4 OPM / auditorias / relatórios

**Decisão:** deve virar sistema parcialmente. O workflow, estado, anexos, aprovações e KPIs devem virar sistema. A análise técnica consultiva pode continuar assistida por agente.

### Dados necessários

1. Cliente: nome, CNPJ, responsável, contato, status.
2. Unidade consumidora: UC, distribuidora, grupo, modalidade, demanda contratada, cliente.
3. Ciclo OPM: cliente, UC, mês referência, status, responsável, prazo.
4. Documento: tipo, arquivo, origem, período, status de validação.
5. Auditoria: fatura, NF, encargos, premissas, cálculo, conclusão.
6. Relatório: versão, HTML, PDF, status, aprovado por, enviado em.

### Regras críticas

1. Não fechar relatório sem encargos.
2. Se falta boleto de encargos, usar premissa: valor de encargos do mês anterior dividido pelo consumo do mês anterior em MWh.
3. Não mover card/status se cliente, UC ou período estiver ambíguo.
4. Não enviar relatório ao cliente automaticamente sem autorização.
5. Anexos e status precisam estar sincronizados.
6. O relatório precisa respeitar padrão visual Plugga.
7. Arquivos sensíveis não devem circular em grupo público.

### APIs/eventos necessários

- `POST /opm/documents`
- `POST /opm/audits`
- `PATCH /opm/cases/:id/status`
- `POST /opm/reports`
- `POST /opm/approvals`
- `GET /opm/kpis`
- evento `invoice.received`
- evento `audit.completed`
- evento `report.approved`

### Papel futuro do OpenClaw

- analisar faturas complexas;
- redigir relatório;
- apontar inconsistências;
- gerar narrativa técnica;
- não guardar estado do ciclo.

---

## 3.5 Compras/Suprimentos

**Decisão:** deve virar sistema no médio prazo.

**Por que não deve depender de agente/Bitrix:** o funil de compras virou workflow operacional com gates a cada minuto. Isso é processo de produto, não CRM genérico.

### Dados necessários

1. Solicitação de compra: solicitante, área, obra/centro de custo, item, urgência, status, responsável.
2. Cotação: fornecedor, valor, prazo, frete, anexo, validade, observações.
3. Subtarefa: responsável, descrição, prazo, status.
4. Aprovação: aprovador, valor, justificativa, decisão, data.
5. Pedido: fornecedor, itens, valor, status, data prevista.

### Regras críticas

1. Não criar tarefa avulsa duplicada.
2. Card/processo é centro da operação.
3. Subtarefa aberta bloqueia avanço.
4. Prazo máximo até 18h Manaus para tarefas criadas/ajustadas pelo agente.
5. Compra relevante exige aprovação humana.
6. Histórico/anexos não devem ser apagados sem segurança.

### APIs/eventos necessários

- `POST /procurement/requests`
- `POST /procurement/quotes`
- `PATCH /procurement/requests/:id/stage`
- `POST /procurement/approvals`
- `GET /procurement/scorecard`
- evento `quote.pending`
- evento `approval.required`
- evento `subtask.completed`

### Papel futuro do OpenClaw

- comparar PDFs;
- resumir cotações;
- alertar gargalos;
- sugerir decisão;
- não controlar stage como fonte primária.

---

# 4. O que deve ficar no OpenClaw

O OpenClaw continua fazendo sentido como agente assistente em:

1. Decisão estratégica.
2. Leitura executiva.
3. Redação de relatórios.
4. Análise técnica ad-hoc.
5. Explicação de divergências.
6. Orquestração humana.
7. Cobrança de pendências.
8. Resumo de áudio/reunião.
9. Geração assistida de documentos.
10. Tratamento de exceções.
11. Curadoria de conteúdo.
12. Criação de copy.
13. Apoio a marketing.
14. Auditoria consultiva.
15. Interpretação de casos complexos.
16. Interface conversacional com Telegram/WhatsApp.
17. Registro de aprendizados.
18. Sugestão de melhorias de processo.

O OpenClaw não deve continuar como:

1. Banco de dados operacional.
2. CRM principal.
3. Sistema de filas.
4. Sistema financeiro transacional.
5. Scheduler crítico.
6. Fonte primária de relatórios recorrentes.
7. Local principal de documentos finais.
8. Controle de status de processos.
9. Fonte única de KPIs.
10. Dono de automações críticas sem API/log.

---

# 5. Bitrix — mapa de substituição

## 5.1 Dependências atuais fortes

### P0

1. OPERAÇÃO MÊS A MÊS — categoryId 7
   - faturas;
   - NF;
   - encargos;
   - relatórios;
   - estágios;
   - anexos.

2. COMPRAS/SUPRIMENTO — categoryId 43
   - card CRM;
   - tarefa vinculada;
   - subtarefas;
   - gates;
   - scorecard.

3. Tarefas financeiras/fiscais recorrentes
   - demandas bancárias;
   - demandas fiscais;
   - CCEE;
   - Barateiro;
   - OPM KPIs.

4. Governança de prazos
   - auditoria de deadline;
   - bloqueio fim de semana;
   - lembrete 1h antes;
   - observadores.

### P1

5. O.S. / Obras e Serviços
   - ainda rascunho;
   - precisa confirmar pipeline.

6. Anexos e histórico operacional
   - documentos ficam presos em cards/tarefas.

---

## 5.2 CRM de verdade vs gambiarra operacional

### CRM de verdade

- leads;
- contatos;
- clientes;
- oportunidades;
- pipeline comercial;
- histórico de relacionamento;
- campanhas;
- conversão;
- perda;
- reativação;
- pós-venda.

### Gambiarra operacional hoje no Bitrix

- compras/suprimentos como card CRM;
- OPM como pipeline de documento;
- CCEE como tarefa recorrente;
- demandas bancárias/fiscais como tarefa recorrente;
- deadline routers;
- gates por subtarefa;
- bloqueio de fim de semana;
- observador automático;
- O.S. de campo;
- anexar faturas e relatórios como fluxo operacional.

### Recomendação

Não copiar o Bitrix.

O sistema próprio deve separar:

1. CRM comercial.
2. Workflow operacional.
3. Gestão documental.
4. Scheduler.
5. Financeiro operacional.
6. Auditoria e relatórios.

---

## 5.3 MVP para o Bitrix deixar de ser crítico

1. Workflow engine simples:
   - entidade;
   - status;
   - responsável;
   - prazo;
   - anexos;
   - comentários;
   - histórico;
   - aprovação.

2. Módulo OPM:
   - clientes;
   - UCs;
   - períodos;
   - documentos;
   - auditoria;
   - relatório;
   - aprovação;
   - envio.

3. Módulo Compras:
   - solicitação;
   - cotação;
   - subtarefas;
   - aprovação;
   - pedido.

4. Scheduler/jobs:
   - recorrências configuráveis;
   - logs;
   - retries;
   - idempotência;
   - calendário Manaus;
   - política de fim de semana.

5. API para agentes:
   - consultar;
   - criar;
   - anexar;
   - comentar;
   - solicitar aprovação;
   - registrar ação.

---

## 5.4 O que não substituir no começo

1. Bitrix inteiro.
2. Todas as tarefas históricas.
3. Todos os anexos antigos.
4. CRM comercial geral se ainda não estiver modelado.
5. BI sofisticado.
6. Publicação automática de marketing.
7. Gestão completa de obras se O.S. ainda está rascunho.
8. OMIE como sistema financeiro oficial.
9. PagBank como fonte de pagamento.
10. PluggaMob/OCPP como fonte técnica primária.

---

# 6. Crons e relatórios virando produto

## 6.1 Automatizar no sistema

1. PluggaMob ocupação/lotação/mudança de status.
2. Relatórios PluggaMob manhã/tarde/diário/semanal.
3. Monitor de cupons.
4. Controle D+14.
5. Compras/Suprimentos routers/gates.
6. OPM KPIs e data de envio.
7. Recorrências fiscais/bancárias.
8. Governança de deadline.
9. Bloqueio de criação de tarefa no fim de semana.
10. Lembretes de prazo.

---

## 6.2 Manter no OpenClaw

1. Auditoria energética complexa.
2. Relatórios narrativos e consultivos.
3. Conteúdo/Cafeína.
4. Comparativo de cotações por PDF.
5. Exceções financeiras.
6. Comunicação humana.
7. Decisão estratégica.

---

## 6.3 Matar ou revisar antes de migrar

1. Backups `.bak` de scripts antigos.
2. Scripts one-off.
3. Relatórios antigos específicos de caso.
4. Monitor Voltz ativo sem validação, pois Voltz foi desativado para envio automático.
5. Jobs duplicados de compras rodando a cada minuto com `sleep 30`.
6. Crons criados apenas para compensar limitação do Bitrix.

---

# 7. Arquitetura sugerida

## 7.1 MVP — máximo 5 módulos

### Módulo 1 — Core operacional / Workflow

- usuários;
- empresas;
- áreas;
- permissões;
- tarefas/processos;
- status;
- responsáveis;
- prazos;
- anexos;
- comentários;
- aprovações;
- logs;
- eventos;
- histórico.

### Módulo 2 — PluggaMob Ops

- usuários EV;
- sessões;
- locations;
- estações;
- conectores;
- ocupação;
- alertas;
- cupons;
- réguas CRM EV Point;
- logs de envio;
- KPIs.

### Módulo 3 — Financeiro operacional

- D+14;
- fechamento PluggaMob;
- conciliação;
- repasses;
- OMIE read-only;
- PagBank import;
- exportações;
- aprovações financeiras.

### Módulo 4 — OPM / Auditoria energética

- cliente;
- UC;
- faturas;
- NF;
- encargos;
- relatório;
- aprovação;
- envio;
- indicadores;
- bridge Bitrix C7 no período de transição.

### Módulo 5 — Integrações & Scheduler

- Bitrix bridge temporário;
- OMIE;
- PluggaMob/OCPP;
- Telegram;
- WhatsApp;
- PagBank import;
- scheduler;
- retry;
- idempotência;
- monitoramento de saúde.

---

## 7.2 V2

1. CRM comercial Plugga/Waze completo.
2. O.S. engenharia/obras maduro.
3. Compras/suprimentos completo.
4. BI executivo.
5. Portal do cliente.
6. Área do parceiro PluggaMob.
7. Motor de documentos com templates.
8. Calendário de conteúdo/marketing.
9. Gestão de acervo técnico/CATs.
10. Permissões avançadas por empresa/área.

---

## 7.3 Stack recomendada

### Backend

Opção recomendada: **NestJS**.

Motivo:

- arquitetura modular;
- bom para API robusta;
- bom para times usando Cursor;
- fácil organizar domínios;
- bom ecossistema TypeScript.

Alternativa aceitável: **FastAPI**, caso o time prefira Python por proximidade com scripts atuais.

### Banco

**PostgreSQL**, preferencialmente via Supabase no MVP.

Motivo:

- relacional;
- auditável;
- bom para workflows;
- bom para BI;
- fácil expor API;
- já combina com o blueprint PluggaMob.

### Fila/jobs

MVP:

- BullMQ;
- Redis.

V2:

- Temporal, se a complexidade de workflows crescer.

### Frontend

**Next.js**.

### Storage

- Supabase Storage ou S3 compatível.

### Auth

- Supabase Auth no MVP;
- possibilidade de RBAC próprio por área.

### Logs

Obrigatório desde o dia 1:

- `event_log`;
- `agent_actions`;
- `integration_logs`;
- `job_runs`.

---

# 8. Como o OpenClaw consumiria o sistema

O OpenClaw deve consumir o sistema via API.

Endpoints sugeridos:

- `GET /tasks?assigned_to=openclaw`
- `POST /events`
- `POST /documents/draft`
- `POST /approvals/request`
- `GET /cases/:id/context`
- `POST /comments`
- `GET /alerts/pending`
- `POST /agent-actions`
- `GET /crm/users/:id`
- `GET /opm/cases/:id`
- `GET /settlements/:id`

Toda ação do agente deve gerar registro em `agent_actions` com:

- agente;
- usuário solicitante;
- canal;
- ação;
- input;
- payload;
- decisão;
- aprovação;
- resultado;
- timestamp;
- erro, se houver.

Regra: o OpenClaw não deve gravar estado crítico sem trilha de auditoria.

---

# 9. Como humanos acessam

Interface principal: web app.

Telas mínimas:

1. Dashboard geral.
2. PluggaMob Ops.
3. CRM EV Point.
4. Financeiro PluggaMob.
5. OPM.
6. Compras.
7. Jobs/Scheduler.
8. Integrações.
9. Aprovações.
10. Logs.

Formato recomendado:

- Kanban onde houver workflow.
- Timeline em cada processo.
- Upload/anexos.
- Comentários.
- Aprovação humana.
- Export PDF/XLSX.
- Notificações Telegram/WhatsApp.

Telegram/WhatsApp devem ser canais, não sistema de origem.

---

# 10. Riscos

## Top 10 riscos de migrar errado

1. Tentar substituir Bitrix, OpenClaw e scripts ao mesmo tempo.
2. Perder regra financeira PluggaMob na migração.
3. Copiar crons ruins em vez de transformar em jobs/eventos idempotentes.
4. Ignorar horário de Manaus.
5. Misturar parceiros EV Point, Voltz e outros.
6. Migrar CRM PluggaMob sem histórico de contatos/conversões.
7. Tratar OpenClaw como legado a matar, em vez de assistente pós-sistema.
8. Não criar trilha de auditoria.
9. Automatizar envio externo sem aprovação.
10. Subestimar anexos/documentos como parte central do processo.

---

# 11. Ordem recomendada de implementação

## Semanas 1–2 — Fundamento e espelho seguro

Objetivo: sistema observa, não substitui.

Entregas:

1. Modelar banco inicial:
   - users;
   - organizations;
   - customers;
   - tasks;
   - workflows;
   - documents;
   - events;
   - integrations;
   - agent_actions.

2. Criar API básica.
3. Criar auth.
4. Criar ingestão read-only:
   - jobs atuais;
   - Bitrix pipelines principais;
   - PluggaMob sessões/locations;
   - OMIE contas a pagar/receber;
   - arquivos CRM PluggaMob.
5. Criar painel de inventário:
   - jobs ativos;
   - scripts;
   - integrações;
   - owners;
   - criticidade;
   - último run;
   - erro.

---

## Semanas 3–4 — Primeiro domínio transacional

Prioridade: CRM PluggaMob + PluggaMob Ops read/write controlado.

Entregas:

1. Importar base EV Point v9.
2. Implementar segmentação R0–R6.
3. Implementar lealdade.
4. Implementar gap de cadência.
5. Criar campanhas/contatos/conversão.
6. Criar dashboard KPIs.
7. Criar logs de contato.
8. OpenClaw passa a consultar CRM por API.

Meta: CRM PluggaMob deixa de viver em planilha/blueprint.

---

## Semanas 5–8 — Operação e financeiro PluggaMob + OPM

Entregas:

1. Implementar fechamento semanal PluggaMob.
2. Implementar D+14.
3. Implementar ocupação/eventos com validação.
4. Implementar OPM workflow mínimo.
5. Criar bridge Bitrix temporária.
6. Criar scheduler interno.
7. Rodar em paralelo com OpenClaw/Bitrix por 2 ciclos antes de cutover.

Meta: sistema vira fonte de verdade para pelo menos um domínio P0.

---

# 12. Dependências

1. Confirmar acesso seguro às APIs:
   - Bitrix;
   - OMIE;
   - PluggaMob;
   - PagBank/export;
   - Telegram;
   - WhatsApp gateway.

2. Limpar dados do Bitrix:
   - duplicidade;
   - cards sem dono;
   - tarefas avulsas;
   - anexos antigos.

3. Confirmar modelo de permissões:
   - financeiro;
   - PluggaMob;
   - engenharia;
   - marketing;
   - diretoria.

4. Definir cutover por domínio, não geral.

5. Puxar contexto faltante:
   - `jobs.json` extraído na pasta `plugga-sistema/knowledge/`;
   - `flows`;
   - workspaces dos agentes filhos;
   - configs sem secrets;
   - relatórios específicos não lidos nesta rodada.

---

# 13. One-pager do produto

## Nome provisório

**Plugga/Waze OS**

## O que é

Sistema próprio de CRM, operação, auditoria e integrações da Plugga/Waze, responsável por guardar estado, processos, filas, regras de negócio, documentos, jobs, logs e KPIs que hoje estão espalhados entre Bitrix, OpenClaw, scripts, crons e planilhas.

## Para quem é

1. Dilkson.
2. Equipe Plugga/Waze.
3. Financeiro.
4. OPM.
5. PluggaMob/EV Point.
6. Compras/suprimentos.
7. Engenharia.
8. Marketing em V2.
9. Agentes OpenClaw via API.

## Problema que resolve

A operação hoje depende demais de conhecimento distribuído em agente, skills, memória, Bitrix, crons e scripts.

Isso dificulta escala, auditoria, rastreabilidade, onboarding, evolução, segurança, previsibilidade e transferência para sistema próprio.

## O que entrega no MVP

1. Workflow operacional.
2. PluggaMob CRM/Ops.
3. Financeiro operacional básico.
4. OPM/auditoria workflow.
5. Integrações/scheduler/API para agentes.

## O que não é

1. Não é substituição total imediata do OpenClaw.
2. Não é substituição total imediata do Bitrix.
3. Não é ERP financeiro no lugar do OMIE.
4. Não é plataforma OCPP do zero.
5. Não é automação cega de envio externo.
6. Não é BI bonito sem operação transacional por baixo.
7. Não é recriação do Bitrix com outra interface.

---

# 14. Backlog MVP

## Épico 1 — Core operacional

1. Criar usuários.
2. Criar empresas.
3. Criar áreas.
4. Criar permissões.
5. Criar entidade genérica de workflow.
6. Criar status.
7. Criar responsáveis.
8. Criar prazos.
9. Criar aprovações.
10. Criar anexos/documentos.
11. Criar comentários.
12. Criar timeline.
13. Criar `event_log`.
14. Criar `agent_actions`.
15. Criar scheduler interno com logs/retry/idempotência.

## Épico 2 — Integrações base

1. Conector Bitrix read-only.
2. Conector OMIE read-only.
3. Conector PluggaMob read-only.
4. Import PagBank por arquivo.
5. Canal Telegram como notificação.
6. Canal WhatsApp como notificação.
7. Registro seguro de credenciais sem expor valores.
8. Painel de saúde das integrações.
9. Log de chamadas externas.
10. Registro de erro por integração.

## Épico 3 — CRM PluggaMob EV Point

1. Importar base usuários EV Point.
2. Importar sessões.
3. Implementar segmentação R0–R6.
4. Implementar lealdade.
5. Implementar gap de cadência.
6. Criar fila de contato.
7. Registrar contato.
8. Registrar resposta.
9. Registrar conversão.
10. Medir conversão em 7/14/30 dias.
11. Dashboard KPIs do blueprint.
12. Exportar listas operacionais.

## Épico 4 — PluggaMob Ops / recargas

1. Modelar parceiros.
2. Modelar locations.
3. Modelar estações.
4. Modelar conectores.
5. Ingerir sessões.
6. Ingerir status/ocupação.
7. Criar políticas de aviso.
8. Criar logs de envio.
9. Criar anti-duplicidade/debounce.
10. Bloquear envio se validação for inconclusiva.
11. Gerar relatório diário.
12. Gerar relatório semanal.

## Épico 5 — Fechamento PluggaMob

1. Importar planilha de sessões.
2. Importar PagBank.
3. Modelar TOKEN/RFID como chave.
4. Classificar sessão.
5. Calcular taxa Plugga.
6. Calcular repasse.
7. Controlar D+14.
8. Identificar saldo antigo.
9. Identificar cupom.
10. Identificar privilegiado/rede.
11. Gerar relatório/export.
12. Aprovação humana antes de envio.

## Épico 6 — OPM

1. Modelar cliente.
2. Modelar UC.
3. Modelar período.
4. Upload de fatura.
5. Upload de NF.
6. Upload de encargos.
7. Status OPM.
8. Regras de insumos mínimos.
9. Aprovação do relatório.
10. Data de envio.
11. Export/API para OpenClaw gerar relatório.
12. Bridge temporária com Bitrix C7.

---

# 15. Prompt curto de handoff para desenvolvimento

```text
Estamos construindo o Plugga/Waze OS, sistema próprio para tirar do OpenClaw/Bitrix a responsabilidade de guardar estado operacional, CRM, filas, jobs, relatórios, auditorias e logs.

Regra crítica: não alterar a operação atual. Primeiro o sistema roda em paralelo, read-only/importando dados. Cutover só por domínio e com aprovação explícita.

Escopo MVP:
1. Core operacional: usuários, permissões, workflows, tarefas, status, prazos, anexos, comentários, timeline, approvals, event_log e agent_actions.
2. Integrações: Bitrix read-only/bridge, OMIE read-only, PluggaMob read-only, import PagBank, Telegram/WhatsApp apenas como canal de notificação, scheduler com logs/retry/idempotência.
3. CRM PluggaMob EV Point: importar base de usuários/sessões, implementar segmentação R0–R6, lealdade, gap de cadência, fila de contato, registros de contato e KPIs.
4. PluggaMob Ops/Financeiro: sessões, locations, conectores, ocupação, políticas de aviso, logs, cupons, fechamento semanal, taxa Plugga, repasse e D+14.
5. OPM: cliente, UC, período, faturas, NF, encargos, relatório, aprovação, data de envio e bridge com Bitrix C7.

Princípios:
- PostgreSQL/Supabase como fonte de verdade.
- Next.js para web app.
- Backend NestJS ou FastAPI; preferência operacional: NestJS.
- Jobs em BullMQ/Redis no MVP.
- Toda ação de agente via API gera agent_action auditável.
- OpenClaw continua como assistente/orquestrador, não como banco de estado.
- Não copiar Bitrix literalmente: separar CRM real de workflow operacional.
- Não automatizar envio externo sem aprovação humana.
- Não migrar tudo de uma vez. Começar por CRM PluggaMob + PluggaMob Ops, depois financeiro PluggaMob e OPM.
```

---

# 16. Conclusão

O MVP certo não é “um Bitrix novo”.

O MVP certo é um **sistema operacional interno com API para agentes**.

A arquitetura ideal separa:

1. Sistema como fonte de verdade.
2. OpenClaw como assistente/orquestrador.
3. Bitrix como legado temporário/ponte.
4. OMIE, PagBank e PluggaMob como fontes externas integradas.
5. Telegram/WhatsApp como canais, não como banco operacional.

A migração deve ser por domínio, começando onde há maior clareza e maior risco operacional:

1. CRM PluggaMob EV Point.
2. PluggaMob Ops.
3. Fechamento financeiro PluggaMob.
4. OPM.
5. Compras/Suprimentos.
6. Demais áreas em V2.

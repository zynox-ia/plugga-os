# Plugga/Waze OS — Modelo Ideal de Telas MVP

**Data:** 05/08/2026 — horário de Manaus  
**Entrega:** informação arquitetural + telas, sem código  
**Arquivo base:** `/root/.openclaw/workspace/reports/plugga-sistema/diagnostico-escopo-sistema-proprio-2026-08-05.md`  
**Blueprint base:** `/root/.openclaw/workspace/reports/pluggamob/crm/Blueprint_CRM_PluggaMob_v2_1_29jul2026.md`  
**Modo:** planejamento. Nenhuma alteração operacional feita em Bitrix, OpenClaw, crons, configs, skills ou integrações.

---

## 1. Objetivo deste documento

Desenhar o **modelo ideal do Plugga/Waze OS** em nível de produto, focado em:

1. menu lateral completo;
2. telas reais do MVP;
3. abas e componentes de cada tela;
4. ações principais;
5. usuários de cada tela;
6. fichas/detalhes centrais;
7. o que fica fora do MVP;
8. ordem de construção para o sistema ficar clicável cedo.

O foco aqui não é código. É deixar o produto visível tela a tela.

---

## 2. Fontes usadas

### 2.1 Fontes internas Plugga/Waze

1. Diagnóstico salvo em:
   - `/root/.openclaw/workspace/reports/plugga-sistema/diagnostico-escopo-sistema-proprio-2026-08-05.md`

2. Blueprint CRM PluggaMob:
   - `/root/.openclaw/workspace/reports/pluggamob/crm/Blueprint_CRM_PluggaMob_v2_1_29jul2026.md`

3. Skills operacionais consultadas anteriormente:
   - `skills/pluggamob-recargas-operacao/SKILL.md`
   - `brains/time/areas/pluggamob/skills/pluggamob-fechamento-parceiros/SKILL.md`
   - `skills/bitrix-operacao-mes-a-mes/SKILL.md`
   - `memory/integrations/bitrix24-operacao-mes-a-mes.md`
   - `skills/analise-fatura-cativa-plugga/SKILL.md`
   - `brains/time/areas/suprimentos-compras/skills/bitrix-compras-suprimento-funil/SKILL.md`
   - `brains/time/areas/financeiro-controladoria/skills/alerta-financeiro-d14/SKILL.md`

### 2.2 Raio-X Bitrix feito em modo leitura

Consulta via API Bitrix24/Webhook em modo read-only.

Achados principais:

| Item | Quantidade / achado |
|---|---:|
| Usuário API | `DK JUNIOR`, ID 755 |
| Usuários ativos | 21 |
| Grupos/projetos/collabs | 23 |
| Deals/negócios | 368 |
| Leads | 311 |
| Contatos | 494 |
| Empresas | 291 |
| Tarefas abertas | 283 |
| Campos customizados em deal | 121 |
| Pipelines de deals | 11 |

### 2.3 Documentação pública Bitrix consultada

Portal/API pública Bitrix indica capacidades relevantes:

1. CRM com entidades padrão:
   - leads;
   - deals;
   - contatos;
   - empresas;
   - propostas/orçamentos;
   - documentos;
   - faturas;
   - smart processes.

2. CRM card com:
   - campos;
   - funil;
   - estágio;
   - timeline;
   - atividades;
   - comentários;
   - documentos;
   - automações.

3. Smart Processes:
   - entidades customizadas;
   - funis próprios;
   - campos customizados;
   - estágios;
   - uso para aprovações, solicitações internas e objetos específicos.

4. Tarefas:
   - responsável;
   - criador;
   - observadores;
   - prazos;
   - grupo/projeto;
   - subtarefas;
   - checklist;
   - arquivos;
   - resultado obrigatório;
   - histórico;
   - tempo gasto;
   - vínculo com CRM.

5. Kanban e estágios:
   - por CRM;
   - por tarefas;
   - por grupo/projeto.

6. Flows:
   - distribuição automática de tarefas.

7. Widgets/embed:
   - abas dentro do CRM;
   - botões na toolbar;
   - ações no card;
   - integração com app externo.

**Conclusão arquitetural:** o Bitrix é forte como CRM/tarefas genéricas, mas a Plugga/Waze já usa o Bitrix como workflow operacional, financeiro, documental e técnico. O Plugga/Waze OS deve absorver o domínio de negócio e usar lógica própria, não apenas copiar os funis do Bitrix.

---

# 3. Raio-X Bitrix atual

## 3.1 Pipelines CRM identificados

| Category ID | Nome | Leitura operacional |
|---:|---|---|
| 0 | VENDAS | CRM comercial geral + misturas de OPM Produto e Canal Aberto |
| 5 | MIGRAÇÃO | Migração ACL / Mercado Livre |
| 7 | OPERAÇÃO MES A MES | OPM, faturas, relatórios, cliente mensal |
| 9 | AUDITORIAS | Auditorias e processos de contestação |
| 35 | PLUGGA MOB | Pipeline comercial/operacional PluggaMob |
| 37 | CLIENTES GERAL | Cadastro/base geral de clientes |
| 39 | ASSOCIAÇÃO BIGD - NILTON LINS | Associação específica |
| 41 | ASSOCIAÇÃO BRT - BARATEIRO | Associação específica |
| 45 | ASSOCIAÇÃO GLOBAL | Associação específica |
| 47 | GESTÃO DE CONTRATOS | Contratos, minutas, assinatura, dossiê |
| 43 | COMPRAS | Compras/suprimentos; na prática é workflow operacional |

## 3.2 Volume por pipeline

| Pipeline | Deals |
|---|---:|
| OPERAÇÃO MES A MES — C7 | 131 |
| VENDAS — C0 | 80 |
| PLUGGA MOB — C35 | 52 |
| CLIENTES GERAL — C37 | 38 |
| AUDITORIAS — C9 | 23 |
| MIGRAÇÃO — C5 | 16 |
| COMPRAS — C43 | 11 |
| ASSOCIAÇÃO BIGD — C39 | 9 |
| ASSOCIAÇÃO BRT — C41 | 5 |
| GESTÃO DE CONTRATOS — C47 | 2 |
| ASSOCIAÇÃO GLOBAL — C45 | 1 |

## 3.3 Estágios importantes por pipeline

### VENDAS — categoryId 0

1. LEADS
2. QUALIFICAÇÃO
3. ESTUDO DE ECONOMIA
4. VENDAS
5. SUCESSO DO CLIENTE
6. REVISITAR
7. GANHO
8. PERDIDO

**Leitura:** é o CRM comercial geral, mas está recebendo também registros de OPM Produto e Canal Aberto. Isso é sinal de mistura entre comercial, atendimento e operação.

---

### MIGRAÇÃO — categoryId 5

1. PREPARAR DOCUMENTAÇÃO
2. CARTA DENUNCIA
3. ENVIAR DOCUMENTAÇÕES
4. PARECER DE LOCALIZAÇÃO
5. PROJETO SMF
6. VISITA TECNICA ACL
7. COMISSIONAMENTO
8. CADASTRO DO PONTO (AmE)
9. VALIDAÇÃO SMA (AmE)
10. CONTRATO CUSD - ACL
11. CONTRATO CUSD/ACL (MODO API)
12. INICIO DE OPERAÇÃO MERCADO LIVRE
13. PROBLEMA MIGRACAO

**Leitura:** fluxo técnico/regulatório de migração ACL. Deve virar módulo próprio V2 ou subfluxo de Energia/OPM, não entrar no MVP principal se o objetivo for entregar rápido.

---

### OPERAÇÃO MES A MES — categoryId 7

1. AGUARDANDO FATURA
2. FATURAS RECEBIDAS
3. AUDITORIA DE FATURAS
4. VALIDAÇÃO DE RELATÓRIOS
5. ENVIAR AO CLIENTE
6. FATURA ENVIADA
7. CLIENTE PERDIDO - CHURN

**Leitura:** pipeline mais importante para OPM. Deve virar tela nativa do Plugga/Waze OS no MVP.

---

### AUDITORIAS — categoryId 9

1. CAPTURA DE FATURAS
2. AUDITORIA
3. PROCURAÇÃO
4. PROCESSO PROTOCOLADO
5. AGUARDANDO RESPOSTA
6. PROCESSO GANHO
7. PROCESSO PERDIDO
8. ANALISAR FALHA

**Leitura:** parece processo de contestação/auditoria com protocolo. Deve entrar como V2 ou como uma aba de OPM/Auditorias, não como primeiro MVP.

---

### PLUGGA MOB — categoryId 35

1. NOVA OPORTUNIDADE
2. QUALIFICAÇÃO
3. VISITA COMERCIAL
4. PROPOSTA COMERCIAL
5. VISITA TECNICA
6. FECHAMENTO
7. PONTOS DE RECARGA
8. VENDA FECHA
9. NEGOCIO PERDIDO
10. ANALISE DO FALHA

**Leitura:** hoje é pipeline comercial de pontos de recarga. O CRM PluggaMob EV Point do blueprint é mais avançado e deve virar módulo separado dentro do PluggaMob OS.

---

### COMPRAS — categoryId 43

1. PEDIDO GERADO
2. ANÁLISE DE ESTOQUE
3. COTAÇÕES/ORÇAMENTOS
4. APROVAÇÃO DE COMPRA
5. PROVISIONAMENTO/PAGAMENTO
6. RETIRADA/RECEBIMENTO
7. AQUISIÇÃO CONCLUIDA
8. Negócio ganho
9. Negócio perdido

**Leitura:** isso não é CRM. É workflow de compras. No sistema próprio deve ser tratado como `Compras`, com solicitação, cotação, aprovação, pagamento e recebimento.

---

### GESTÃO DE CONTRATOS — categoryId 47

1. COLETA DE DOCUMENTOS
2. ELABORAÇÃO MINUTA
3. ENVIO P/ASSINATURA
4. ARQUIVAMENTO DRIVE
5. DOSSIÊ ENVIADO (FIN)
6. ADITIVO
7. DISTRATO
8. Negócio ganho
9. Negócio perdido

**Leitura:** importante, mas V2. No MVP só precisa prever que documentos/contratos terão entidade própria depois.

---

## 3.4 Tarefas abertas por grupo/projeto

| Grupo ID | Grupo | Tarefas abertas |
|---:|---|---:|
| 9 | GESTÃO OPERACIONAL | 96 |
| 0 | Sem grupo / avulsas | 74 |
| 57 | GESTÃO FINANCEIRA - WAZE ENERGIA | 51 |
| 59 | GESTÃO FINANCEIRA - PLUGGA | 34 |
| 33 | ENGENHARIA E OBRAS | 13 |
| 55 | GESTÃO DE PROCESSOS | 9 |
| 61 | PROJETO UFV - SESC | 4 |
| 35 | Financeiro/legado identificado na memória como FINANCEIRO | 1 |
| 53 | ELETROPOSTO - PLUGGA | 1 |

**Leitura crítica:** 74 tarefas abertas sem grupo é um sinal forte de perda de governança. O Plugga/Waze OS deve impedir processo crítico sem área/projeto/dono.

## 3.5 Tarefas abertas por status

| Status Bitrix | Quantidade | Leitura |
|---|---:|---|
| 2 | 268 | abertas/em andamento/pendentes, dependendo da leitura Bitrix |
| 3 | 13 | em andamento/aguardando conforme status interno |
| 4 | 1 | aguardando controle/revisão |
| 6 | 1 | status especial/deferido |

## 3.6 Responsáveis com mais tarefas abertas

| ID | Pessoa | Tarefas abertas |
|---:|---|---:|
| 29 | Fabíola Oliveira | 83 |
| 761 | Diane Durante | 50 |
| 17 | Leciane Figueiredo | 40 |
| 13 | Alessandra Thays | 27 |
| 1 | Dilkson Gomes | 21 |
| 607 | Janderson Maciel | 19 |
| 763 | Danilo Barros | 13 |
| 81 | Kerolayne Andrade | 10 |
| 703 | Parceiro Bitrix | 9 |
| 681 | Igor Nascimento | 6 |
| 755 | DK Junior | 4 |
| 673 | Rafael Marques | 1 |

## 3.7 Grupos/projetos relevantes encontrados

1. GESTÃO OPERACIONAL — ID 9
2. GESTÃO FINANCEIRA - WAZE ENERGIA — ID 57
3. GESTÃO FINANCEIRA - PLUGGA — ID 59
4. ENGENHARIA E OBRAS — ID 33
5. GESTÃO DE PROCESSOS — ID 55
6. PLUGGA MOB — ID 51
7. ELETROPOSTO - PLUGGA — ID 53
8. WAZE + MONITORAMENTO CLIENTE — ID 39
9. ELABORAÇÃO DE PROJETOS TÉCNICOS — ID 5
10. PROJETO UFV - SESC — ID 61
11. PLANEJAMENTO MKT — ID 47

---

# 4. Princípio do produto

O Plugga/Waze OS não deve ser “um Bitrix novo”.

Ele deve ser um sistema operacional interno com:

1. **CRM real** para relacionamento, vendas e reativação.
2. **Workflow operacional** para OPM, compras, financeiro e engenharia.
3. **Operação PluggaMob** para recargas, locais, sessões, cupons e fechamentos.
4. **Central documental** para faturas, relatórios, comprovantes, propostas e contratos.
5. **Scheduler/auditoria** para jobs, recorrências e logs.
6. **API para agentes** para o OpenClaw operar como assistente, não como banco de estado.

---

# 5. Menu lateral completo — visão ideal

## 5.1 MVP clicável

```text
Plugga/Waze OS

1. Dashboard
   1.1 Visão geral
   1.2 Pendências críticas
   1.3 Agenda operacional
   1.4 Jobs e integrações

2. CRM
   2.1 Leads e oportunidades
   2.2 Clientes
   2.3 Empresas
   2.4 Funil comercial
   2.5 Reativação PluggaMob
   2.6 Campanhas e contatos

3. OPM — Operação Mês a Mês
   3.1 Ciclos mensais
   3.2 Faturas recebidas
   3.3 Auditorias de fatura
   3.4 Relatórios
   3.5 Aprovações
   3.6 Envio ao cliente
   3.7 KPIs OPM

4. PluggaMob
   4.1 Dashboard PluggaMob
   4.2 Usuários EV Point
   4.3 Sessões de recarga
   4.4 Locais e conectores
   4.5 Ocupação ao vivo
   4.6 Cupons
   4.7 Fechamentos
   4.8 D+14 e repasses
   4.9 Alertas e mensagens

5. Financeiro Operacional
   5.1 D+14 Waze/Plugga
   5.2 Contas a pagar
   5.3 Contas a receber
   5.4 Alertas financeiros
   5.5 Comprovantes
   5.6 Integração OMIE

6. Compras e Suprimentos
   6.1 Solicitações
   6.2 Cotações
   6.3 Aprovações
   6.4 Pagamentos/provisionamento
   6.5 Recebimentos
   6.6 Scorecard compras

7. Engenharia e Obras
   7.1 O.S. de campo
   7.2 Projetos e obras
   7.3 Documentos técnicos
   7.4 Evidências/fotos
   7.5 Atestados e CATs

8. Documentos
   8.1 Biblioteca
   8.2 Relatórios gerados
   8.3 Faturas e NFs
   8.4 Contratos
   8.5 Templates

9. Jobs e Automações
   9.1 Jobs ativos
   9.2 Histórico de execuções
   9.3 Falhas
   9.4 Agendamentos
   9.5 Webhooks/eventos

10. Integrações
   10.1 Bitrix24
   10.2 OMIE
   10.3 PluggaMob/OCPP
   10.4 PagBank
   10.5 Telegram
   10.6 WhatsApp
   10.7 RapidAPI

11. Agentes IA
   11.1 OpenClaw / DK Junior
   11.2 Ações dos agentes
   11.3 Aprovações solicitadas
   11.4 Memória operacional
   11.5 Logs de orquestração

12. Administração
   12.1 Usuários
   12.2 Equipes e áreas
   12.3 Permissões
   12.4 Configurações
   12.5 Auditoria de acesso
```

## 5.2 O que aparece no menu mas pode nascer bloqueado no MVP

1. Engenharia e Obras.
2. Contratos.
3. Atestados e CATs.
4. Templates avançados.
5. BI executivo profundo.
6. Marketing/conteúdo.
7. Portal do cliente.

Esses itens podem aparecer como “em breve” ou “V2”, mas o menu já deve prever a arquitetura futura.

---

# 6. Inventário de telas do MVP

## Tela 1 — Dashboard Geral

**Usuários:** Dilkson, DK, gestores, operação.  
**Objetivo:** mostrar saúde da operação em 30 segundos.

### Abas

1. Hoje
2. Semana
3. P0/P1
4. Integrações
5. Pendências por área

### O que aparece

- Cards de KPIs:
  - tarefas críticas abertas;
  - ciclos OPM atrasados;
  - fechamentos pendentes;
  - alertas PluggaMob;
  - jobs com falha;
  - integrações instáveis;
  - aprovações aguardando humano.
- Lista “atenção agora”.
- Gráfico simples por área.
- Próximos vencimentos.
- Últimos eventos relevantes.

### Ações principais

1. Abrir pendência.
2. Filtrar por área.
3. Solicitar resumo ao agente.
4. Criar tarefa/processo manual.
5. Ir para detalhe.

---

## Tela 2 — Central de Pendências

**Usuários:** todos os gestores e operadores.  
**Objetivo:** substituir parte da visão de tarefas do Bitrix.

### Abas

1. Minhas pendências
2. Da minha área
3. Atrasadas
4. Sem dono
5. Sem área
6. Aguardando aprovação

### O que aparece

- Lista/kanban com:
  - título;
  - área;
  - responsável;
  - prazo;
  - criticidade;
  - origem;
  - vínculo com cliente/processo;
  - status.

### Ações principais

1. Atribuir responsável.
2. Alterar prazo com justificativa.
3. Comentar.
4. Anexar documento.
5. Marcar como concluído com resultado obrigatório.
6. Escalar para gestor.

### Regra de produto

Nenhuma pendência crítica pode existir sem:

1. área;
2. dono;
3. prazo;
4. origem;
5. status.

---

## Tela 3 — CRM / Leads e Oportunidades

**Usuários:** Dilkson, Thiago, SDRs, comercial.  
**Base Bitrix:** pipeline `VENDAS`, categoryId 0.

### Abas

1. Kanban
2. Lista
3. Leads novos
4. Revisitados
5. Ganhos
6. Perdidos
7. Fontes

### O que aparece

- Kanban por estágio:
  - Leads;
  - Qualificação;
  - Estudo de economia;
  - Vendas;
  - Sucesso do cliente;
  - Revisitar;
  - Ganho;
  - Perdido.
- Cards com:
  - nome;
  - empresa;
  - fonte;
  - responsável;
  - próximo passo;
  - valor potencial;
  - data da última interação.

### Ações principais

1. Criar lead.
2. Qualificar.
3. Converter para oportunidade.
4. Vincular cliente/empresa.
5. Registrar contato.
6. Criar proposta.
7. Marcar ganho/perdido.
8. Enviar para OPM ou PluggaMob quando virar operação.

---

## Tela 4 — Clientes

**Usuários:** todos que consultam histórico de cliente.  
**Objetivo:** ficha única do cliente, substituindo fragmentação entre CRM, OPM, financeiro e PluggaMob.

### Abas

1. Todos
2. Ativos
3. Prospects
4. OPM
5. PluggaMob
6. Associações/GD
7. Inativos/churn

### O que aparece

- Tabela com:
  - nome;
  - empresa;
  - CNPJ/CPF mascarado;
  - tipo de cliente;
  - unidade(s) consumidora(s);
  - status;
  - responsável;
  - último contato;
  - produtos ativos.

### Ações principais

1. Abrir ficha do cliente.
2. Adicionar contato.
3. Vincular UC.
4. Criar ciclo OPM.
5. Criar oportunidade.
6. Criar documento.
7. Ver histórico completo.

---

## Tela 5 — Ficha do Cliente CRM

**Usuários:** comercial, operação, financeiro, DK, Dilkson.  
**Tipo:** tela de detalhe.

### Abas

1. Resumo
2. Contatos
3. Oportunidades
4. OPM
5. PluggaMob
6. Financeiro
7. Documentos
8. Timeline
9. Ações do agente

### O que aparece

#### Resumo

- dados cadastrais;
- tipo de cliente;
- responsável comercial;
- responsável operacional;
- produtos ativos;
- status geral;
- riscos;
- próximos passos.

#### Contatos

- pessoas vinculadas;
- telefone/e-mail;
- cargo;
- canal preferido;
- histórico de interação.

#### OPM

- UCs;
- ciclos mensais;
- relatórios;
- economia;
- pendências.

#### PluggaMob

- se for cliente/parceiro EV;
- locais;
- sessões;
- fechamentos;
- contatos de suporte.

#### Financeiro

- títulos OMIE vinculados;
- recebíveis;
- pendências;
- inadimplência.

#### Timeline

- tudo em ordem cronológica:
  - contato;
  - documento;
  - tarefa;
  - relatório;
  - aprovação;
  - ação do agente.

### Ações principais

1. Editar dados.
2. Adicionar contato.
3. Criar oportunidade.
4. Criar ciclo OPM.
5. Solicitar análise ao OpenClaw.
6. Anexar documento.
7. Registrar ligação/reunião.
8. Criar pendência.

---

## Tela 6 — Reativação PluggaMob

**Usuários:** operação PluggaMob, Thiago, DK, Dilkson.  
**Base:** Blueprint CRM PluggaMob v2.1.

### Abas

1. Visão geral
2. R0 — Onboarding
3. R1 — Saldo esperando
4. R2 — Nunca ativou sem saldo
5. R3 — Esfriando
6. R4 — Churn recente
7. R5 — Perdido
8. R6 — Resgate VIP
9. Campanhas
10. Conversões

### O que aparece

- KPIs:
  - base total;
  - ativados lifetime;
  - ativação lifetime;
  - retenção M1;
  - saldo parado R1;
  - saldo total R0+R1;
  - receita reativada;
  - conversão 7/14/30 dias.
- Tabela por régua:
  - cliente;
  - telefone;
  - saldo;
  - última recarga;
  - lealdade;
  - gap;
  - prioridade;
  - última abordagem;
  - próximo contato.

### Ações principais

1. Filtrar por régua.
2. Ordenar por lealdade/gap.
3. Abrir ficha do usuário.
4. Registrar contato.
5. Marcar resposta.
6. Marcar conversão.
7. Gerar lista de contato.
8. Pedir ao agente sugestão de copy.
9. Criar campanha.

### Regra de produto

R6 deve aparecer visualmente como contato pessoal. Não deve ter botão de disparo em massa no MVP.

---

## Tela 7 — Usuário EV Point / PluggaMob

**Usuários:** operação PluggaMob, suporte, financeiro, DK.  
**Tipo:** ficha de detalhe.

### Abas

1. Resumo
2. Sessões
3. Carteira/saldo
4. Cupons
5. Contatos CRM
6. Segmentação
7. Incidentes
8. Timeline

### O que aparece

#### Resumo

- nome;
- telefone mascarado;
- e-mail;
- data cadastro;
- status;
- saldo atual;
- total kWh;
- receita lifetime;
- última sessão;
- segmento atual;
- lealdade;
- gap de cadência.

#### Sessões

- data;
- local;
- conector;
- kWh;
- valor;
- status;
- forma de pagamento;
- TOKEN/RFID;
- flags de anomalia.

#### Carteira/saldo

- topups;
- consumo;
- origem do saldo;
- saldo antigo;
- crédito D+14 quando aplicável.

#### Contatos CRM

- campanha;
- canal;
- mensagem;
- resposta;
- operador;
- conversão.

### Ações principais

1. Registrar contato.
2. Marcar usuário como VIP.
3. Criar incidente.
4. Abrir sessão específica.
5. Solicitar análise de anomalia ao agente.
6. Exportar histórico.

---

## Tela 8 — Sessões de Recarga

**Usuários:** operação PluggaMob, financeiro PluggaMob.  
**Objetivo:** substituir consultas manuais e relatórios de sessão.

### Abas

1. Todas
2. Hoje
3. Em andamento
4. Finalizadas
5. 0 kWh / falhas
6. Sem pagamento
7. Privilegiadas/rede
8. Cupom
9. Exportações

### O que aparece

- lista com:
  - ID da sessão;
  - usuário;
  - local;
  - conector;
  - início/fim;
  - kWh;
  - valor;
  - status;
  - pagamento;
  - cupom;
  - TOKEN;
  - flag financeira.

### Ações principais

1. Filtrar por período/local/status.
2. Abrir sessão.
3. Marcar para revisão.
4. Vincular ao fechamento.
5. Exportar CSV/XLSX.
6. Gerar relatório operacional.

---

## Tela 9 — Detalhe da Sessão de Recarga

**Usuários:** operação, financeiro, suporte.  
**Tipo:** ficha de detalhe.

### Abas

1. Resumo
2. Dados técnicos
3. Financeiro
4. Carteira/ledger
5. Eventos
6. Auditoria

### O que aparece

#### Resumo

- ID da sessão;
- usuário;
- local;
- estação;
- conector;
- status;
- início/fim;
- duração;
- kWh;
- valor.

#### Dados técnicos

- status OCPP quando disponível;
- stop reason;
- SOC inicial/final;
- remote stop;
- eventos relevantes.

#### Financeiro

- valor bruto;
- taxa Plugga;
- repasse;
- origem do pagamento;
- PagBank vinculado;
- cupom;
- privilegiado;
- saldo antigo.

#### Auditoria

- flags:
  - sem pagamento;
  - 0 kWh;
  - saldo negativo;
  - tarifa corujão;
  - divergência PagBank;
  - TOKEN ausente.

### Ações principais

1. Marcar como revisada.
2. Abrir incidente.
3. Vincular pagamento.
4. Solicitar análise ao agente.
5. Exportar evidência.

---

## Tela 10 — Locais e Conectores

**Usuários:** operação PluggaMob, suporte técnico, DK.  
**Objetivo:** visualizar estrutura física da operação.

### Abas

1. Mapa/lista
2. EV Point
3. Parceiros
4. Conectores
5. Ocupação
6. Histórico

### O que aparece

- lista de locais:
  - nome;
  - parceiro;
  - endereço;
  - status;
  - conectores disponíveis;
  - ocupação atual;
  - última atualização;
  - política de aviso.

### Ações principais

1. Abrir local.
2. Ver conectores.
3. Ver sessões recentes.
4. Ver ocupação ao vivo.
5. Configurar política de alerta.
6. Desativar envio apenas com permissão/aprovação.

---

## Tela 11 — Detalhe do Local / Eletroposto

**Usuários:** operação, suporte, DK.  
**Tipo:** ficha de detalhe.

### Abas

1. Resumo
2. Conectores
3. Ocupação ao vivo
4. Sessões
5. Alertas
6. Incidentes
7. Relatórios

### O que aparece

#### Resumo

- local;
- parceiro;
- endereço;
- status operacional;
- quantidade de conectores;
- capacidade;
- ocupação atual;
- última validação real.

#### Conectores

- identificador;
- status;
- sessão atual;
- última mudança;
- disponibilidade.

#### Alertas

- políticas ativas;
- destino;
- janela de envio;
- debounce;
- último disparo;
- último bloqueio.

### Ações principais

1. Atualizar leitura manual.
2. Ver log de envio.
3. Abrir incidente.
4. Solicitar resumo ao agente.
5. Exportar relatório do local.

### Regra de produto crítica

Antes de qualquer envio externo de ocupação/disponibilidade, o sistema precisa registrar:

1. fonte consultada;
2. horário de validação;
3. status retornado;
4. decisão de envio/bloqueio;
5. destino;
6. payload enviado.

---

## Tela 12 — Cupons PluggaMob

**Usuários:** operação PluggaMob, financeiro.  
**Objetivo:** centralizar monitoramento de cupons e consumo.

### Abas

1. Ativos
2. Consumidos
3. Por campanha
4. Por usuário
5. Anomalias
6. Relatórios

### O que aparece

- cupom;
- campanha;
- usuário;
- saldo/valor;
- consumo;
- sessão vinculada;
- data;
- status;
- impacto financeiro.

### Ações principais

1. Filtrar por campanha.
2. Ver consumo.
3. Vincular a sessão.
4. Marcar anomalia.
5. Exportar sintético.

---

## Tela 13 — Fechamentos PluggaMob

**Usuários:** financeiro PluggaMob, Dilkson, DK.  
**Objetivo:** tirar fechamento de scripts/planilhas e transformar em fluxo auditável.

### Abas

1. Em aberto
2. Em conciliação
3. Divergências
4. Pronto para aprovação
5. Aprovados
6. Pagos/repassados
7. Histórico

### O que aparece

- parceiro;
- período;
- sessões;
- bruto;
- taxa Plugga;
- repasse;
- D+14;
- divergências;
- responsável;
- status.

### Ações principais

1. Criar fechamento.
2. Importar sessões.
3. Importar PagBank.
4. Rodar conciliação.
5. Ver divergências.
6. Solicitar revisão ao agente.
7. Enviar para aprovação.
8. Exportar relatório/planilhas.

---

## Tela 14 — Detalhe do Fechamento

**Usuários:** financeiro, DK, Dilkson.  
**Tipo:** ficha de detalhe.

### Abas

1. Resumo
2. Sessões
3. PagBank
4. Ledger/carteira
5. Classificações
6. D+14
7. Divergências
8. Relatório
9. Aprovações
10. Timeline

### O que aparece

#### Resumo

- parceiro;
- período;
- janela Manaus;
- status;
- total de sessões;
- kWh;
- bruto;
- taxa Plugga;
- valor de repasse;
- crédito D+14;
- valor a cobrar;
- divergências abertas.

#### Classificações

- topup novo;
- saldo antigo;
- cupom;
- privilegiado/rede;
- sem pagamento;
- estorno;
- misto.

#### Divergências

- sessão sem pagamento;
- PagBank sem sessão;
- TOKEN ausente;
- valor divergente;
- sessão fora de janela;
- status não finalizado.

### Ações principais

1. Aprovar fechamento.
2. Reprovar e devolver.
3. Marcar divergência como resolvida.
4. Gerar PDF/HTML.
5. Exportar XLSX.
6. Registrar pagamento/repasse.

### Regra de produto

Não pode existir botão de “aprovar” se houver divergência bloqueante aberta.

---

## Tela 15 — D+14 e Repasses

**Usuários:** financeiro PluggaMob.  
**Objetivo:** controlar crédito a liberar e repasse futuro.

### Abas

1. Créditos futuros
2. Liberados hoje
3. A liberar na semana
4. Compensados
5. Pendentes
6. Por parceiro

### O que aparece

- data de venda;
- data prevista D+14;
- parceiro;
- valor;
- sessão/fechamento;
- status;
- repasse vinculado.

### Ações principais

1. Importar arquivo PagBank.
2. Marcar compensado.
3. Vincular a fechamento.
4. Exportar agenda.
5. Gerar alerta.

---

## Tela 16 — OPM / Ciclos Mensais

**Usuários:** OPM, Leciane, Fabíola, Caroline/Luciane se aplicável, DK.  
**Base Bitrix:** categoryId 7.

### Abas

1. Kanban
2. Lista
3. Aguardando fatura
4. Faturas recebidas
5. Auditoria
6. Validação
7. Enviar ao cliente
8. Enviados
9. Churn

### O que aparece

- cliente;
- UC;
- referência;
- status;
- documentos recebidos;
- responsável;
- prazo;
- relatório;
- pendência;
- data de envio.

### Ações principais

1. Criar ciclo mensal.
2. Anexar fatura.
3. Anexar NF.
4. Anexar encargos.
5. Enviar para auditoria.
6. Solicitar relatório ao agente.
7. Submeter para validação.
8. Marcar enviado ao cliente.
9. Criar pendência.

---

## Tela 17 — Detalhe do Ciclo OPM

**Usuários:** operação OPM, DK, Dilkson.  
**Tipo:** ficha de detalhe.

### Abas

1. Resumo
2. Cliente/UC
3. Documentos
4. Auditoria
5. Relatório
6. Aprovações
7. Envio
8. Pendências
9. Timeline
10. Ações do agente

### O que aparece

#### Resumo

- cliente;
- UC;
- mês referência;
- distribuidora;
- status;
- responsável;
- prazo;
- próximo passo;
- bloqueio atual.

#### Documentos

- fatura distribuidora;
- NF comercializadora;
- encargos;
- boleto;
- relatório anterior;
- anexos extras.

#### Auditoria

- total faturado;
- consumo;
- demanda;
- encargos;
- economia;
- premissas;
- divergências.

#### Relatório

- versão HTML;
- versão PDF;
- status;
- validação;
- envio.

### Ações principais

1. Validar documentos mínimos.
2. Marcar falta de encargo.
3. Aplicar premissa de encargo estimado.
4. Pedir geração de relatório ao agente.
5. Aprovar relatório.
6. Marcar como enviado.
7. Criar tarefa de correção.

### Regra de produto

Não permitir status “Relatório aprovado” se faltar:

1. fatura;
2. NF;
3. encargos real ou premissa registrada;
4. arquivo do relatório;
5. aprovador.

---

## Tela 18 — Auditorias de Fatura

**Usuários:** OPM, Plugga, DK, analistas.  
**Objetivo:** centralizar auditorias energéticas e casos.

### Abas

1. Em análise
2. Divergência encontrada
3. Cobrança correta
4. Oportunidade técnica
5. Inconclusivas
6. Base de casos

### O que aparece

- cliente;
- UC;
- mês;
- tipo de auditoria;
- conclusão;
- diferença encontrada;
- oportunidade;
- relatório;
- status.

### Ações principais

1. Criar auditoria.
2. Anexar fatura.
3. Registrar premissas.
4. Pedir análise ao agente.
5. Aprovar conclusão.
6. Gerar relatório.
7. Registrar caso na base.

---

## Tela 19 — Relatórios OPM/Auditoria

**Usuários:** OPM, gestores.  
**Objetivo:** biblioteca operacional de relatórios gerados.

### Abas

1. Rascunhos
2. Em validação
3. Aprovados
4. Enviados
5. Reprovados
6. Modelos

### O que aparece

- nome do relatório;
- cliente;
- UC;
- referência;
- versão;
- status;
- autor/agente;
- aprovador;
- data.

### Ações principais

1. Visualizar HTML.
2. Baixar PDF.
3. Comparar versões.
4. Aprovar/reprovar.
5. Marcar enviado.
6. Anexar ao ciclo.

---

## Tela 20 — Financeiro D+14 Waze/Plugga

**Usuários:** Alessandra, Danilo, financeiro, Dilkson.  
**Objetivo:** transformar alerta D+14 em painel auditável.

### Abas

1. Visão geral
2. Entradas
3. Saídas
4. Datas críticas
5. Maiores recebíveis
6. Recomendações
7. Histórico de alertas

### O que aparece

- entradas previstas;
- saídas previstas;
- saldo líquido projetado;
- pressão de caixa;
- datas críticas;
- top recebíveis;
- impacto se maior recebível atrasar;
- recomendação.

### Ações principais

1. Atualizar dados OMIE.
2. Gerar alerta.
3. Enviar para aprovação.
4. Exportar mensagem.
5. Criar cobrança.
6. Marcar recebível acompanhado.

---

## Tela 21 — Contas a Pagar / Receber

**Usuários:** financeiro.  
**Objetivo:** visão operacional conectada ao OMIE, sem substituir o OMIE no MVP.

### Abas

1. A pagar
2. A receber
3. Vencidas
4. A vencer 7 dias
5. A vencer 14 dias
6. Por empresa
7. Por cliente/fornecedor

### O que aparece

- título;
- cliente/fornecedor;
- vencimento;
- valor;
- status;
- categoria;
- origem OMIE;
- responsável;
- ação necessária.

### Ações principais

1. Abrir no OMIE.
2. Marcar para cobrança.
3. Criar pendência.
4. Vincular comprovante.
5. Gerar alerta.

### Regra de produto

No MVP, OMIE continua sendo fonte financeira oficial. Plugga/Waze OS lê, organiza e alerta.

---

## Tela 22 — Comprovantes

**Usuários:** financeiro.  
**Objetivo:** organizar fotos/PDFs de comprovantes e vincular a títulos/processos.

### Abas

1. Recebidos
2. Sem vínculo
3. Vinculados
4. Pendentes de validação
5. Rejeitados

### O que aparece

- arquivo;
- origem;
- data;
- valor detectado;
- fornecedor/cliente sugerido;
- título OMIE sugerido;
- status.

### Ações principais

1. Anexar comprovante.
2. Vincular ao OMIE/processo.
3. Solicitar OCR ao agente.
4. Aprovar vínculo.
5. Rejeitar.

---

## Tela 23 — Compras / Solicitações

**Usuários:** Kerolayne, Diane, Fabíola, financeiro, gestores.  
**Base Bitrix:** categoryId 43.

### Abas

1. Kanban
2. Lista
3. Pedido gerado
4. Estoque
5. Cotações
6. Aprovação
7. Pagamento
8. Recebimento
9. Concluídas

### O que aparece

- solicitação;
- área;
- centro de custo/obra;
- item;
- urgência;
- solicitante;
- responsável;
- valor estimado;
- prazo;
- status;
- subtarefas abertas.

### Ações principais

1. Criar solicitação.
2. Anexar orçamento.
3. Criar subtarefa.
4. Comparar cotações.
5. Enviar para aprovação.
6. Registrar pagamento.
7. Marcar recebido.
8. Concluir aquisição.

### Regra de produto

Subtarefa aberta bloqueia avanço para aprovação final.

---

## Tela 24 — Detalhe da Solicitação de Compra

**Usuários:** compras, financeiro, gestores.  
**Tipo:** ficha de detalhe.

### Abas

1. Resumo
2. Itens
3. Cotações
4. Subtarefas
5. Aprovações
6. Pagamento
7. Recebimento
8. Documentos
9. Timeline

### O que aparece

#### Resumo

- título;
- área;
- solicitante;
- responsável;
- obra/centro de custo;
- urgência;
- status;
- prazo;
- valor estimado.

#### Cotações

- fornecedor;
- valor;
- prazo;
- frete;
- condições;
- anexo;
- recomendação.

#### Aprovações

- aprovador;
- decisão;
- data;
- justificativa.

### Ações principais

1. Adicionar cotação.
2. Solicitar comparativo ao agente.
3. Aprovar/reprovar.
4. Registrar pagamento.
5. Confirmar recebimento.
6. Concluir.

---

## Tela 25 — Jobs e Automações

**Usuários:** DK, André/dev, gestores técnicos.  
**Objetivo:** substituir visão obscura de crons/scripts por produto auditável.

### Abas

1. Jobs ativos
2. Agendados
3. Últimas execuções
4. Falhas
5. Desativados
6. Eventos
7. Logs

### O que aparece

- nome do job;
- domínio;
- criticidade;
- origem antiga;
- agenda;
- último run;
- próximo run;
- status;
- erro;
- responsável;
- se envia mensagem externa.

### Ações principais

1. Ver histórico.
2. Reexecutar manualmente com permissão.
3. Pausar apenas com aprovação.
4. Ver payload.
5. Ver logs.
6. Abrir incidente.

### Regra de produto

No MVP, a tela pode começar como inventário read-only. Controlar job de verdade só depois de cutover por domínio.

---

## Tela 26 — Integrações

**Usuários:** DK, dev, gestores técnicos.  
**Objetivo:** saúde das integrações, sem expor segredo.

### Abas

1. Visão geral
2. Bitrix24
3. OMIE
4. PluggaMob/OCPP
5. PagBank
6. Telegram
7. WhatsApp
8. RapidAPI
9. Logs

### O que aparece

- serviço;
- tipo de autenticação;
- onde a credencial fica guardada;
- último sucesso;
- último erro;
- latência;
- limite/rate limit quando houver;
- status.

### Ações principais

1. Testar conexão read-only.
2. Ver logs.
3. Abrir incidente.
4. Solicitar rotação de credencial.
5. Desabilitar integração somente com aprovação.

### Regra de segurança

Nunca mostrar token, senha, webhook completo ou chave de API.

---

## Tela 27 — Ações dos Agentes IA

**Usuários:** DK, Dilkson, dev, gestores.  
**Objetivo:** tornar auditável o que OpenClaw/agentes fazem.

### Abas

1. Todas
2. Solicitadas por humano
3. Automáticas
4. Aguardando aprovação
5. Executadas
6. Bloqueadas
7. Falhas

### O que aparece

- agente;
- solicitante;
- canal;
- ação;
- entidade afetada;
- payload resumido;
- status;
- aprovação;
- data;
- resultado.

### Ações principais

1. Aprovar ação.
2. Reprovar ação.
3. Ver detalhe.
4. Reexecutar com permissão.
5. Abrir incidente.
6. Baixar log.

---

## Tela 28 — Documentos / Biblioteca

**Usuários:** todas as áreas.  
**Objetivo:** central documental do sistema.

### Abas

1. Todos
2. Faturas
3. NFs
4. Relatórios
5. Propostas
6. Contratos
7. Comprovantes
8. Templates
9. Sem vínculo

### O que aparece

- nome;
- tipo;
- cliente/processo;
- versão;
- criado por;
- aprovado por;
- data;
- status;
- origem.

### Ações principais

1. Upload.
2. Vincular a cliente/processo.
3. Baixar.
4. Comparar versões.
5. Solicitar leitura/OCR ao agente.
6. Aprovar.
7. Arquivar.

---

# 7. Fichas/detalhes importantes

## 7.1 Ficha Cliente CRM

### Campos obrigatórios

1. Nome/Razão social.
2. Tipo: lead, cliente, parceiro, associação, fornecedor.
3. Documento mascarado.
4. Responsável interno.
5. Status.
6. Origem.
7. Produtos/serviços vinculados.
8. Contatos.
9. Timeline.

### Relações

- Cliente tem muitos contatos.
- Cliente tem muitas UCs.
- Cliente tem muitos ciclos OPM.
- Cliente tem muitas oportunidades.
- Cliente pode ter títulos financeiros.
- Cliente pode ter documentos.
- Cliente pode ter processos de auditoria.

---

## 7.2 Ficha Ciclo OPM

### Campos obrigatórios

1. Cliente.
2. UC.
3. Mês referência.
4. Distribuidora.
5. Status.
6. Responsável.
7. Prazo.
8. Fatura.
9. NF.
10. Encargos ou premissa registrada.
11. Relatório.
12. Aprovação.
13. Data de envio.

### Status sugeridos

1. Aguardando fatura.
2. Fatura recebida.
3. Aguardando NF/encargos.
4. Em auditoria.
5. Relatório em geração.
6. Em validação.
7. Aprovado.
8. Enviar ao cliente.
9. Enviado.
10. Bloqueado.
11. Churn/inativo.

---

## 7.3 Ficha Fechamento PluggaMob

### Campos obrigatórios

1. Parceiro.
2. Período.
3. Janela Manaus.
4. Arquivo de sessões.
5. Arquivo PagBank.
6. Total sessões válidas.
7. kWh.
8. Bruto.
9. Taxa Plugga.
10. Repasse.
11. Crédito D+14.
12. Divergências.
13. Status.
14. Aprovação.

### Status sugeridos

1. Aguardando insumos.
2. Importado.
3. Em conciliação.
4. Divergência aberta.
5. Pronto para revisão.
6. Aprovado.
7. Exportado.
8. Pago/repassado.
9. Cancelado.

---

## 7.4 Ficha Sessão de Recarga

### Campos obrigatórios

1. ID da sessão.
2. Usuário.
3. Parceiro.
4. Local.
5. Estação/conector.
6. Início.
7. Fim.
8. Status.
9. kWh.
10. Valor.
11. TOKEN/RFID.
12. Origem financeira.
13. Flag de cupom.
14. Flag privilegiado/rede.
15. Pagamento vinculado.
16. Fechamento vinculado.

---

## 7.5 Ficha Local/Eletroposto

### Campos obrigatórios

1. Nome.
2. Parceiro.
3. Endereço.
4. Status.
5. Timezone.
6. Conectores.
7. Política de alerta.
8. Destinos autorizados.
9. Última validação real.
10. Último envio.
11. Incidentes abertos.

---

# 8. O que fica fora do MVP — V2

## 8.1 V2 clara

1. CRM comercial Plugga/Waze completo com forecasting.
2. Migração ACL completa.
3. Auditorias com protocolo/contestação completa.
4. Gestão de contratos completa.
5. Engenharia/O.S. madura com mobile de campo.
6. Atestados/CATs/acervo técnico.
7. Portal do cliente.
8. Portal do parceiro PluggaMob.
9. BI executivo avançado.
10. Marketing/Cafeína como calendário de conteúdo.
11. Motor de templates/documentos completo.
12. Associações/GD em módulo próprio.
13. Gestão de obras com cronograma físico-financeiro.
14. Estoque/almoxarifado completo.
15. Integração de assinatura digital.
16. Substituição completa do Bitrix.
17. Substituição do OMIE.
18. Plataforma OCPP própria.

## 8.2 O que não tentar no começo

1. Migrar todos os históricos do Bitrix.
2. Migrar todos os arquivos antigos.
3. Recriar todos os campos customizados Bitrix.
4. Fazer automação externa sem aprovação humana.
5. Trocar OMIE por financeiro próprio.
6. Substituir todos os crons antes de ter scheduler confiável.
7. Fazer BI antes de arrumar o dado operacional.

---

# 9. Ordem de construção das telas para ficar clicável cedo

## Fase 0 — Shell do produto

Objetivo: em poucos dias, abrir o sistema e navegar.

1. Login.
2. Layout base.
3. Menu lateral.
4. Dashboard vazio com cards mockados.
5. Central de pendências mockada.
6. Tela Integrações mockada.
7. Tela Jobs mockada.

**Resultado:** produto já parece real e navegável.

---

## Fase 1 — Read-only do que já existe

Objetivo: enxergar Bitrix/OpenClaw sem substituir.

1. Dashboard Geral com dados reais agregados.
2. Central de Pendências com tarefas Bitrix read-only.
3. CRM/Leads com deals Bitrix read-only.
4. OPM ciclos com categoryId 7 read-only.
5. Compras com categoryId 43 read-only.
6. Integrações com status read-only.
7. Jobs com inventário de crons/jobs.

**Resultado:** o sistema vira painel operacional sem risco de cutover.

---

## Fase 2 — CRM PluggaMob clicável

Objetivo: primeiro domínio transacional próprio.

1. Reativação PluggaMob.
2. Usuários EV Point.
3. Ficha do usuário.
4. Campanhas.
5. Contatos.
6. Conversões.
7. Dashboard KPIs.

**Resultado:** blueprint CRM PluggaMob deixa de ser planilha/documento e vira produto.

---

## Fase 3 — PluggaMob Ops

Objetivo: sessões, locais e ocupação.

1. Sessões de Recarga.
2. Detalhe da Sessão.
3. Locais e Conectores.
4. Detalhe do Local.
5. Ocupação ao vivo.
6. Cupons.
7. Alertas e mensagens.

**Resultado:** operação PluggaMob começa a sair dos scripts e vira interface.

---

## Fase 4 — Fechamento PluggaMob

Objetivo: dinheiro auditável.

1. Fechamentos.
2. Detalhe do Fechamento.
3. Importações.
4. Divergências.
5. D+14 e Repasses.
6. Aprovações.
7. Exportações.

**Resultado:** fechamento semanal passa a ser rastreável e auditável.

---

## Fase 5 — OPM MVP

Objetivo: substituir o núcleo do pipeline C7.

1. OPM Ciclos Mensais.
2. Detalhe Ciclo OPM.
3. Documentos do ciclo.
4. Auditorias de Fatura.
5. Relatórios.
6. Aprovações.
7. Envio ao cliente.

**Resultado:** OPM ganha workflow nativo.

---

## Fase 6 — Compras MVP

Objetivo: tirar compras da gambiarra de CRM.

1. Solicitações.
2. Detalhe da solicitação.
3. Cotações.
4. Aprovações.
5. Pagamento/provisionamento.
6. Recebimento.
7. Scorecard simples.

**Resultado:** funil 43 vira processo de compras de verdade.

---

# 10. Modelo mínimo de entidades por tela

## 10.1 Core

1. User
2. Team
3. Role
4. Permission
5. Area
6. Task
7. Workflow
8. WorkflowStage
9. Approval
10. Document
11. EventLog
12. AgentAction
13. Integration
14. JobRun

## 10.2 CRM

1. Lead
2. Customer
3. Company
4. Contact
5. Opportunity
6. Interaction
7. Campaign

## 10.3 OPM

1. EnergyConsumerUnit
2. OpmCycle
3. EnergyInvoice
4. SupplierInvoice
5. ChargeFeeDocument
6. EnergyAudit
7. OpmReport
8. ReportApproval

## 10.4 PluggaMob

1. EvUser
2. EvSession
3. Partner
4. Location
5. Station
6. Connector
7. Coupon
8. WalletMovement
9. Settlement
10. SettlementLine
11. D14Credit
12. AlertPolicy
13. AlertDispatchLog

## 10.5 Compras

1. PurchaseRequest
2. PurchaseItem
3. Quote
4. Supplier
5. PurchaseApproval
6. PurchasePayment
7. PurchaseReceipt

---

# 11. Como aproveitar o que o Bitrix faz bem

O Bitrix já provou alguns conceitos que o Plugga/Waze OS deve manter:

1. Kanban por estágio.
2. Card detalhado com timeline.
3. Responsável + prazo.
4. Observadores.
5. Arquivos anexos.
6. Comentários/histórico.
7. Tarefas vinculadas a CRM.
8. Subtarefas.
9. Automação por estágio.
10. Campos customizados.
11. Fluxos por área.
12. Documentos vinculados ao processo.

Mas o Plugga/Waze OS deve melhorar:

1. separação entre CRM e operação;
2. regra de negócio nativa;
3. entidades reais de energia/recarga/fechamento;
4. menos tarefa avulsa;
5. menos duplicidade;
6. mais auditoria;
7. logs de integração;
8. API para agentes;
9. tela por domínio;
10. validação de dados antes de envio externo.

---

# 12. Decisões de produto recomendadas

## 12.1 Decisão 1 — começar por PluggaMob

Motivo:

1. blueprint mais maduro;
2. regras claras;
3. dor operacional real;
4. dados estruturáveis;
5. impacto financeiro;
6. menos dependência do Bitrix do que OPM/compras.

## 12.2 Decisão 2 — OPM entra logo depois

Motivo:

1. pipeline C7 tem 131 deals;
2. é operação recorrente;
3. documentos e relatórios são críticos;
4. hoje há mistura entre Bitrix, agente e arquivos.

## 12.3 Decisão 3 — Compras é MVP tardio ou V1.1

Motivo:

1. funil está claro;
2. regras estão documentadas;
3. mas depende de comportamento humano e aprovação;
4. pode esperar até PluggaMob/OPM estarem clicáveis.

## 12.4 Decisão 4 — não migrar Engenharia agora

Motivo:

1. O.S. ainda está rascunho;
2. falta confirmação de campos/pipeline;
3. risco de modelar errado.

## 12.5 Decisão 5 — Jobs começam read-only

Motivo:

1. mexer em job é risco operacional;
2. inventário e observabilidade já geram valor;
3. controle/cutover vem por domínio.

---

# 13. Resumo final para desenvolvimento

O Plugga/Waze OS deve nascer com cara de sistema operacional interno, não de chatbot e não de cópia do Bitrix.

A primeira versão clicável precisa permitir navegar por:

1. Dashboard.
2. Central de pendências.
3. Clientes.
4. CRM PluggaMob.
5. Usuários EV Point.
6. Sessões.
7. Locais/conectores.
8. Fechamentos.
9. OPM ciclos.
10. Compras.
11. Jobs.
12. Integrações.
13. Ações dos agentes.

O primeiro produto real deve ser:

1. **CRM PluggaMob EV Point**;
2. **PluggaMob Ops**;
3. **Fechamento PluggaMob**;
4. **OPM Ciclos Mensais**;
5. **Compras/Suprimentos**.

A regra arquitetural principal:

> O sistema guarda estado, regra, histórico, documentos, jobs e logs. O OpenClaw conversa, analisa, redige, recomenda e orquestra — mas não é mais o banco operacional.

# Análise — estudo de eficiência energética (agente Open Cloud)

- **Data:** 2026-08-08
- **Fonte:** pasta `~/Downloads/estudo-eficiencia-energetica` (26 arquivos)
- **Objetivo:** entender o fluxo, os processos e as regras que o agente Open Cloud
  usa hoje para produzir o estudo de eficiência energética, e documentar o que é
  preciso para reproduzi-lo no sistema da Pluga.
- **Escopo:** análise e documentação. **Nenhum código foi implementado.**

> **Nota de terminologia.** Este documento usa "Open Cloud" e "Pluga" conforme
> solicitado. Registro, para evitar confusão futura, que os arquivos analisados
> grafam consistentemente **"Plugga"** (marca, com dois "g") e **"OpenClaw"**
> (nome do agente). Vale decidir a grafia canônica antes de virar código.

---

## 1. Resumo da análise dos arquivos

### 1.1 O que existe na pasta

| Grupo | Arquivos | Papel |
|---|---|---|
| Governança e persona | `SKILL.md`, `AGENTS.md`, `SOUL.md`, `README.md`, `MEMORY.md`, `state.json` | Gatilhos, permissões, canais, tom e decisões estáveis |
| Regras de conteúdo | `references/` (9 arquivos) | Entradas, estrutura, cálculo, visual, checklist, fontes, piloto, aprendizados |
| Modelo congelado | `templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html` (433 KB) | HTML aprovado que serve de base |
| Gerador determinístico | `assets/gerar_relatorio_do_modelo.py` | Clona o modelo e troca só os dados |
| Scripts por caso | `scripts/generate_*.py` (4) | Geram o HTML de casos específicos |
| Casos | `casos/INDEX.md`, `casos/serra-verde-…md` | Banco de casos comparáveis |
| Verificação | `scripts/doctor.sh` | Confere presença de arquivos e termos proibidos |

### 1.2 A história que os arquivos contam

O estudo de eficiência energética **não é uma tarefa livre de redação**. Ele
começou assim e foi endurecendo a cada erro:

1. **Piloto Serra Verde** (06/2025) fixa a estrutura do relatório e as decisões
   de layout — auditoria antes das oportunidades, BESS no fim, fórmulas fora do
   documento do cliente.
2. **05/08/2026** — depois de *"23 correções de Dilkson em uma manhã"* (título
   trocado, CSS reinventado, fundo azul, seções cortadas), a redação manual do
   HTML é **proibida**. Nasce o gerador que clona o modelo byte a byte.
3. **05/08/2026** — regra de que pedido novo é **adição**, nunca remoção: uma
   versão Solar+BESS havia sido entregue sem as seções 7 e 8.
4. **07/08/2026** — o gatilho literal **ESTUDO BESS** passa a significar sempre
   **Solar+BESS**, e é criada a *trava inquebrável de dupla consulta*: consultar
   modelo + skill antes de gerar, reconsultar depois, bloquear o envio se não
   fechar.

**Leitura:** o valor central desta skill não está na geração do texto — está nas
**travas**. O que o sistema da Pluga precisa reproduzir é sobretudo a disciplina:
premissas fixas, estrutura obrigatória, validação antes de entregar, bloqueio
quando algo não bate.

### 1.3 Premissas fixas encontradas (documentadas)

| Premissa | Valor | Onde está |
|---|---|---|
| Equipamento BESS padrão | Huawei LUNA2000-241-2S1 | `metodologia-calculos.md`, `state.json` |
| Energia por unidade BESS | 241 kWh | idem |
| Potência por unidade BESS | 108 kW | idem |
| Eficiência máxima de ciclo | 91,3% | `metodologia-calculos.md` |
| CAPEX BESS | R$ 550.000,00 por unidade | `metodologia-calculos.md`, PRD |
| CAPEX FV | R$ 2.500,00 por kWp | PRD, `checklist-qualidade.md` |
| Horizonte financeiro | 20 anos | todos |
| TMA | 5% a.a. | todos |
| Reajuste tarifário | 4% a.a. | todos |
| Tolerância de ultrapassagem | 5% acima da contratada | `metodologia-calculos.md` |
| Faixas de reativo | <2% registrar · 2–4% atenção · >4% investigar | `metodologia-calculos.md` |

### 1.4 Divergências e lacunas encontradas

Estes pontos **não são opinião** — são diferenças entre o que os arquivos
documentam e o que os scripts fazem. Cada um vira pergunta na seção 4.

**a) Existem dois "modelos padrão" ao mesmo tempo.**
O `SKILL.md` diz que o relatório sempre parte de
`templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html`. A trava de
07/08 diz que o padrão é o **Jardim Floresta**
(`…jardim-floresta-uc-01374052-2026-06/…solar_bess_padrao.html`, SHA256
`0640a0ab…`), que **não está nesta pasta**. Os quatro scripts leem o Jardim
Floresta; o gerador oficial lê o Serra Verde.

**b) O gerador oficial quebra no caminho de sucesso.**
`assets/gerar_relatorio_do_modelo.py`, linha 156, chama `conta(saida)` — função
que não existe no arquivo. O erro só acontece **depois** de todas as travas
passarem, ou seja, exatamente quando o relatório está correto. Isso explica por
que os casos recentes usam scripts próprios em vez do gerador.

**c) O dimensionamento FV não está documentado em lugar nenhum.**
A metodologia diz apenas "usar premissa Plugga registrada no caso". Na prática:

- `generate_santa_tereza…py`: `fv_kwp = teto(consumo_total × 0,60 ÷ 130)`
- `generate_porto_velho…py`: `fv_kwp = 125` (valor fixo, com comentário
  "premissa interna, precisa validar área e irradiação")

A produtividade de **130 kWh/kWp·mês** aparece só no código, nunca nas
referências. São duas regras diferentes para a mesma coisa.

**d) A eficiência de ciclo de 91,3% é documentada mas não usada.**
A economia do BESS é calculada como `consumo_ponta × spread`, sem aplicar perda
de ciclo, sem limitar pelos dias úteis do mês e sem descontar o custo da energia
usada para carregar fora ponta.

**e) O payback ignora o reajuste que o fluxo de caixa aplica.**
`payback = CAPEX ÷ economia_ano_1`, enquanto o fluxo de caixa usa
`economia_ano_1 × 1,04^(ano−1)`. São premissas incoerentes entre si.

**f) A demanda ideal é obrigatória na documentação e não existe no código.**
`SKILL.md`, `estrutura-relatorio.md`, `MEMORY.md` e `checklist-qualidade.md`
exigem demanda ideal na seção 3 — e o gráfico de prova quando houver 12 meses.
**Nenhum dos quatro scripts calcula demanda ideal.** No Santa Tereza, a seção 3
traz o dimensionamento do BESS no lugar. Os números do piloto (1.095 kW, redução
de 103 kW / 8,60%, R$ 1.368,87/mês, R$ 16.426,44/ano) estão fixos no texto das
referências, como exemplo do Serra Verde.

**g) Payback descontado consta nos KPIs mas não é calculado.**
Aparece na estrutura, no checklist e no caso Serra Verde (8,4 anos). O script
Santa Tereza calcula VPL e TIR, não o payback descontado.

**h) A validação está codificada por caso, não por regra.**
`generate_santa_tereza…py` valida contra literais do próprio caso
(`'R$ 4.515.000,00'`, `'R$ 111.292,41'`). Isso não é reaproveitável.

---

## 2. Mapeamento do fluxo de auditoria

### 2.1 Visão geral

```
Gatilho  →  Coleta  →  Extração  →  Auditoria  →  Demanda  →  Oportunidades
   →  Cenários  →  Cálculo financeiro  →  Geração  →  Dupla consulta
   →  Validação  →  Aprovação  →  Entrega
```

### 2.2 Etapa 1 — Gatilho

Aciona o estudo de eficiência energética quando o pedido menciona: estudo de
eficiência energética; auditoria energética completa; fatura Grupo A/cativa;
demanda ideal; reativo; benefício fiscal; BESS, Solar+BESS, peak shaving;
Mercado Livre; pré-viabilidade com CAPEX, payback, VPL, TIR.

**Gatilho literal `ESTUDO BESS`** → interpretar obrigatoriamente como *estudo de
eficiência energética Solar+BESS — modelo Jardim Floresta*. BESS isolado nunca é
o cenário principal; entra só como subdimensionamento técnico da bateria.

### 2.3 Etapa 2 — Coleta

**Entradas mínimas** (sem elas o estudo não começa): fatura completa da
distribuidora; cliente/razão social; UC; referência/mês; distribuidora/UF;
grupo, subgrupo e modalidade; consumo ponta e fora ponta; demanda contratada e
registrada; reativo, bandeira, encargos, multas, benefício fiscal.

**Entradas para estudo completo** (sem elas o resultado é preliminar): 12
faturas; memória de massa de 15 minutos; tarifa homologada/REH do mês; base
tributária e benefício fiscal aplicável; preço de mesa do Mercado Livre; área e
condição para FV; cotação de BESS, EPC, projeto e O&M.

**Regra de verdade externa:** fonte não consultada vira "validar" ou "pendente"
no relatório. Não se inventa tarifa, tributo, benefício ou regra regulatória.

### 2.4 Etapa 3 — Extração da fatura

Campos extraídos, conforme `template-dados.json` e os scripts:

| Campo | Uso |
|---|---|
| `valor_total_fatura` | Resumo, custo médio total, comparativo de cenários |
| `consumo_ponta_kwh` / `consumo_fora_ponta_kwh` | Custo médio, dimensionamento, economia |
| `tarifa_ponta` / `tarifa_fora_ponta` | Spread e economia do BESS |
| `valor_ponta` / `valor_fora_ponta` | Custo unitário efetivo por posto |
| `demanda_contratada_kw` | Utilização, tolerância, ultrapassagem |
| `demanda_registrada_ponta_kw` | **Limitador de potência do BESS e ranking de oportunidade** |
| `demanda_registrada_fora_ponta_kw` | Leitura da fatura |
| `valor_demanda` | Composição e custo médio efetivo |
| `valor_reativo_ponta` / `_fora_ponta` | Diagnóstico de reativo |
| `valor_beneficio_fiscal` | Composição e diagnóstico |
| `valor_multas_juros_encargos` | Diagnóstico de rotina financeira |
| `bandeira` | Composição |

### 2.5 Etapa 4 — Auditoria da fatura

```
custo_kwh_ponta        = valor_ponta ÷ consumo_ponta
custo_kwh_fora_ponta   = valor_fora_ponta ÷ consumo_fora_ponta
custo_medio_total      = valor_total_fatura ÷ consumo_total
custo_medio_efetivo    = (valor_ponta + valor_fora_ponta + valor_demanda) ÷ consumo_total
spread                 = tarifa_ponta − tarifa_fora_ponta
```

Diagnóstico de reativo pela faixa (<2% / 2–4% / >4% do valor da fatura).
Termo proibido para o cliente: **"all-in"** — usar "custo médio total da fatura".

### 2.6 Etapa 5 — Demanda

```
utilizacao   = maior_demanda_registrada ÷ demanda_contratada
tolerancia   = demanda_contratada × 1,05
ultrapassagem = demanda_registrada > tolerancia
```

**Demanda ideal:** exige histórico, preferencialmente 12 faturas + memória de
massa. Com histórico, calcular pelo pico observado com tolerância de 5% e
apresentar gráfico com quatro séries — demanda registrada mês a mês, contratada
atual, ideal proposta e limite sem ultrapassagem (ideal × 1,05), destacando os
meses acima do limite. Sem histórico, apresentar só como prévia, com ressalva.

> ⚠️ Esta etapa está **documentada mas não implementada** nos scripts (ver 1.4-f).

### 2.7 Etapa 6 — Dimensionamento

```
BESS por energia   = teto( (consumo_ponta ÷ 30) ÷ 241 )
BESS por potência  = teto( demanda_registrada_ponta ÷ 108 )
unidades_BESS      = máximo(energia, potência)

FV (kWp)           = teto( consumo_total × 0,60 ÷ 130 )     ← só no código
geracao_FV_mensal  = fv_kwp × 130 kWh/kWp·mês               ← só no código
```

### 2.8 Etapa 7 — Cenários e economia

Cenários obrigatórios: **sem investimento**, **Solar+BESS** (principal),
**subdimensionamento BESS**, **subdimensionamento FV**. Mercado Livre aparece na
estrutura documentada como cenário adicional.

```
economia_BESS_mes  = consumo_ponta × spread
economia_FV_mes    = mínimo(geracao_FV, consumo_fora_ponta) × tarifa_fora_ponta
economia_mes       = economia_BESS_mes + economia_FV_mes
economia_ano_1     = economia_mes × 12
fatura_projetada   = valor_total_fatura − economia_mes
```

### 2.9 Etapa 8 — Financeiro

```
CAPEX_BESS        = unidades_BESS × R$ 550.000,00
CAPEX_FV          = fv_kwp × R$ 2.500,00
CAPEX_Solar+BESS  = CAPEX_FV + CAPEX_BESS          ← regra dura, nunca só o FV

fluxo_ano[a]      = economia_ano_1 × 1,04^(a−1)     para a = 1..20
economia_acumulada[a] = soma de fluxo_ano até a
fluxo_caixa[0]    = −CAPEX_Solar+BESS
fluxo_caixa[a]    = fluxo_caixa[a−1] + fluxo_ano[a]

payback           = CAPEX_Solar+BESS ÷ economia_ano_1
VPL               = −CAPEX + Σ fluxo_ano[a] ÷ 1,05^a
TIR               = taxa que zera o VPL (bisseção em [−0,95; 1,5], 120 iterações)
```

Indicadores previstos na documentação: CAPEX, economia Ano 1, economia
acumulada, payback, **payback descontado**, VPL com TMA, TIR.

### 2.10 Etapa 9 — Geração do documento

Estrutura obrigatória — **10 títulos, nenhum pode sumir**:

| # | Título |
|---|---|
| — | Relatório de Auditoria Energética *(capa/hero)* |
| 1 | Resumo executivo da fatura |
| 2 | Identificação da unidade consumidora |
| 3 | Análise de demanda |
| 4 | Consumo, custo médio efetivo e tarifa aplicada |
| 5 | Composição da fatura, reativo e benefício fiscal |
| 6 | Diagnóstico e recomendações da auditoria |
| 7 | Oportunidades |
| — | Análise de eficiência energética *(card verde)* |
| 8 | Próximos passos |
| — | Rodapé Plugga |

Regras visuais: sem gráfico na seção de demanda; gráficos pequenos lado a lado
na composição; gráficos grandes só para economia anual, economia acumulada e
fluxo de caixa, sempre com tabela ano a ano abaixo; próximos passos em timeline;
análise técnica antes dos próximos passos; corpo claro com texto escuro, verde
escuro só no hero e no card de análise.

Nomenclatura de saída documentada:
`reports/estudo-eficiencia-energetica-<cliente>-uc-<uc>-<ref>.html`

### 2.11 Etapa 10 — Dupla consulta (trava inquebrável)

1. **Antes de gerar:** abrir o modelo padrão e o repositório da skill.
2. **Gerar sempre como Solar+BESS.**
3. **Depois de gerar e antes de enviar:** reabrir os dois e comparar título,
   CSS, seções, rodapé, hierarquia, cards e gráficos.
4. **Validar cálculo:** CAPEX Solar+BESS soma FV + BESS; BESS não aparece como
   cenário principal isolado; ranking usa demanda medida ponta; valores não
   abreviados.
5. **Validar gráficos:** economia anual/acumulada, fluxo de caixa acumulado,
   tabelas ano a ano, eixos legíveis.
6. **Se não fechar, bloquear o envio.** Não existe HTML "quase certo".

Nos scripts isso aparece como `consult_sources('ANTES')` e
`consult_sources('DEPOIS')`, registrando tamanho e SHA-256 de cada fonte e
alertando se algo mudou durante a geração.

### 2.12 Etapa 11 — Validação de qualidade

Bloqueios automáticos hoje: todos os títulos obrigatórios presentes; termos
proibidos ausentes (`debug`, `teste`, `rascunho`, `corrigido`, `final`,
`all-in`, "conforme Dilkson"); termos obrigatórios presentes (`Solar+BESS`,
`CAPEX Solar+BESS`, os dois gráficos nomeados).

O gerador oficial acrescenta: CSS idêntico ao modelo; nenhum resíduo do
caso-fonte (lista de 30 marcadores); nenhuma seção removida ou esvaziada.

### 2.13 Etapa 12 — Aprovação e entrega

Pode gerar internamente sem aprovação: HTML, PDF, análise técnica,
pré-viabilidade. **Exige aprovação antes de:** enviar ao cliente; publicar em
grupo externo; fazer commit/push; transformar pré-viabilidade em proposta
comercial; assumir tarifa ou tributo sem fonte.

Entrega padrão: HTML. PDF só quando pedido junto.

---

## 3. Definição de departamento e subdepartamento

### 3.1 Classificação

| Nível | Valor |
|---|---|
| Empresa | **Pluga** |
| Departamento (macro) | **Energia** |
| Processo (micro) | **Eficiência energética** |
| Registro | **Estudos** |

### 3.2 Encaixe na arquitetura já definida

A arquitetura do sistema é `Empresa → Departamento → Processo → Tarefa`. O
departamento **Energia** existe apenas na Pluga — a Waze tem Engenharia, e o
equivalente operacional dela não é estudo de energia. Portanto **o estudo de
eficiência energética não aparece no contexto Waze**.

Em `apps/web/app/lib/organizacao.ts`, o processo **"Eficiência energética"** já
está declarado dentro do departamento Energia da Pluga, hoje com status
`em-breve`. A classificação pedida cai exatamente onde a estrutura já previa —
não é preciso criar departamento nem processo novo.

### 3.3 Um ponto estrutural a decidir

"Estudos" foi pedido como um nível abaixo de eficiência energética, mas na
arquitetura o **processo é a folha** e abaixo dele vêm tarefas. Duas leituras:

- **Estudos = os registros do processo.** Cada estudo é uma instância de
  "Eficiência energética", com suas etapas e prazos. É a leitura coerente com o
  modelo atual e com o que a Caroline descreveu para os outros processos.
- **Estudos = um subnível de navegação.** Exigiria um quarto nível na
  hierarquia, que hoje não existe.

Recomendo a primeira. Ela também é a que permite reaproveitar SLA, KPI e fila de
pendências sem inventar estrutura nova.

### 3.4 O que reproduzir no sistema

Etapas necessárias para reproduzir o estudo — em ordem, sem código:

1. **Cadastro da UC** com os campos da seção 2.4, ligado ao cliente.
2. **Upload da fatura** e extração dos campos (manual no início; automática
   depois).
3. **Registro de premissas versionadas** — BESS, CAPEX, TMA, reajuste,
   produtividade FV — com data de vigência, para um estudo antigo continuar
   explicável.
4. **Cálculo de auditoria** (2.5) e **de demanda** (2.6).
5. **Dimensionamento** (2.7) e **cenários** (2.8).
6. **Financeiro** (2.9) com os sete indicadores.
7. **Geração do documento** na estrutura de 10 títulos (2.10).
8. **Validação bloqueante** (2.12) antes de permitir envio.
9. **Aprovação humana** registrada antes da entrega ao cliente (2.13).
10. **Arquivamento como caso comparável** com os campos de `casos/INDEX.md`.

Os passos 8 e 9 são o coração: hoje eles dependem de o agente lembrar de fazer
a dupla consulta. No sistema, viram estado — um estudo não sai de "em validação"
sem os itens marcados.

---

## 4. Perguntas para o agente Open Cloud

### A. Modelo e template

1. Qual é o modelo padrão vigente: o Serra Verde congelado em `templates/` ou o
   Jardim Floresta citado na trava de 07/08/2026?
2. Pode enviar o arquivo do modelo Jardim Floresta
   (`…_solar_bess_padrao.html`, SHA256 `0640a0ab…`)? Ele não veio na pasta.
3. O gerador `gerar_relatorio_do_modelo.py` ainda é usado, ou foi substituído
   pelos scripts por caso? (A linha 156 chama `conta()`, que não existe — ele
   falha justamente quando dá certo.)
4. Os quatro `generate_*.py` são descartáveis por caso ou deveriam convergir
   para um gerador único?

### B. Cálculo — BESS

5. A economia do BESS é `consumo_ponta × spread`, sobre o mês inteiro. Deve
   considerar apenas dias úteis, já que a ponta normalmente não incide no fim de
   semana?
6. A eficiência de ciclo de 91,3% está documentada mas não entra na conta. Deve
   entrar? Como?
7. O custo da energia usada para carregar a bateria fora ponta deve ser
   descontado da economia?
8. Em `BESS por energia`, o divisor 30 são dias corridos. É proposital?
9. Usa-se a capacidade nominal de 241 kWh ou uma profundidade de descarga útil
   menor?
10. Há limite de unidades por local (área, conexão, proteção)?

### C. Cálculo — FV / Solar

11. Qual é a regra oficial de dimensionamento FV? O Santa Tereza usa 60% do
    consumo total; o Porto Velho fixa 125 kWp.
12. De onde vem a produtividade de 130 kWh/kWp·mês? Vale para todo Roraima ou
    varia por localidade?
13. Por que a economia FV usa só a tarifa fora ponta? A geração não abate também
    consumo em ponta?
14. Deve haver limite de FV por área disponível ou por demanda contratada?
15. Compensação/injeção na rede entra no cálculo ou é ignorada por ora?

### D. Cálculo — financeiro

16. O payback usa a economia do Ano 1 sem reajuste, mas o fluxo de caixa aplica
    4% a.a. Deve usar o fluxo reajustado?
17. Como se calcula o **payback descontado**? Ele aparece nos KPIs e no caso
    Serra Verde (8,4 anos), mas não está em nenhum script.
18. O fluxo de caixa deve incluir O&M, degradação da bateria, seguro ou troca de
    inversor? Hoje não inclui nada disso.
19. O CAPEX de R$ 550.000,00 por BESS e R$ 2.500,00 por kWp inclui projeto,
    instalação e EPC, ou só equipamento?
20. Há vida útil/substituição de bateria dentro dos 20 anos?
21. Impostos sobre o investimento entram na pré-viabilidade?

### E. Demanda ideal

22. Como se calcula a demanda ideal? A documentação exige, mas nenhum script
    implementa.
23. Os números do piloto Serra Verde (1.095 kW, −103 kW, R$ 1.368,87/mês) foram
    calculados como? Pode enviar a memória de cálculo?
24. Qual a regra da skill `estudo-demanda-plugga` que deve ser reaproveitada?
    Ela não veio na pasta.
25. Com menos de 12 faturas, qual o mínimo aceitável para sair de "preliminar"?

### F. Dados de entrada e fontes

26. Como a fatura é lida hoje — PDF, digitação manual, API da distribuidora?
27. Existe layout de fatura por distribuidora, ou só Roraima Energia por
    enquanto?
28. De onde vem a tarifa homologada/REH? É consultada ou digitada?
29. Como se obtém o preço de mesa do Mercado Livre? O cenário aparece na
    estrutura mas não nos scripts.
30. O benefício fiscal (25% no Serra Verde) vem da fatura ou é calculado?

### G. Saída, versionamento e histórico

31. Onde ficam os HTML gerados hoje, e existe controle de versão? (Vi
    `V02-R00` no nome de um arquivo.)
32. Quando um estudo é refeito com dados novos, vira versão do mesmo estudo ou
    estudo novo?
33. O PDF é gerado como? Qual ferramenta?
34. O banco de casos comparáveis (`casos/`) é alimentado manualmente?
35. Existe estudo já entregue que sirva de teste de regressão — entrada conhecida
    e saída aprovada — para conferirmos que o sistema reproduz o mesmo resultado?

### H. Governança e processo

36. Quem aprova o envio ao cliente hoje, e como esse aceite fica registrado?
37. A dupla consulta é conferida por alguém ou é confiada ao agente?
38. Quando o estudo estiver no sistema da Pluga, o agente Open Cloud continua
    gerando, ou passa a só alimentar dados?
39. Há SLA para entregar um estudo depois que a fatura chega?
40. Quais indicadores devem medir a saúde deste processo? (Cada processo leva
    três KPIs no padrão que a área de processos definiu.)

---

## Estado deste documento

Análise e documentação apenas, conforme pedido. Nenhuma linha de código foi
escrita. As respostas às perguntas da seção 4 — em especial **B, C, D e E**, que
tratam de cálculo — são pré-requisito para implementar, porque hoje a regra real
mora no código dos scripts, não nas referências, e em vários pontos os dois
discordam.

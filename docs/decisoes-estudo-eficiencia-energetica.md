# Decisões — estudo de eficiência energética no sistema da Pluga

- **Data:** 2026-08-08
- **Entrada:** respostas do agente Open Cloud às 40 perguntas de
  [`analise-estudo-eficiencia-energetica.md`](analise-estudo-eficiencia-energetica.md)
- **Escopo:** consolidação das decisões. **Nenhum código implementado.**

Este documento registra o que as respostas resolveram, o que continua bloqueando
e o que muda de número por causa das correções de cálculo.

---

## 1. As oito divergências, resolvidas

| # | Divergência levantada na análise | Decisão |
|---|---|---|
| a | Dois modelos padrão convivendo | **Jardim Floresta Solar+BESS** é o vigente. Serra Verde vira referência histórica |
| b | Gerador oficial quebra no caminho de sucesso | Não copiar. Preservar o **conceito** (modelo congelado + substituição + travas) e reescrever no sistema |
| c | Dimensionamento FV não documentado | `fv_kWp = teto(consumo_total × %atendimento ÷ produtividade)`, com **60%** e **130 kWh/kWp·mês** como defaults **editáveis e versionados** |
| d | Eficiência de ciclo documentada e não usada | **Deve entrar.** No MVP pode ficar fora, mas o estudo precisa dizer isso explicitamente |
| e | Payback ignora o reajuste que o fluxo aplica | Calcular **os dois** e não misturar nomes: payback simples ≠ payback projetado |
| f | Demanda ideal obrigatória e não implementada | Regra definida: pico observado, tolerância de 5%, três cenários |
| g | Payback descontado nos KPIs e não calculado | Fórmula definida, com interpolação entre anos |
| h | Validação codificada por caso | Vira checklist bloqueante por regra, não por literal |

---

## 2. O que muda nos números

A correção mais relevante é a da economia do BESS. Hoje os scripts usam o
spread cheio; a resposta define que se deve descontar o custo de carregar a
bateria, ajustado pela eficiência de ciclo:

```
hoje      economia_BESS = consumo_ponta × (tarifa_ponta − tarifa_fora_ponta)
decidido  economia_BESS = consumo_ponta × tarifa_ponta
                        − (consumo_ponta ÷ 0,913) × tarifa_fora_ponta
```

Aplicando ao caso Santa Tereza (17.419 kWh ponta, tarifas 2,689175 e 0,625962):

| | Economia BESS/mês | Ano 1 | Payback Solar+BESS |
|---|---|---|---|
| Fórmula atual | R$ 35.939,11 | — | 3,38 anos |
| Fórmula decidida | R$ 34.900,10 | — | 3,41 anos |
| **Diferença** | **−R$ 1.039,01 (2,89%)** | **−R$ 12.468,12** | +0,03 ano |

**Por que isso importa:** o efeito é pequeno no payback e relevante no valor
absoluto — R$ 12,4 mil no primeiro ano, crescendo 4% a.a. por 20 anos. Como
esses números vão para o cliente, o sistema precisa nascer com a fórmula
decidida, e não herdar a atual "porque é o que os scripts fazem".

⚠️ **Estudos já entregues usaram a fórmula antiga.** Vale decidir se algum
precisa ser revisado ou se ficam como estão, marcados pela premissa da época —
razão a mais para premissas versionadas por data de vigência.

---

## 3. Regras de cálculo consolidadas

### 3.1 Modo de cálculo

Todo estudo carrega um modo, que muda o que pode ser afirmado:

```
calculationMode = preliminar | memoria_massa
```

- **preliminar** — base 30 dias corridos, sem perdas de ciclo detalhadas, sem
  O&M, degradação, seguro ou reposição. O documento **precisa dizer isso**.
- **memoria_massa** — energia deslocável real por curva de 15 minutos e
  calendário tarifário local.

### 3.2 BESS

```
BESS por energia   = teto( (consumo_ponta ÷ base_dias) ÷ capacidade_util )
BESS por potência  = teto( demanda_medida_ponta ÷ potencia_unitaria )
unidades           = máximo(energia, potência)

economia_BESS_mes  = consumo_ponta × tarifa_ponta
                   − (consumo_ponta ÷ eficiencia_ciclo) × tarifa_fora_ponta
```

Separar capacidade **nominal** (241 kWh) de **útil** (configurável). Enquanto a
útil não for validada por datasheet/projeto, usar a nominal e marcar
"pré-dimensionamento com capacidade nominal".

`base_dias = 30_corridos | dias_ponta | memoria_massa`.

O número de unidades é **sugestão**, não conclusão: depende de área, ventilação,
conexão, proteção e transformador. Daí `siteFeasibilityStatus = nao_avaliada |
preliminar | validada | inviavel`.

### 3.3 FV

```
fv_kWp             = teto( consumo_total × percentual_atendimento ÷ produtividade )
geracao_mensal     = fv_kWp × produtividade
economia_FV_mes    = mínimo(geracao_mensal, consumo_fora_ponta) × tarifa_fora_ponta
```

Defaults: `percentual_atendimento = 60%`, `produtividade = 130 kWh/kWp·mês`.
Os dois são **premissa Pluga preliminar**, não verdade regulatória — exigem
campo de origem (`premissa_plugga | pvgis | cresesb | projeto | manual`) e
localidade.

Abater só a tarifa fora ponta é aproximação conservadora válida **sem** memória
de massa. Com memória, alocar pela curva horária real.

Compensação/injeção na rede **não entra** por ora: foco em autoconsumo,
excedente vira ponto de estudo posterior.

### 3.4 Financeiro

```
CAPEX_BESS         = unidades × capex_unitario_bess
CAPEX_FV           = fv_kWp × capex_por_kwp
CAPEX_Solar+BESS   = CAPEX_FV + CAPEX_BESS

fluxo_ano[a]       = economia_ano_1 × (1 + reajuste)^(a−1)
payback_simples    = CAPEX ÷ economia_ano_1
fluxo_desc[a]      = fluxo_ano[a] ÷ (1 + TMA)^a
acum_desc[a]       = −CAPEX + Σ fluxo_desc até a
payback_descontado = primeiro a com acum_desc[a] ≥ 0, interpolado:
                     a−1 + |acum_desc[a−1]| ÷ fluxo_desc[a]
                     (se não zerar em 20 anos: "não recupera no horizonte")
VPL                = acum_desc[20]
TIR                = taxa que zera o VPL
```

CAPEX de R$ 550.000/BESS e R$ 2.500/kWp são **estimativa preliminar**, não
orçamento fechado. O modelo de dados deve separar equipamento, projeto, EPC,
instalação, O&M e outros — mesmo que no MVP só o total seja preenchido.

O&M, degradação, seguro e reposição de bateria/inversor ficam **fora do MVP**,
com a ressalva escrita no documento. Impostos sobre o investimento idem.

### 3.5 Demanda ideal

```
limite_sem_multa = demanda_proposta × 1,05
```

A demanda proposta recomendada tem limite sem multa **igual ou acima do pico
observado**, salvo decisão consciente de risco. Três cenários: conservador,
intermediário e arrojado.

Maturidade da análise por volume de histórico:

| Faturas | Classificação |
|---|---|
| 1 | Diagnóstico preliminar |
| 3–6 | Tendência inicial, ainda preliminar |
| 6–11 | Intermediária, com ressalva |
| 12+ ou memória de massa | Robusta |

Os números do piloto Serra Verde (1.095 kW, −103 kW / 8,60%, R$ 1.368,87/mês)
**não devem ser codificados**. Entram só como caso histórico — a memória de
cálculo deles não está formalizada e não pôde ser verificada.

---

## 4. O processo no sistema

### 4.1 Classificação

```
Empresa: Pluga → Departamento: Energia → Processo: Eficiência energética
→ Registro: Estudo
```

Confirma o que a análise propôs, incluindo estudo como **instância do processo**
e não como quarto nível de navegação.

### 4.2 Estados

```
rascunho → aguardando_dados → dados_recebidos → em_extracao → em_auditoria
→ em_calculo → relatorio_gerado → em_validacao → aprovado_internamente
→ enviado_cliente → arquivado
                                   ↘ bloqueado ↙        ↘ cancelado
```

### 4.3 Bloqueios que impedem avançar

Fatura ausente · UC/cliente ausente · campos mínimos incompletos · premissa sem
fonte · cálculo não executado · seção obrigatória ausente · termo proibido no
documento · CAPEX Solar+BESS inconsistente · aprovação humana ausente.

**Esta é a parte que mais importa.** Hoje as travas dependem de o agente lembrar
de executá-las; no sistema viram estado. Um estudo não sai de `em_validacao` sem
os itens marcados, e não vira `enviado_cliente` sem aprovação registrada.

### 4.4 Papel do agente depois da migração

O agente deixa de ser gerador solto e passa a extrator de dados, assistente de
preenchimento, revisor de inconsistências e auditor de checklist. **A fonte de
verdade passa a ser o sistema.**

### 4.5 SLA proposto

Triagem dos dados: 1 dia útil · estudo preliminar: 2 dias úteis · estudo
completo: 3 a 5 dias úteis · revisão interna: 1 dia útil. **O SLA só conta a
partir de dados mínimos completos** — caso contrário o relógio pune o time por
atraso do cliente.

### 4.6 Os três KPIs

1. Tempo médio de entrega após dados completos.
2. Taxa de estudos bloqueados por falta de dados ou premissas.
3. Taxa de retrabalho após validação interna.

---

## 5. O que ainda bloqueia

| Item | Situação | Impacto |
|---|---|---|
| **Modelo Jardim Floresta (HTML)** | Confirmado como padrão, **arquivo não entregue**. Só vieram os scripts que o leem | Sem ele não há template para gerar nem teste de regressão |
| **Skill `estudo-demanda-plugga`** | Citada como fonte da regra de demanda ideal, **não entregue** | A regra de três cenários e a "alteração simples entre 5% e 20%" não podem ser implementadas fielmente |
| **Memória de cálculo do Serra Verde** | Declarada como não formalizada | Aceito: vira caso histórico, não regra |
| **Preço de mesa do Mercado Livre** | Sem fonte automática | O cenário Mercado Livre aparece como "a simular", não como economia fechada — mas a estrutura do relatório exige a seção |
| **Escopo do CAPEX** | "Preliminar estimado" até a Pluga confirmar se inclui projeto/EPC | Muda a leitura do payback pelo cliente |

Os dois primeiros são **pré-requisito para começar**. Os demais podem conviver
com marcação de pendência dentro do estudo.

---

## 6. Uma observação sobre terminologia

A resposta à pergunta 19 descreve o CAPEX como *"preliminar all-in estimado"*.
O termo **"all-in" é proibido** no documento do cliente — está na persona, no
checklist e no `doctor.sh` da própria skill. Internamente não há problema; o
registro aqui serve para lembrar que o validador do sistema precisa pegar isso,
porque o termo escapa com facilidade até de quem escreveu a regra.

Vale também fixar a grafia canônica antes de virar código: os arquivos usam
**Plugga** e **OpenClaw**; as respostas usam **PlugOS**; o repositório usa
**Plugga OS**.

---

## 7. Ordem sugerida de implementação

1. Cadastro do estudo e da UC, ligados ao cliente.
2. Ficha estruturada da fatura (digitação com validação; OCR depois).
3. **Premissas versionadas por data de vigência** — antes do cálculo, senão
   estudos antigos ficam inexplicáveis.
4. Motor de cálculo técnico e financeiro, com `calculationMode` explícito.
5. Geração do documento a partir do template Jardim Floresta versionado.
6. Validação bloqueante por regra.
7. Aprovação registrada e envio.
8. Arquivamento como caso comparável.

Os passos 1 a 4 não dependem do modelo HTML e podem começar assim que a
estrutura de departamento/processo existir. Os passos 5 e 6 dependem do arquivo
Jardim Floresta.

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

**Estudos já entregues usaram a fórmula antiga.** Decidido em 2026-08-08: eles
não são revisados automaticamente (ver §4.7).

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

Regras da skill `estudo-demanda-plugga` (modelo V16, congelado em 2026-05-18):

```
limite_sem_multa = demanda_proposta × 1,05
economia_mes     = (demanda_contratada − demanda_proposta) × tarifa_demanda
economia_ano     = economia_mes × 12
```

- **A tolerância de 5% vale só para cima.** Acima da contratada até ×1,05 não há
  multa; acima disso, penalidade por ultrapassagem.
- **Para baixo não há multa.** Demanda usada abaixo da contratada é **demanda
  ociosa** — dinheiro deixado na mesa. Apresentar como ociosidade, **nunca como
  multa**.
- **Faixa de enquadramento:** alteração entre **5% e 20%** sobre a contratada é
  estudo de demanda simples. Fora dessa faixa (`<5%` ou `>20%`) não é solicitação
  simples — vira **orçamento de conexão** (adequação de subestação), citando REN
  ANEEL 1.000/2021, Art. 154 (ampliação), Art. 155 (redução, limite de uma por
  12 meses) e Arts. 311–314 (testes).
- **Três cenários obrigatórios:** conservador, intermediário e arrojado. Cada um
  com demanda proposta, limite sem multa, meses acima do contrato, meses com
  multa, economia mensal e anual, e risco.
- **Recomendação** = cenário cujo limite sem multa fique **igual ou acima do pico
  observado**, maximizando economia. Pico instável ou sazonal → recomendar o
  intermediário e registrar a ressalva.
- **Histórico:** idealmente 12 a 16 meses. Na modalidade Verde a demanda é
  global; na Azul há ponta e fora ponta — não misturar.

Dentro do estudo de eficiência energética isso entra **só como resumo na seção
de demanda**. O Estudo de Demanda completo é outro entregável, com modelo
próprio (V16, retrato A4, timbrado, assinaturas e CTA).

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

## 4.7 Recálculo de estudos já entregues

Decidido: **não revisar automaticamente**. Estudos entregues ficam como estão,
marcados pela premissa vigente na época — o que só funciona porque as premissas
são versionadas por data de vigência.

Recalcular apenas quando o estudo:

- for reenviado ao cliente;
- virar proposta comercial;
- for usado como base de decisão de investimento;
- for pedido em revisão explicitamente.

A fórmula corrigida do BESS entra como **nova versão de premissa**, não como
correção retroativa.

## 4.8 Escopo do CAPEX

Decidido: **premissa preliminar estimada**, não orçamento fechado. Até
confirmação formal, cadastrar assim:

| Item | Valor | Escopo |
|---|---|---|
| BESS | R$ 550.000,00 / unidade | a validar |
| FV | R$ 2.500,00 / kWp | a validar |

Leitura obrigatória para o cliente: pré-viabilidade sujeita a validação de
projeto, instalação, EPC, adequações elétricas, O&M e cotação real. O documento
não pode dar a entender que o número é orçamento.

---

## 5. O modelo Jardim Floresta — recebido e conferido

Arquivo recebido em 2026-08-08 e arquivado em
`docs/fontes/estudo-eficiencia-energetica/modelo-jardim-floresta-solar-bess-v1.html`.

**SHA256 confere com a trava:** `0640a0ab0fa848973cb4d89a682c0a54dbebe96f08d038ef9c58fc1f013224d4`
— apesar de o nome do arquivo chegar como `…_sol_b.html` em vez de
`…_solar_bess_padrao.html`, o conteúdo é byte a byte o modelo congelado.

### 5.1 O que o arquivo realmente é

| Parte | Tamanho | Papel |
|---|---|---|
| Dois logos PNG em base64 (1231×332) | ~296 KB | **94,6% do arquivo** |
| CSS embutido | 8.550 chars | Identidade visual completa |
| Hero + rodapé | — | Cabeçalho e assinatura Plugga |
| Corpo (seções 1 a 8) | 23.932 chars | **5,4% do arquivo** |

**Descoberta que muda o plano:** o `generate_santa_tereza` não usa o modelo como
estrutura. Ele recorta tudo entre `<h2>1. Resumo executivo da fatura</h2>` e
`<div class="footer">` e **substitui pelas próprias seções**. Ou seja, na
prática o modelo funciona como **folha de estilo + cabeçalho + rodapé**, e a
estrutura das seções vive no código.

Consequência para a implementação: o que precisa ser versionado como template é
o **envelope** (CSS, hero, rodapé, logos); as seções são geradas.

### 5.2 O modelo padrão não cumpre a própria trava

Verificado por busca no arquivo:

| Exigido por | Item | No modelo |
|---|---|---|
| `SKILL.md` §9, `estrutura-relatorio.md` §10, `MEMORY.md`, `checklist-qualidade.md` | Card **Análise Técnica Plugga** (`class="analysis"`, "ANÁLISE TÉCNICA", "Recomendação Plugga") | **ausente** |
| PRD da trava §5 e §7, `checklist-qualidade.md` | Gráfico de **economia acumulada** | **ausente** |
| `metodologia-calculos.md` | Menção ao equipamento **LUNA2000** | ausente |

O modelo tem "Economia anual projetada — Solar+BESS" e "Fluxo de caixa
acumulado — Solar+BESS", mas não a economia acumulada; e vai direto da seção 7
para a 8, sem o card verde de análise técnica.

**Leitura:** o modelo congelado é anterior a parte das regras que hoje o
declaram padrão. Os scripts compensam isso gerando as seções que faltam — o
`generate_santa_tereza` inclui o card de análise e o gráfico de economia
acumulada, e sua validação exige os dois.

**Decisão para o sistema:** a estrutura obrigatória é a das **regras**, não a do
arquivo. O modelo entra como envelope visual; o validador exige as 10 seções,
incluindo o card de análise técnica e os três gráficos.

### 5.3 Assets visuais: resolvidos

Os dois logos estão **embutidos em base64** dentro do modelo, em 1231×332 px.
Isso resolve o pedido de `logo_clara.png` / `logo_escura.png`, e o `hero` +
`footer` do próprio modelo substituem o `template.html` de
`relatorio-economia-plugga`. **Não é mais necessário pedir esses arquivos.**

---

## 6. Pendências

Em 2026-08-08 o pacote completo foi recuperado direto do workspace do agente
(leitura apenas, sem tocar em processo ou configuração) e arquivado em
`docs/fontes/estudo-eficiencia-energetica/pacote-open-cloud-2026-08-08/`.

**Nenhum item bloqueia mais o início.**

| Item | Situação |
|---|---|
| Modelo Jardim Floresta | ✅ recebido, SHA256 conferido |
| Skill `estudo-demanda-plugga` | ✅ recebida — SKILL.md, template e `references/padrao-v16.md` |
| Assets de `relatorio-economia-plugga` | ✅ recebidos — `template.html` e os dois logos |
| Spec de validação do modelo | ✅ `caso_jardim_floresta_solar_bess_modelo.json`: seções, obrigatórios, proibidos |
| Memória de cálculo do Serra Verde | ⚠️ não formalizada — fica como caso histórico |
| Preço de mesa do Mercado Livre | ⚠️ sem fonte automática — cenário sai como "a simular" |

As duas últimas convivem com marcação de pendência dentro do estudo.

### 6.1 Dados de cliente no repositório — decidido manter

O modelo Jardim Floresta e o `template.html` contêm dados reais de cliente
(razão social, UC, valores de fatura). **Decidido em 2026-08-08: ficam como
estão, sem anonimização.**

O motivo é o hash. A trava do agente registra o modelo pelo SHA256
`0640a0ab…`, e é assim que se prova que um estudo partiu do modelo aprovado e
não de uma cópia alterada. Qualquer edição — trocar a razão social, esconder a
UC, até acrescentar um espaço — produz um hash completamente diferente e
destrói essa prova.

Demonstração feita sobre o próprio arquivo (440.089 bytes):

| Versão | SHA256 |
|---|---|
| Original | `0640a0ab0fa84897…f013224d4` |
| Uma letra trocada | `d186d01657f44cfb…faaf9976` |
| Um espaço a mais no fim | `aa1ab1ffeeacd535…67767e5a` |

Um byte de diferença, hash inteiramente outro. Anonimizar custaria o rastro de
autenticidade; manter custa apenas ter dado de cliente num repositório privado,
sem credencial nem segredo — o README do pacote confirma que logs, cache e
credenciais ficaram de fora.

**Como aplicar:** tratar o modelo como artefato imutável. Ele nunca é editado;
serve de envelope visual e de referência de regressão. Os dados do cliente que
aparecem nele são do caso Jardim Floresta e não devem ser reaproveitados como
exemplo em tela, seed ou documentação de produto — para isso, dados fictícios.

## 7. Uma observação sobre terminologia

A resposta à pergunta 19 descreve o CAPEX como *"preliminar all-in estimado"*.
O termo **"all-in" é proibido** no documento do cliente — está na persona, no
checklist e no `doctor.sh` da própria skill. Internamente não há problema; o
registro aqui serve para lembrar que o validador do sistema precisa pegar isso,
porque o termo escapa com facilidade até de quem escreveu a regra.

Vale também fixar a grafia canônica antes de virar código: os arquivos usam
**Plugga** e **OpenClaw**; as respostas usam **PlugOS**; o repositório usa
**Plugga OS**.

---

## 8. Ordem sugerida de implementação

1. Cadastro do estudo e da UC, ligados ao cliente.
2. Ficha estruturada da fatura (digitação com validação; OCR depois).
3. **Premissas versionadas por data de vigência** — antes do cálculo, senão
   estudos antigos ficam inexplicáveis.
4. Motor de cálculo técnico e financeiro, com `calculationMode` explícito.
5. Geração do documento a partir do template Jardim Floresta versionado.
6. Validação bloqueante por regra.
7. Aprovação registrada e envio.
8. Arquivamento como caso comparável.

Os passos 1 a 4 não dependem de nada que esteja faltando e podem começar assim
que a estrutura de departamento/processo existir. O passo 5 já tem o modelo. Só
a demanda ideal (dentro do passo 4) espera a skill `estudo-demanda-plugga`.

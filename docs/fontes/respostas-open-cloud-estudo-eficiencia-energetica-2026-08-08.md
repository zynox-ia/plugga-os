# Respostas — Estudo de Eficiência Energética no PlugOS

- **Data:** 2026-08-08
- **Respondente operacional:** @pluggawazebot / DK Junior
- **Base usada:** skill `estudo-eficiencia-energetica`, skill `estudo-demanda-plugga`, modelo Jardim Floresta Solar+BESS e regras atuais do workspace Plugga/Waze.
- **Objetivo:** responder as 40 perguntas para implementação do processo **Plugga → Energia → Eficiência Energética → Estudos** no PlugOS.

---

## 0. Resumo executivo para produto

O Estudo de Eficiência Energética da Plugga não deve ser tratado como “gerador de relatório livre”. Ele é um **processo com etapas, premissas versionadas, cálculo auditável, validação bloqueante e aprovação humana antes de envio**.

Classificação recomendada no PlugOS:

```text
Empresa: Plugga
Departamento: Energia
Processo: Eficiência Energética
Registro/instância: Estudo
```

Fluxo macro recomendado:

```text
Criado → Aguardando dados → Dados recebidos → Extração/Auditoria → Cálculo técnico
→ Cenários financeiros → Documento gerado → Validação bloqueante
→ Aprovado internamente → Enviado ao cliente → Arquivado como caso comparável
```

Regra central: **o sistema precisa impedir entrega “quase certa”**. Se faltar dado, cálculo, seção obrigatória, premissa, validação ou aprovação, o estudo não deve avançar para envio.

---

## 1. Decisões canônicas para implementação

### 1.1 Modelo padrão vigente

O modelo operacional vigente para estudos acionados como **ESTUDO BESS / Solar+BESS** é o **Jardim Floresta Solar+BESS**:

```text
reports/auditorias/jardim-floresta-uc-01374052-2026-06/
auditoria_energetica_jardim_floresta_uc_01374052_2026_06_solar_bess_padrao.html
```

SHA256 confirmado no workspace:

```text
0640a0ab0fa848973cb4d89a682c0a54dbebe96f08d038ef9c58fc1f013224d4
```

O modelo **Serra Verde** continua sendo referência histórica/piloto, mas para o fluxo novo do PlugOS o padrão de produto deve seguir o **Jardim Floresta Solar+BESS**.

### 1.2 Gerador

Hoje existe conflito: a documentação manda usar `assets/gerar_relatorio_do_modelo.py`, mas o script tem bug conhecido (`conta(saida)` sem função definida). Então, para o sistema:

- **não copiar cegamente o gerador atual;**
- implementar um **gerador único de estudo** no PlugOS;
- usar os scripts atuais apenas como referência de regra e regressão;
- manter o conceito correto: modelo congelado + substituição de dados + validações bloqueantes.

### 1.3 BESS e Solar+BESS

Quando o pedido for **ESTUDO BESS**, o cenário principal deve ser **Solar+BESS**. BESS isolado aparece apenas como subdimensionamento técnico da bateria.

### 1.4 Premissas devem ser versionadas

O sistema deve ter tabela ou registro de premissas por data de vigência:

- equipamento BESS;
- capacidade kWh;
- potência kW;
- eficiência;
- CAPEX BESS;
- CAPEX FV;
- produtividade FV;
- TMA;
- reajuste tarifário;
- horizonte;
- regras de demanda.

Sem isso, um estudo antigo fica inexplicável quando a premissa mudar.

---

# 2. Respostas às 40 perguntas

## A. Modelo e template

### 1. Qual é o modelo padrão vigente: Serra Verde ou Jardim Floresta?

Para implementação do PlugOS, o padrão vigente deve ser o **Jardim Floresta Solar+BESS**.

O Serra Verde é o piloto histórico e ainda explica várias decisões de estrutura, mas o Jardim Floresta é o modelo mais recente confirmado para **ESTUDO BESS / Solar+BESS**.

Regra de produto:

```text
Se tipo do estudo = Solar+BESS ou gatilho = ESTUDO BESS → usar modelo Jardim Floresta.
```

---

### 2. Pode enviar o arquivo do modelo Jardim Floresta?

Sim. O arquivo existe no workspace em:

```text
reports/auditorias/jardim-floresta-uc-01374052-2026-06/
auditoria_energetica_jardim_floresta_uc_01374052_2026_06_solar_bess_padrao.html
```

Hash:

```text
0640a0ab0fa848973cb4d89a682c0a54dbebe96f08d038ef9c58fc1f013224d4
```

Para o PlugOS, recomendo copiar esse HTML para uma pasta de templates versionados, por exemplo:

```text
templates/energy-efficiency/jardim-floresta-solar-bess/v1.html
```

---

### 3. O gerador `gerar_relatorio_do_modelo.py` ainda é usado?

Ele é a intenção correta, mas **não deve ser considerado confiável como implementação final**, porque tem bug no caminho feliz:

```python
conta(saida)
```

A função `conta()` não existe no arquivo. O erro ocorre depois da geração, quando o relatório já passou por travas.

Decisão recomendada:

- preservar o conceito do gerador;
- corrigir ou reescrever no PlugOS;
- não depender dos scripts por caso como base permanente.

---

### 4. Os quatro `generate_*.py` são descartáveis ou devem convergir?

Eles devem **convergir para um gerador único**.

Os scripts por caso são úteis como:

- prova de como os cálculos foram feitos;
- fonte de aprendizado;
- testes de regressão;
- exemplos de entrada/saída.

Mas não devem virar arquitetura do PlugOS. O sistema precisa de:

```text
Template versionado + Motor de cálculo + Motor de validação + Renderização HTML/PDF
```

---

## B. Cálculo — BESS

### 5. A economia do BESS deve considerar apenas dias úteis?

Sim, na versão mais correta deve considerar **dias/horários em que a ponta realmente incide**.

Hoje o cálculo simplificado usa:

```text
economia_BESS_mes = consumo_ponta × spread ponta/fora ponta
```

Mas isso pode superestimar se o consumo ponta informado envolver regra tarifária com dias não úteis ou se houver perfil operacional diferente.

Implementação recomendada:

- MVP: manter cálculo simplificado, marcado como **pré-viabilidade**;
- versão completa: usar memória de massa de 15 minutos + calendário tarifário local para calcular energia deslocável real.

Campo recomendado:

```text
calculationMode = preliminar | memoria_massa
```

---

### 6. A eficiência de ciclo de 91,3% deve entrar?

Sim. Ela deve entrar na simulação completa.

Regra técnica recomendada:

```text
energia_entregue_na_ponta = energia_carregada_fora_ponta × eficiência_ciclo
```

Ou, olhando pela necessidade de atender a ponta:

```text
energia_carregada_fora_ponta = energia_ponta_atendida ÷ eficiência_ciclo
```

Impacto: a economia líquida deve considerar que para entregar 1 kWh na ponta, o cliente precisa carregar mais que 1 kWh fora ponta.

No MVP, se não aplicar eficiência, o sistema deve marcar explicitamente:

```text
Cálculo preliminar sem perdas detalhadas de ciclo.
```

---

### 7. O custo da energia usada para carregar a bateria fora ponta deve ser descontado?

Sim, em cálculo completo.

A economia correta não é só tarifa ponta evitada. É o benefício líquido:

```text
economia líquida = custo evitado na ponta - custo de carga fora ponta ajustado por eficiência
```

Forma conceitual:

```text
economia_BESS = energia_entregue_ponta × tarifa_ponta
              - energia_carregada_fora_ponta × tarifa_fora_ponta
```

Como `energia_carregada_fora_ponta = energia_entregue_ponta / eficiência`, então:

```text
economia_BESS = energia_entregue_ponta × tarifa_ponta
              - (energia_entregue_ponta / eficiência) × tarifa_fora_ponta
```

No relatório cliente, não abrir fórmula; mostrar só resultado e premissas.

---

### 8. Em `BESS por energia`, o divisor 30 são dias corridos. É proposital?

É uma simplificação preliminar, não uma regra final.

Para pré-viabilidade sem memória de massa, pode usar 30 dias como aproximação. Para projeto real, deve usar:

- dias com ponta tarifária;
- perfil operacional;
- memória de massa;
- sazonalidade.

Campo recomendado:

```text
daysBasis = 30_corridos | dias_ponta | memoria_massa
```

---

### 9. Usa capacidade nominal de 241 kWh ou profundidade útil menor?

Hoje a premissa operacional usa **241 kWh nominal** do Huawei LUNA2000-241-2S1.

Para o PlugOS, recomendo separar:

```text
nominalCapacityKwh = 241
usableCapacityKwh = configurável
cycleEfficiency = 0.913
```

Enquanto não houver definição de DoD/capacidade útil validada por datasheet/projeto, usar 241 kWh como premissa preliminar e marcar no estudo:

```text
Pré-dimensionamento com capacidade nominal; validar capacidade útil em projeto básico.
```

---

### 10. Há limite de unidades por local?

Sim, mas hoje esse limite não está automatizado. Depende de:

- área física disponível;
- ventilação/ambiente;
- capacidade de conexão;
- proteção elétrica;
- transformador/subestação;
- regime de operação;
- exigências do fabricante;
- viabilidade econômica.

No PlugOS, o cálculo pode sugerir unidades, mas deve ter campo de validação:

```text
siteFeasibilityStatus = nao_avaliada | preliminar | validada | inviavel
```

Sem validação física/elétrica, o resultado é pré-viabilidade.

---

## C. Cálculo — FV / Solar

### 11. Qual é a regra oficial de dimensionamento FV?

Hoje não existe uma regra única suficientemente consolidada. Há duas práticas nos scripts:

- dimensionar por percentual do consumo total, exemplo: 60%;
- fixar potência por premissa interna do caso, exemplo: 125 kWp.

Para o PlugOS, recomendo esta regra padrão de pré-dimensionamento:

```text
fvKwpPreliminar = teto((consumoMensalAlvoKwh) ÷ produtividadeMensalKwhPorKwp)
```

Onde:

```text
consumoMensalAlvoKwh = consumoTotalMensal × percentualAtendimentoFV
```

Premissa inicial:

```text
percentualAtendimentoFV = 60%
produtividadeMensal = 130 kWh/kWp.mês
```

Mas ambos devem ser campos editáveis/versionados, não constantes escondidas.

---

### 12. De onde vem a produtividade de 130 kWh/kWp·mês?

Hoje ela aparece nos scripts como premissa prática, não como fonte regulatória documentada.

Para produto, tratar como **premissa Plugga preliminar**, não verdade universal.

Recomendação:

- default inicial: 130 kWh/kWp.mês;
- exigir localidade/UF;
- permitir ajuste manual;
- futuramente integrar irradiação por localidade/PVGIS/Sundata/CRESESB ou base própria.

Campo recomendado:

```text
fvProductivityKwhPerKwpMonth
fvProductivitySource = premissa_plugga | pvgis | cresesb | projeto | manual
```

---

### 13. Por que a economia FV usa só tarifa fora ponta? A geração não abate ponta também?

A premissa atual usa fora ponta por conservadorismo e porque a geração solar normalmente ocorre fora do horário de ponta convencional.

Em regra prática:

- FV reduz consumo diurno/fora ponta;
- BESS desloca energia para ponta;
- Solar+BESS combina os dois.

Para o cálculo completo, se houver memória de massa, a FV deve ser alocada conforme curva horária real. Sem memória, usar fora ponta como aproximação conservadora.

---

### 14. Deve haver limite de FV por área disponível ou demanda contratada?

Sim.

O pré-dimensionamento por consumo não basta. O sistema deve prever travas de viabilidade:

- área disponível;
- estrutura/telhado/solo;
- conexão elétrica;
- demanda/carga local;
- restrição da distribuidora;
- estratégia de autoconsumo;
- limite econômico.

Campo recomendado:

```text
fvLimitStatus = nao_avaliado | limitado_por_area | limitado_por_conexao | validado
```

Sem esses dados, o FV é pré-viabilidade.

---

### 15. Compensação/injeção na rede entra no cálculo?

Por ora, no estudo de eficiência Solar+BESS padrão, deve ser tratada com cuidado e **não presumida**.

MVP recomendado:

- foco em autoconsumo e redução de compra de energia;
- não monetizar excedente/injeção sem regra clara;
- se houver excedente, marcar como ponto de estudo posterior.

Versão completa pode ter campo:

```text
compensationMode = ignorada | autoconsumo | compensacao_gd | mercado_livre | outro
```

---

## D. Cálculo — financeiro

### 16. Payback deve usar fluxo reajustado?

Existem dois indicadores diferentes:

1. **Payback simples:**

```text
CAPEX ÷ economia_ano_1
```

2. **Payback acumulado com reajuste:** considera economia crescendo 4% a.a.

Para clareza, o PlugOS deve calcular ambos, mas mostrar no relatório conforme padrão:

- payback simples;
- payback descontado;
- VPL;
- TIR;
- economia acumulada.

Não misturar nomes. Se usar reajuste, chamar de **payback projetado/acumulado**, não payback simples.

---

### 17. Como calcular payback descontado?

Payback descontado é o primeiro ano em que o fluxo de caixa descontado acumulado fica positivo.

Processo:

```text
fluxo_descontado_ano_n = economia_ano_n ÷ (1 + TMA)^n
acumulado_descontado_n = -CAPEX + soma(fluxos_descontados até n)
```

O payback descontado é o ponto em que:

```text
acumulado_descontado_n >= 0
```

Se cruzar entre dois anos, interpolar:

```text
payback_descontado = ano_anterior + saldo_negativo_abs / fluxo_descontado_do_ano
```

Se não zerar dentro de 20 anos:

```text
payback_descontado = maior que horizonte / não recupera no horizonte
```

---

### 18. O fluxo deve incluir O&M, degradação, seguro, troca de inversor?

No estudo atual, não inclui. Para o PlugOS:

- MVP: não incluir por padrão, mas mostrar como premissa;
- versão avançada: permitir incluir.

Campos recomendados:

```text
annualOmCost
batteryDegradationRate
pvDegradationRate
insuranceCost
inverterReplacementYear
batteryReplacementYear
```

Sem esses campos preenchidos, marcar:

```text
Pré-viabilidade sem O&M, degradação, seguro e reposições futuras.
```

---

### 19. CAPEX BESS e FV incluem projeto/instalação/EPC?

Hoje são premissas comerciais de pré-viabilidade, não orçamento fechado.

- BESS: R$ 550.000,00 por unidade LUNA2000-241.
- FV: R$ 2.500,00/kWp.

Para o sistema, tratar como **CAPEX preliminar all-in estimado** apenas se a Plugga confirmar. Enquanto não confirmado:

```text
capexScope = preliminar_estimado
```

E separar campos:

```text
equipmentCost
projectCost
epcCost
installationCost
omCost
otherCosts
```

---

### 20. Há vida útil/substituição de bateria dentro dos 20 anos?

Hoje não está considerada nos scripts. Para estudo preliminar, pode ficar fora com ressalva.

Para implementação robusta, prever:

```text
batteryUsefulLifeYears
batteryReplacementYear
batteryReplacementCost
```

Se não preenchido, o relatório deve dizer que a análise é preliminar e exige cotação técnica para vida útil e reposição.

---

### 21. Impostos sobre investimento entram na pré-viabilidade?

Hoje não entram. O estudo atual é pré-viabilidade técnico-comercial.

Para o PlugOS:

- não incluir impostos por padrão;
- criar campos opcionais para imposto, financiamento, incentivo e depreciação;
- só ativar quando houver informação contábil/tributária validada.

---

## E. Demanda ideal

### 22. Como se calcula demanda ideal?

Regra operacional:

1. coletar histórico idealmente de 12 a 16 meses;
2. identificar pico de demanda registrada/faturável;
3. aplicar tolerância regulatória de 5%;
4. propor cenários conservador, intermediário e arrojado;
5. escolher recomendação que maximize economia sem gerar ultrapassagem relevante.

Conceito:

```text
limite_sem_multa = demanda_proposta × 1,05
```

A demanda proposta recomendada deve ter limite sem multa igual ou acima do pico observado, salvo decisão consciente de risco.

No estudo de eficiência energética, essa análise entra como **resumo dentro da seção de demanda**, não como estudo de demanda completo.

---

### 23. Os números do piloto Serra Verde foram calculados como?

Os números registrados são:

- demanda ideal preliminar: 1.095 kW;
- redução: 103 kW;
- redução percentual: 8,60%;
- economia mensal: R$ 1.368,87;
- economia anual: R$ 16.426,44.

Eles funcionam hoje como **referência do piloto**, mas a memória completa não está totalmente formalizada na pasta analisada.

Para o PlugOS, não hardcodar esses números. Eles devem entrar apenas como caso histórico/regressão, não regra geral.

---

### 24. Qual regra da skill `estudo-demanda-plugga` reaproveitar?

Reaproveitar:

- tolerância de 5% para ultrapassagem;
- conceito de demanda ociosa para baixo;
- cenários conservador/intermediário/arrojado;
- recomendação baseada no pico observado;
- economia mensal = diferença de demanda × tarifa de demanda;
- histórico ideal de 12 a 16 meses;
- regra de alteração simples entre 5% e 20%.

Não reaproveitar o relatório inteiro. No estudo de eficiência, demanda é uma seção, não o produto principal.

---

### 25. Com menos de 12 faturas, qual mínimo aceitável para sair de preliminar?

Recomendação:

- **1 fatura:** apenas diagnóstico/preliminar;
- **3 a 6 faturas:** tendência inicial, ainda preliminar;
- **6 a 11 faturas:** análise intermediária com ressalva;
- **12+ faturas ou memória de massa:** análise robusta.

Para deixar de ser preliminar, mínimo recomendado: **12 meses ou memória de massa representativa**.

---

## F. Dados de entrada e fontes

### 26. Como a fatura é lida hoje?

Hoje o processo é majoritariamente manual/semi-manual:

- PDF ou imagem da fatura;
- extração pelo agente;
- conferência humana;
- preenchimento em scripts/caso.

No PlugOS, começar com upload + digitação/conferência manual estruturada. Depois evoluir para OCR/API.

---

### 27. Existe layout por distribuidora?

Ainda não como motor consolidado. Os casos recentes estão muito baseados em faturas Grupo A e exemplos como Roraima Energia.

Produto recomendado:

```text
DistributorTemplate
- distributor
- uf
- fieldMappings
- tariffRules
- validationRules
```

No MVP, permitir entrada manual com validação.

---

### 28. De onde vem tarifa homologada/REH?

Deve vir de fonte regulatória/ANEEL ou documento/tarifa validada pela operação.

Hoje pode ser consultada ou digitada conforme caso. No PlugOS:

- campo obrigatório de fonte;
- se não houver fonte, marcar como pendente;
- não permitir conclusão sensível baseada em tarifa inventada.

Campos:

```text
tariffSource
tariffSourceUrl
tariffReferenceDate
tariffValidatedBy
```

---

### 29. Como se obtém preço de mesa do Mercado Livre?

Hoje não está implementado de forma automática nesses scripts.

Para o PlugOS:

- preço pode vir de mesa/comercializadora/parceiro;
- deve ser input versionado do estudo;
- deve ter data, fonte e validade.

Campos:

```text
freeMarketPrice
freeMarketSource
freeMarketValidityDate
```

Sem isso, o cenário Mercado Livre deve aparecer como oportunidade a simular, não como economia fechada.

---

### 30. Benefício fiscal vem da fatura ou é calculado?

Depende do caso. Pode aparecer na fatura ou exigir regra tributária específica.

Para implementação:

- extrair quando vier explícito na fatura;
- quando calculado, exigir base/fonte;
- se não houver segurança, marcar como validar.

Campos:

```text
fiscalBenefitAmount
fiscalBenefitPercent
fiscalBenefitSource = fatura | calculado | informado | pendente
```

---

## G. Saída, versionamento e histórico

### 31. Onde ficam os HTML gerados e existe controle de versão?

Hoje ficam principalmente em `reports/`, com nomes por cliente/UC/referência e algumas versões como `V01-R00`, `V02-R00`.

No PlugOS, padronizar:

```text
studyId
versionNumber
revisionNumber
status
htmlFileId
pdfFileId
createdAt
approvedAt
sentAt
```

---

### 32. Refeito com dados novos vira versão ou estudo novo?

Regra recomendada:

- mesma UC + mesma competência + mesmo objetivo → **nova versão/revisão do mesmo estudo**;
- nova competência, nova finalidade ou novo escopo → **novo estudo**.

Exemplo:

```text
Jardim Floresta 06/2026 Solar+BESS V01-R00
Jardim Floresta 06/2026 Solar+BESS V01-R01 = correção/revisão
Jardim Floresta 07/2026 Solar+BESS = novo estudo
```

---

### 33. O PDF é gerado como?

Preferência operacional: HTML → PDF via Chromium/Playwright.

No workspace há helper:

```text
node /root/.openclaw/workspace/tools/html-render/html-to-pdf.js input.html output.pdf
```

Não usar LibreOffice para esse tipo de visual, porque quebra layout.

---

### 34. Banco de casos comparáveis é alimentado manualmente?

Sim, hoje é manual. O sistema deve automatizar.

Ao concluir um estudo, gravar campos resumidos em estrutura de caso comparável:

- cliente;
- UC;
- distribuidora;
- referência;
- consumo;
- demanda;
- custo médio;
- reativo;
- benefício fiscal;
- spread ponta/fora ponta;
- oportunidades;
- arquivos gerados.

---

### 35. Existe estudo entregue para teste de regressão?

Sim, o melhor candidato atual é o **Jardim Floresta Solar+BESS**, porque é o modelo vigente e tem HTML aprovado/hash conhecido.

Também usar Serra Verde como teste histórico/piloto.

Recomendação de testes:

```text
Entrada conhecida → saída HTML esperada → validações de seções/cálculos/hash parcial
```

Não precisa comparar hash total se houver data/IDs dinâmicos, mas precisa comparar estrutura, seções, KPIs e valores principais.

---

## H. Governança e processo

### 36. Quem aprova envio ao cliente hoje?

Aprovação deve vir de Dilkson/equipe responsável da Plugga antes de envio externo.

No sistema, registrar:

```text
approvedById
approvedAt
approvalNote
```

Sem aprovação humana, o status não pode virar “Enviado ao cliente”.

---

### 37. A dupla consulta é conferida por alguém ou confiada ao agente?

Hoje depende do agente seguir a trava. No PlugOS, isso deve virar validação sistêmica.

Implementar checklist bloqueante:

- modelo correto;
- seções obrigatórias presentes;
- termos proibidos ausentes;
- CAPEX Solar+BESS = CAPEX FV + CAPEX BESS;
- BESS não como cenário principal isolado;
- gráficos obrigatórios;
- valores sem abreviação;
- rodapé/cabeçalho corretos;
- aprovação antes de envio.

---

### 38. Quando estiver no sistema, o agente continua gerando?

Recomendação: o agente deixa de ser “gerador solto” e passa a atuar como:

- extrator de dados;
- assistente de preenchimento;
- revisor de inconsistências;
- explicador técnico;
- gerador de minuta dentro do fluxo;
- auditor de checklist.

A fonte de verdade vira o PlugOS.

---

### 39. Há SLA para entregar estudo depois que a fatura chega?

Não há SLA formal consolidado nos arquivos. Recomendação para iniciar:

- triagem/conferência dos dados: até 1 dia útil;
- estudo preliminar: até 2 dias úteis após dados completos;
- estudo completo com histórico/memória de massa: 3 a 5 dias úteis;
- revisão/aprovação interna: 1 dia útil.

SLA só deve contar a partir de **dados mínimos completos**.

---

### 40. Quais 3 KPIs devem medir saúde do processo?

Recomendo estes 3 KPIs iniciais:

1. **Tempo médio de entrega após dados completos**
   - mede eficiência operacional.

2. **Taxa de estudos bloqueados por falta de dados/premissas**
   - mede qualidade da entrada e gargalo comercial/cliente.

3. **Taxa de retrabalho após validação interna**
   - mede qualidade do cálculo, template e aderência ao padrão Plugga.

KPIs adicionais úteis:

- economia potencial média identificada;
- percentual de estudos convertidos em proposta;
- percentual com oportunidade Solar+BESS/ML/demanda;
- valor potencial acumulado em carteira.

---

# 3. Campos recomendados para o PlugOS

## 3.1 Entidade `EnergyEfficiencyStudy`

Campos principais:

```text
id
company = Plugga
department = Energia
process = Eficiência Energética
clientId
consumerUnitId
referenceMonth
referenceYear
type = auditoria | solar_bess | demanda | mercado_livre | completo
status
ownerId
createdById
approvedById
sentAt
version
revision
```

## 3.2 Dados da fatura

```text
invoiceFileId
invoiceTotalAmount
consumptionPeakKwh
consumptionOffPeakKwh
consumptionTotalKwh
tariffPeak
 tariffOffPeak
demandContractedKw
demandMeasuredPeakKw
demandMeasuredOffPeakKw
demandAmount
reactiveAmount
fiscalBenefitAmount
flagsAmount
feesAndFinesAmount
```

## 3.3 Premissas

```text
assumptionVersionId
bessModel
bessCapacityKwh
bessPowerKw
bessCycleEfficiency
bessCapexPerUnit
fvCapexPerKwp
fvProductivityKwhPerKwpMonth
financialHorizonYears
discountRate
annualTariffAdjustment
```

## 3.4 Resultados técnicos

```text
demandUtilizationPercent
hasDemandExceedance
recommendedDemandKw
bessUnitsByEnergy
bessUnitsByPower
bessUnitsRecommended
fvKwpRecommended
```

## 3.5 Resultados financeiros

```text
capexBess
capexFv
capexSolarBess
monthlySavings
firstYearSavings
accumulatedSavings20y
simplePaybackYears
discountedPaybackYears
npv
irr
```

## 3.6 Validação

```text
validationStatus
validationErrors[]
validatedAt
validatedBy
approvalStatus
approvalNote
```

---

# 4. Estados recomendados

```text
rascunho
aguardando_dados
dados_recebidos
em_extracao
em_auditoria
em_calculo
relatorio_gerado
em_validacao
bloqueado
aprovado_internamente
enviado_cliente
arquivado
cancelado
```

Bloqueios reais:

- fatura ausente;
- UC/cliente ausente;
- campos mínimos incompletos;
- premissa sem fonte;
- cálculo não executado;
- seção obrigatória ausente;
- termo proibido no relatório;
- CAPEX Solar+BESS inconsistente;
- aprovação humana ausente.

---

# 5. Conclusão para implementação

O PlugOS deve reproduzir o serviço como **processo controlado**, não apenas como editor de relatório.

Prioridade de implementação:

1. cadastro do estudo e UC;
2. upload/ficha estruturada da fatura;
3. premissas versionadas;
4. cálculo técnico/financeiro;
5. geração HTML pelo template Jardim Floresta;
6. validação bloqueante;
7. aprovação e envio;
8. arquivamento como caso comparável.

A maior economia de retrabalho vem das travas: **modelo certo, cálculo coerente, seções obrigatórias, aprovação registrada e bloqueio automático antes do envio.**

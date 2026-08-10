# PRD — Trava inquebrável de dupla consulta para ESTUDO BESS Solar+BESS

Data: 2026-08-07  
Dono: Dilkson Gomes / Plugga Gestão de Energia  
Área: backoffice-suporte  
Skill: `estudo-eficiencia-energetica`

## 1. Contexto

Dilkson determinou que nenhum relatório do gatilho **ESTUDO BESS** seja enviado sem consultar e reconsultar:

1. o **modelo padrão Jardim Floresta Solar+BESS** no workspace;
2. o **repositório da skill** `estudo-eficiencia-energetica` no workspace.

A regra nasceu porque houve retrabalho com relatórios fora do padrão gráfico/cálculo, especialmente nos gráficos de **economia acumulada** e **fluxo de caixa acumulado**.

## 2. Objetivo

Garantir **zero HTML enviado fora do padrão aprovado** para ESTUDO BESS Solar+BESS.

## 3. Definição operacional

Quando Dilkson pedir **ESTUDO BESS**, interpretar sempre como:

> **Estudo de Eficiência Energética Solar+BESS — modelo Jardim Floresta**

BESS isolado **não é produto/cenário principal**. Ele entra apenas como subdimensionamento técnico da bateria dentro do Solar+BESS.

## 4. Fontes obrigatórias

Antes de gerar qualquer relatório:

- Modelo padrão:
  - `reports/auditorias/jardim-floresta-uc-01374052-2026-06/auditoria_energetica_jardim_floresta_uc_01374052_2026_06_solar_bess_padrao.html`
- Skill/repositório local:
  - `brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica/SKILL.md`
  - `brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica/MEMORY.md`
  - `brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica/references/metodologia-calculos.md`
  - `brains/time/areas/backoffice-suporte/skills/estudo-eficiencia-energetica/references/checklist-qualidade.md`

Se o workspace local estiver insuficiente, consultar o GitHub `Plugga-AM/plugga-waze-brain` antes de entregar.

## 5. Premissas fixas

- CAPEX BESS: **R$ 550.000,00 por unidade**, salvo cotação/instrução diferente.
- CAPEX FV: **R$ 2.500,00 por kWp instalado**, salvo cotação/instrução diferente.
- Equipamento BESS padrão: Huawei LUNA2000-241-2S1.
- Energia por unidade BESS: **241 kWh**.
- Potência por unidade BESS: **108 kW**.
- Horizonte financeiro: **20 anos**.
- TMA: **5% a.a.**.
- Reajuste tarifário: **4% a.a.**.
- CAPEX Solar+BESS = **CAPEX FV + CAPEX BESS**.

## 6. Fluxo obrigatório — antes de gerar

1. Abrir/consultar o modelo padrão Jardim Floresta Solar+BESS.
2. Abrir/consultar a skill e suas referências no repositório local.
3. Confirmar que o estudo será Solar+BESS.
4. Confirmar premissas de CAPEX BESS e FV.
5. Extrair dados da fatura.
6. Calcular:
   - custo kWh ponta;
   - consumo ponta;
   - demanda medida ponta;
   - quantidade BESS por energia;
   - quantidade BESS por potência;
   - FV preliminar;
   - CAPEX FV;
   - CAPEX BESS;
   - CAPEX Solar+BESS;
   - economia mensal Solar+BESS;
   - economia anual projetada 20 anos;
   - economia acumulada 20 anos;
   - fluxo de caixa acumulado 20 anos;
   - payback simples;
   - VPL;
   - TIR.

## 7. Fluxo obrigatório — depois de gerar e antes de enviar

Antes de mandar HTML ao usuário:

1. Reabrir o modelo padrão Jardim Floresta Solar+BESS.
2. Reabrir a skill/referências do repositório local.
3. Comparar estrutura do HTML gerado com o modelo:
   - título/capa;
   - CSS base;
   - seções;
   - rodapé;
   - hierarquia visual;
   - cards e gráficos.
4. Validar cálculo:
   - CAPEX Solar+BESS soma FV + BESS;
   - BESS não aparece como cenário principal isolado;
   - demanda usada no ranking/oportunidade é demanda medida ponta;
   - valores financeiros não abreviados.
5. Validar gráficos obrigatórios:
   - gráfico de economia anual/acumulada Solar+BESS;
   - gráfico de fluxo de caixa acumulado Solar+BESS;
   - tabelas ano a ano abaixo dos gráficos;
   - eixos e rótulos legíveis.
6. Bloquear envio se qualquer item crítico falhar.

## 8. Critérios de aceite

Um ESTUDO BESS só pode ser enviado se:

- [ ] Modelo padrão foi consultado antes.
- [ ] Repositório/skill foi consultado antes.
- [ ] Modelo padrão foi reconsultado depois da geração.
- [ ] Skill/repositório foi reconsultado depois da geração.
- [ ] Relatório é Solar+BESS.
- [ ] CAPEX FV = kWp × R$ 2.500,00.
- [ ] CAPEX BESS = unidades × R$ 550.000,00.
- [ ] CAPEX Solar+BESS = CAPEX FV + CAPEX BESS.
- [ ] Gráfico de economia acumulada existe e está correto.
- [ ] Gráfico de fluxo de caixa acumulado existe e está correto.
- [ ] HTML segue o padrão visual Jardim Floresta.
- [ ] Não há termos internos como debug, teste, rascunho, corrigido, final, conforme Dilkson.

## 9. Regra de bloqueio

Se a dupla consulta não foi feita antes e depois, ou se a validação não confirma cálculo e gráfico:

> **Não enviar o HTML. Corrigir primeiro.**

## 10. Registro

Esta trava é parte da skill `estudo-eficiencia-energetica` e deve ser versionada no repositório privado `Plugga-AM/plugga-waze-brain`.

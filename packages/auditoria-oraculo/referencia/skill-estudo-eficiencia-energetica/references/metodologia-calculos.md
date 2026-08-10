# Metodologia de Cálculos — Interna

> Este arquivo é interno. Não expor fórmulas abertas no relatório ao cliente.

## Custo médio

- Custo médio de energia efetivo = (energia ponta + energia fora ponta + demanda) / kWh total.
- Custo médio total da fatura = total da fatura / kWh total.
- Não usar “all-in” para cliente.

## Demanda

- Utilização = maior demanda registrada / demanda contratada.
- Tolerância de ultrapassagem Grupo A: 5% acima da contratada.
- Demanda ideal exige histórico, preferencialmente 12 faturas + memória de massa.
- Para demanda ideal, consultar `skills/estudo-demanda-plugga` e a lógica OPM quando houver.

## Reativo

- Menor que 2% da fatura: registrar/monitorar.
- 2% a 4%: atenção.
- Maior que 4% ou valor absoluto relevante: investigar tecnicamente.

## BESS

Equipamento base Plugga, salvo outro datasheet:

- Huawei LUNA2000-241-2S1.
- Capacidade: 241 kWh.
- Potência: 108 kW.
- Eficiência máxima de ciclo: 91,3%.

Separar dois limitadores:

- energia: consumo ponta médio/dia / kWh por unidade;
- potência: demanda de referência na ponta / kW por unidade.

Quantidade preliminar = maior entre energia e potência.

## Arbitragem ponta/fora ponta

Cenário base do piloto:

- BESS carrega fora ponta;
- descarrega na ponta;
- economia vem do spread ponta-fora ponta.

Não misturar automaticamente com:

- solar carregando BESS;
- redução de demanda;
- Mercado Livre;
- O&M;
- degradação;
- perdas detalhadas;
- impostos do EPC.

## Pré-viabilidade financeira

Padrão:

- horizonte: 20 anos;
- TMA: 5% a.a., salvo premissa diferente;
- reajuste tarifário: 4% a.a., salvo premissa diferente;
- CAPEX base LUNA2000-241: R$ 550.000/unidade no piloto Serra Verde/Aeroporto;
- dinheiro em relatório sempre completo, sem abreviação.

Indicadores:

- CAPEX.
- Economia Ano 1.
- Economia acumulada no horizonte.
- Payback.
- Payback descontado.
- VPL com TMA.
- TIR.

## Estudo de Eficiência Energética Solar+BESS — modelo Jardim Floresta

Nome canônico operacional/memória: **Estudo de Eficiência Energética Solar+BESS — modelo Jardim Floresta**.

Aliases aceitos: estudo Solar+BESS; espelho comparativo Solar+BESS; relatório Jardim Floresta Solar+BESS; estudo de eficiência energética Solar+BESS.

Gatilho obrigatório: quando Dilkson/equipe escrever **ESTUDO BESS**, interpretar automaticamente como **Estudo de Eficiência Energética Solar+BESS — modelo Jardim Floresta**.

Quando Dilkson pedir “mais estudos como esse”, o cenário principal é sempre **Solar+BESS**. BESS sozinho entra apenas como subdimensionamento técnico da bateria (energia/potência), não como produto/cenário principal do relatório.

Cenário obrigatório:

1. **Solar+BESS** — FV atende consumo no período solar e pode carregar/apoia o BESS para deslocar energia da ponta. O CAPEX Solar+BESS é sempre **CAPEX FV + CAPEX BESS**; nunca mostrar apenas CAPEX da usina.
2. **Subdimensionamento BESS** — calcular energia e potência necessárias para o banco de baterias dentro do cenário Solar+BESS.

Premissas internas mínimas:

- Da fatura: consumo ponta, consumo fora ponta, demanda medida ponta, demanda medida fora ponta, demanda contratada, tarifa ponta, tarifa fora ponta, demanda, reativo, total e histórico quando existir.
- Para oportunidade de ponta/ranking: sempre mostrar consumo ponta, **demanda medida ponta** e custo do kWh ponta.
- BESS por energia = `consumo ponta diário de referência / kWh útil por unidade`.
- BESS por potência = `demanda medida ponta / kW por unidade`.
- Quantidade preliminar de BESS = maior entre limitador de energia e limitador de potência.
- Equipamento padrão: Huawei LUNA2000-241-2S1, 241 kWh / 108 kW, salvo instrução diferente.
- CAPEX BESS padrão: R$ 550.000 por unidade, salvo cotação/instrução diferente.
- CAPEX FV padrão quando não houver cotação: usar premissa Plugga registrada no caso (ex.: R$/kWp definido no relatório); não inventar preço sem marcar premissa.
- Geração FV mensal = potência FV (`kWp`) × produtividade específica mensal (`kWh/kWp.mês`) ou premissa validada no caso.
- Economia Solar+BESS deve reconciliar fatura atual, consumo atendido por FV/BESS, redução de ponta e custo remanescente; se faltar memória de massa, marcar como pré-viabilidade.

No relatório ao cliente, não abrir fórmulas. Mostrar cenários, CAPEX, economia, payback, fluxo/VPL/TIR quando aplicável e próximos passos.


## Demanda ideal dentro do Estudo de Eficiência Energética

A demanda ideal entra somente no item **Análise de demanda** do Estudo de Eficiência Energética. Não transformar o relatório em Estudo de Demanda completo nem reduzir a análise às regras da skill `estudo-demanda-plugga`. A lógica dessa skill deve ser usada apenas para calcular/qualificar a demanda ideal ou demanda ideal preliminar.

No piloto Serra Verde, com apenas uma fatura, incluir como prévia: demanda ideal preliminar **1.095 kW**, redução de **103 kW (8,60%)**, economia mensal estimada **R$ 1.368,87** e economia anual estimada **R$ 16.426,44**, sempre com ressalva de validação por 12 faturas e memória de massa.

## Demanda ideal com histórico

Quando houver 12 faturas/histórico, calcular demanda ideal com base no pico observado, tolerância de 5% e cenários da skill `estudo-demanda-plugga`. O relatório de eficiência energética deve mostrar o gráfico-resumo no item de demanda, sem transformar o relatório inteiro em Estudo de Demanda.

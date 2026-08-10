# Piloto — Agroindustrial Serra Verde UC 0188872-2

Caso piloto usado para fechar o padrão inicial da skill.

## Dados principais

- Cliente: Agroindustrial Serra Verde Ltda.
- UC: 0188872-2.
- Distribuidora: Roraima Energia S.A.
- Referência: 06/2025.
- Valor da fatura: R$ 291.154,80.
- Consumo total: 548.413 kWh.
- Ponta: 42.835 kWh.
- Fora ponta: 505.578 kWh.
- Tarifa ponta: R$ 1,767870/kWh.
- Tarifa fora ponta: R$ 0,386730/kWh.
- Demanda contratada: 1.198 kW.
- Maior demanda registrada: 1.149 kW.
- Demanda de referência BESS: 1.079 kW.
- Reativo: R$ 3.984,50.
- Benefício/isenção fiscal: R$ 72.788,70.

## Decisões do piloto

- Relatório começa por auditoria da fatura.
- BESS fica em oportunidades no final.
- Item 4 sem gráfico.
- Item 5 com gráficos pequenos + pizza + comentários.
- Oportunidades sem subtítulo BESS/Solar+BESS/ML.
- VPL com TMA, sem arroba.
- Economia anual e fluxo de caixa com gráfico central + tabela embaixo.
- Próximos passos em timeline.
- Análise Técnica Plugga antes dos próximos passos.
- Cabeçalho vem da arquitetura real OPM.

## Arquivos gerados no piloto

- `reports/auditoria-energetica-serra-verde-uc-0188872-2-2025-06-cliente.html`
- `reports/auditoria-energetica-serra-verde-uc-0188872-2-2025-06-cliente.pdf`


## Demanda ideal dentro do Estudo de Eficiência Energética

A demanda ideal entra somente no item **Análise de demanda** do Estudo de Eficiência Energética. Não transformar o relatório em Estudo de Demanda completo nem reduzir a análise às regras da skill `estudo-demanda-plugga`. A lógica dessa skill deve ser usada apenas para calcular/qualificar a demanda ideal ou demanda ideal preliminar.

No piloto Serra Verde, com apenas uma fatura, incluir como prévia: demanda ideal preliminar **1.095 kW**, redução de **103 kW (8,60%)**, economia mensal estimada **R$ 1.368,87** e economia anual estimada **R$ 16.426,44**, sempre com ressalva de validação por 12 faturas e memória de massa.

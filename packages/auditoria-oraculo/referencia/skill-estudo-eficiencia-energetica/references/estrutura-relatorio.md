# Estrutura do Relatório

## 1. Cabeçalho Plugga

Usar arquitetura real da skill `relatorio-economia-plugga`, especialmente `assets/template.html`:

- `.hero`
- `.eyebrow`
- `.brandmark`
- `.logo-img`
- `.chips`

Não recriar de memória.

## 2. Resumo executivo da fatura

Cards:

- Valor total.
- Mês/vencimento.
- Consumo total.
- Custo médio total da fatura.

Destaques em texto curto.

## 3. Identificação da unidade

Tabela com consumidor, UC, distribuidora, localidade, grupo/modalidade, classe/subclasse, período e referência.

## 4. Análise de demanda

Obrigatório incluir:

- demanda contratada;
- demanda registrada ponta/fora ponta;
- maior demanda registrada;
- utilização do contrato;
- tolerância de ultrapassagem;
- ultrapassagem;
- demanda ideal preliminar quando houver histórico suficiente.

Quando faltarem 12 faturas/memória de massa, declarar que é preliminar.

## 5. Consumo e custos

Sem gráfico nesta seção. Usar cards + tabela:

- consumo ponta;
- consumo fora ponta;
- custo médio de energia efetivo;
- custo médio total da fatura;
- tarifas aplicadas;
- peso no total.

## 6. Composição da fatura

Usar gráficos pequenos:

- gráfico cartesiano pequeno de composição;
- gráfico de pizza/participação;
- caixa “Comentários”.

Mostrar percentual de cada componente no total.

## 7. Diagnóstico e recomendações

Separar oportunidades sem investimento:

- demanda;
- reativo;
- rotina financeira;
- benefício fiscal;
- ajuste de modalidade/contrato quando aplicável.

## 8. Oportunidades

Título apenas: **Oportunidades**.

Texto base:

> A auditoria indica fatura bem controlada em demanda, mas com custo de ponta muito superior ao fora ponta. Isso abre espaço para estudar soluções como BESS, Solar+BESS e Mercado Livre de energia.

Cenários:

- Sem investimento.
- Apenas BESS.
- Solar+BESS.
- Mercado Livre.

KPIs:

- CAPEX.
- Economia mensal.
- Economia Ano 1.
- Payback.
- VPL com TMA.
- TIR.
- Payback descontado.

## 9. Economia anual e fluxo de caixa

Gráfico centralizado + tabela sintética abaixo.

- Eixo Y: valor (R$).
- Eixo X: tempo (anos).
- Horizonte padrão: 20 anos.
- Valores financeiros completos.

## 10. Análise Técnica Plugga

Card verde escuro igual padrão OPM:

- Eyebrow: ANÁLISE TÉCNICA.
- Título: Análise de eficiência energética.
- Texto interpretativo.
- Recomendação Plugga.

## 11. Próximos passos

Formato destacado em timeline/mapa mental:

1. Enviar histórico — 12 faturas.
2. Memória de massa — 15 minutos.
3. Validar bases — tarifa homologada, tributo e benefício.
4. Simular cenários — BESS, Solar+BESS, Mercado Livre.
5. Obter cotações — projeto básico, projeto executivo, EPC, operação e manutenção.

## 12. Rodapé

Logo Plugga + frase/contato.


## Demanda ideal dentro do Estudo de Eficiência Energética

A demanda ideal entra somente no item **Análise de demanda** do Estudo de Eficiência Energética. Não transformar o relatório em Estudo de Demanda completo nem reduzir a análise às regras da skill `estudo-demanda-plugga`. A lógica dessa skill deve ser usada apenas para calcular/qualificar a demanda ideal ou demanda ideal preliminar.

No piloto Serra Verde, com apenas uma fatura, incluir como prévia: demanda ideal preliminar **1.095 kW**, redução de **103 kW (8,60%)**, economia mensal estimada **R$ 1.368,87** e economia anual estimada **R$ 16.426,44**, sempre com ressalva de validação por 12 faturas e memória de massa.

## Gráfico de demanda ideal

Com 12 faturas ou histórico de 12 meses, a seção de demanda deve trazer gráfico de prova da demanda ideal:

- eixo X: meses;
- eixo Y: demanda registrada (kW);
- linha da demanda contratada atual;
- linha da demanda ideal proposta;
- linha do limite sem ultrapassagem (demanda ideal × 1,05);
- destaque para meses que ficariam acima do limite.

Sem histórico suficiente, usar apenas card “prévia de demanda ideal” e pedir 12 faturas/memória de massa.

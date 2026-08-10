# Checklist de Qualidade

## Trava inquebrável — ESTUDO BESS Solar+BESS

Antes de entregar qualquer ESTUDO BESS:

- [ ] Consultar o modelo padrão Jardim Floresta Solar+BESS no workspace.
- [ ] Consultar o repositório local da skill `estudo-eficiencia-energetica`.
- [ ] Gerar o estudo como Solar+BESS, não como BESS isolado.
- [ ] Reconsultar o modelo padrão depois da geração.
- [ ] Reconsultar a skill/referências depois da geração.
- [ ] Validar CAPEX Solar+BESS = CAPEX FV + CAPEX BESS.
- [ ] Validar gráfico de economia acumulada/economia anual projetada.
- [ ] Validar gráfico de fluxo de caixa acumulado.
- [ ] Se qualquer item falhar, bloquear envio do HTML.

Antes de entregar HTML/PDF:

## Conteúdo

- [ ] Auditoria vem antes das oportunidades.
- [ ] Identificação da UC completa.
- [ ] Demanda analisada com contratada, registrada, utilização e ultrapassagem.
- [ ] Demanda ideal/preliminar incluída ou lacuna declarada.
- [ ] Custo médio de energia efetivo inclui demanda.
- [ ] Custo médio total da fatura separado.
- [ ] Reativo com valor e percentual.
- [ ] Benefício fiscal/isenção com valor e percentual.
- [ ] Oportunidades sem investimento aparecem antes das com CAPEX.
- [ ] BESS separado por energia e potência.
- [ ] Solar+BESS e Mercado Livre não são misturados no cálculo BESS puro.

## Visual

- [ ] Cabeçalho usa arquitetura real OPM.
- [ ] Logo Plugga oficial aparece.
- [ ] Gráficos pequenos onde precisam ser pequenos.
- [ ] Economia anual e fluxo de caixa têm tabela sintética embaixo.
- [ ] Próximos passos aparecem como timeline/mapa mental.
- [ ] Análise Técnica Plugga aparece antes dos próximos passos.
- [ ] Rodapé com logo Plugga.

## Cliente

- [ ] Sem fórmulas abertas.
- [ ] Sem valores financeiros abreviados.
- [ ] Sem termos internos: debug, teste, rascunho, corrigido, final, all-in, conforme Dilkson.
- [ ] PDF não quebra gráfico/tabela no meio de forma feia.
- [ ] Fundo claro e texto escuro nas áreas de leitura.

## Checklist adicional — demanda com histórico

- [ ] Se há 12 faturas/histórico, incluir gráfico de demanda ideal no item 3.
- [ ] Gráfico mostra demanda contratada atual, demanda ideal e limite sem ultrapassagem.
- [ ] Se não há histórico, card aparece como prévia e pede complemento.


## Checklist obrigatório ESTUDO BESS — dupla consulta

Antes de enviar HTML/PDF de ESTUDO BESS:

- [ ] Consulta inicial feita no modelo padrão Jardim Floresta.
- [ ] Consulta inicial feita no repositório da skill no workspace.
- [ ] Estudo tratado como Solar+BESS, não BESS isolado.
- [ ] CAPEX Solar+BESS = CAPEX FV + CAPEX BESS.
- [ ] Premissas conferidas: R$ 550.000/BESS e R$ 2.500/kWp FV, salvo exceção explícita.
- [ ] Consumo ponta, custo kWh ponta e demanda medida ponta conferidos.
- [ ] Gráfico fatura atual x cenários conferido contra o modelo.
- [ ] Gráfico de economia anual projetada conferido contra o modelo.
- [ ] Gráfico de fluxo de caixa acumulado conferido contra o modelo.
- [ ] Reconsulta final feita no modelo padrão Jardim Floresta.
- [ ] Reconsulta final feita na skill/referências/scripts.
- [ ] HTML bloqueado se qualquer item acima falhar.

import type {
  AuditResult,
  DemandResult,
  EnergyPremises,
  FinancialResult,
  InvoiceData,
  SavingsResult,
  SizingResult,
} from "@plugga/shared";

import { aplicarCabecalhoDoCaso, carregarEnvelope } from "./envelope.js";
import { dinheiro, escapar, numero, percentual, tarifa } from "./formato.js";
import { barras, CORES, linha } from "./graficos.js";
import { validarDocumento, type ProblemaDeValidacao } from "./validacao.js";

/**
 * Monta o relatório do estudo de eficiência energética.
 *
 * A estrutura é a das **regras**, não a do modelo: o envelope congelado dá CSS,
 * hero e rodapé, e as dez seções são geradas aqui — inclusive o card de análise
 * técnica e o gráfico de economia acumulada, que faltam no próprio modelo.
 *
 * Fórmula nenhuma aparece no documento. O cliente vê o que paga, onde está o
 * peso, qual o risco, qual a oportunidade e o que fazer agora.
 */

export type DadosDoCaso = {
  cliente: string;
  unidadeConsumidora: string;
  distribuidora: string;
  localidade: string;
  grupoModalidade: string;
  referencia: string;
  vencimento?: string;
};

export type EntradaDoRelatorio = {
  caso: DadosDoCaso;
  fatura: InvoiceData;
  premissas: EnergyPremises;
  auditoria: AuditResult;
  demanda: DemandResult;
  dimensionamento: SizingResult;
  economia: SavingsResult;
  financeiro: FinancialResult;
};

export type RelatorioGerado = {
  html: string;
  problemas: ProblemaDeValidacao[];
};

const kpi = (rotulo: string, valor: string, nota?: string): string =>
  `<div class="kpi"><span>${rotulo}</span><strong>${valor}</strong>${nota ? `<small>${nota}</small>` : ""}</div>`;

const linhaTabela = (celulas: readonly string[]): string =>
  `<tr>${celulas.map((c) => `<td>${c}</td>`).join("")}</tr>`;

const cabecalhoTabela = (celulas: readonly string[]): string =>
  `<tr>${celulas.map((c) => `<th>${c}</th>`).join("")}</tr>`;

function tabelaAnoAAno(titulo: string, valores: readonly number[], deslocamento = 1): string {
  const linhas = valores
    .map((valor, i) => linhaTabela([`Ano ${i + deslocamento}`, dinheiro(valor)]))
    .join("");
  return `<div class="year-table"><div class="tbl-title">${titulo}</div><table>${cabecalhoTabela(["Período", "Valor"])}${linhas}</table></div>`;
}

function secaoDemanda(entrada: EntradaDoRelatorio): string {
  const { demanda, fatura, dimensionamento } = entrada;

  const cenarios = demanda.cenarios
    .map((cenario) =>
      linhaTabela([
        cenario.chave === demanda.recomendado
          ? `<b>${cenario.chave}</b> (recomendado)`
          : cenario.chave,
        `${numero(cenario.demandaPropostaKw)} kW`,
        `${numero(cenario.limiteSemMultaKw, 1)} kW`,
        String(cenario.mesesComMulta),
        dinheiro(cenario.economiaMensal),
        cenario.classificacao.replace(/_/g, " "),
      ]),
    )
    .join("");

  // Sem cenário recomendado a leitura não é "faltou análise": é que o contrato
  // já está adequado. Dizer isso explicitamente evita o cliente achar que o
  // estudo ficou incompleto.
  const leitura =
    demanda.recomendado === null
      ? "A demanda contratada está aderente ao uso observado. Nenhum ajuste atinge o mínimo que justifica solicitação à distribuidora, portanto não há recomendação de alteração neste momento."
      : `O cenário recomendado mantém o limite sem ultrapassagem acima do maior registro observado na janela analisada, preservando margem de segurança.`;

  const ressalva = demanda.preliminar
    ? `<div class="note">Análise preliminar: baseada em ${numero(demanda.mesesDeHistorico)} ${demanda.mesesDeHistorico === 1 ? "fatura" : "faturas"}. A recomendação definitiva de demanda exige 12 meses de histórico ou memória de massa de 15 minutos.</div>`
    : "";

  return `<h2>3. Análise de demanda</h2>
<div class="grid">
${kpi("Demanda contratada", `${numero(fatura.demandaContratadaKw)} kW`)}
${kpi("Maior demanda registrada", `${numero(demanda.picoObservadoKw)} kW`)}
${kpi("Utilização do contrato", percentual(demanda.utilizacao * 100))}
${kpi("Ultrapassagem", demanda.houveUltrapassagem ? "Identificada" : "Não identificada")}
</div>
<table>${cabecalhoTabela(["Indicador", "Ponta", "Fora ponta", "Leitura"])}
${linhaTabela(["Demanda medida", `${numero(fatura.demandaMedidaPontaKw)} kW`, `${numero(fatura.demandaMedidaForaPontaKw)} kW`, "A demanda medida em ponta é a referência para dimensionar potência."])}
${linhaTabela(["Limite sem ultrapassagem", `${numero(demanda.toleranciaKw, 1)} kW`, `${numero(demanda.toleranciaKw, 1)} kW`, "Cinco por cento acima da demanda contratada."])}
${linhaTabela(["Dimensionamento por potência", `${numero(fatura.demandaMedidaPontaKw)} kW`, "—", `${dimensionamento.bessUnidadesPorPotencia} unidades necessárias por potência.`])}
${linhaTabela(["Dimensionamento por energia", `${numero(dimensionamento.consumoPontaDiarioKwh, 1)} kWh/dia`, "—", `${dimensionamento.bessUnidadesPorEnergia} unidades necessárias por energia.`])}
</table>
<div class="demand-box">
<div class="demand-head"><span>Demanda ociosa</span><strong>${dinheiro(demanda.ociosidadeMensal)}/mês</strong></div>
<div class="demand-grid">
<div><span>Contrato atual</span><b>${numero(fatura.demandaContratadaKw)} kW</b></div>
<div><span>Maior registro</span><b>${numero(demanda.picoObservadoKw)} kW</b></div>
<div><span>Limite sem ultrapassagem</span><b>${numero(demanda.toleranciaKw, 1)} kW</b></div>
</div>
<p>Demanda contratada acima do uso não gera penalidade, mas é valor pago sem contrapartida. ${leitura}</p>
</div>
<table>${cabecalhoTabela(["Cenário", "Demanda proposta", "Limite sem ultrapassagem", "Meses com penalidade", "Economia mensal", "Enquadramento"])}${cenarios}</table>
${ressalva}`;
}

function secaoOportunidades(entrada: EntradaDoRelatorio): string {
  const { economia, financeiro, dimensionamento, fatura, premissas } = entrada;

  const comparativo = barras(
    ["Fatura atual", "Com Solar+BESS", "Economia"],
    [fatura.valorTotal, economia.faturaProjetada, economia.economiaMensal],
    [CORES.petroleo, CORES.folha, CORES.ambar],
  );

  const rotulosAnos = financeiro.fluxoAnual.map((_, i) => String(i + 1));
  const rotulosFluxo = financeiro.fluxoCaixaAcumulado.map((_, i) => String(i));

  return `<h2>7. Oportunidades</h2>
<div class="note">O cenário principal é <b>Solar+BESS</b>. A geração solar reduz a energia comprada da rede e o banco de baterias desloca consumo do horário de ponta. O investimento considera os dois em conjunto.</div>
<div class="grid">
${kpi("Geração solar", `${numero(dimensionamento.fvKwp)} kWp`)}
${kpi("Banco de baterias", `${dimensionamento.bessUnidades} unidades`, premissas.bessModelo)}
${kpi("Investimento total", dinheiro(financeiro.capexTotal))}
${kpi("Economia mensal", dinheiro(economia.economiaMensal))}
</div>
<table class="scenario-table">${cabecalhoTabela(["Cenário", "Investimento", "Fatura projetada", "Economia mensal", "Economia no ano 1", "Leitura"])}
${linhaTabela(["Sem investimento", dinheiro(0), dinheiro(fatura.valorTotal), "—", "—", "A fatura permanece como está."])}
${linhaTabela(["<b>Solar+BESS</b>", dinheiro(financeiro.capexTotal), dinheiro(economia.faturaProjetada), dinheiro(economia.economiaMensal), dinheiro(economia.economiaAno1), "Cenário principal do estudo."])}
${linhaTabela(["Geração solar (referência técnica)", dinheiro(financeiro.capexFv), "Não se aplica isolado", dinheiro(economia.economiaFvMensal), dinheiro(economia.economiaFvMensal * 12), "Parcela solar dentro do conjunto."])}
${linhaTabela(["Baterias (referência técnica)", dinheiro(financeiro.capexBess), "Não se aplica isolado", dinheiro(economia.economiaBessMensal), dinheiro(economia.economiaBessMensal * 12), "Parcela de armazenamento dentro do conjunto."])}
</table>
<div class="chart-pair"><div class="mini-chart"><h3>Fatura atual e cenário Solar+BESS</h3>${comparativo}</div>
<div class="mini-chart"><h3>Composição do investimento</h3><div class="dim" style="margin:0;grid-template-columns:repeat(2,1fr)">
<div class="box"><b>${numero(dimensionamento.fvKwp)}</b><br><span>kWp de geração</span></div>
<div class="box"><b>${dimensionamento.bessUnidades}</b><br><span>unidades de bateria</span></div>
<div class="box"><b>${dinheiro(financeiro.capexFv)}</b><br><span>geração solar</span></div>
<div class="box"><b>${dinheiro(financeiro.capexBess)}</b><br><span>armazenamento</span></div>
</div></div></div>
<div class="grid3">
${kpi("Retorno simples", `${numero(financeiro.paybackSimplesAnos, 1)} anos`)}
${kpi("Retorno descontado", financeiro.paybackDescontadoAnos === null ? "Acima do horizonte" : `${numero(financeiro.paybackDescontadoAnos, 1)} anos`)}
${kpi("Valor presente líquido", dinheiro(financeiro.vpl))}
</div>
<div class="full-chart"><h3>Economia anual projetada — Solar+BESS</h3>${linha(financeiro.fluxoAnual, "economia anual (R$)", { incluirZero: true, rotulos: rotulosAnos })}${tabelaAnoAAno("Economia projetada ano a ano", financeiro.fluxoAnual)}</div>
<div class="full-chart"><h3>Economia acumulada projetada — Solar+BESS</h3>${linha(financeiro.economiaAcumulada, "economia acumulada (R$)", { incluirZero: true, rotulos: rotulosAnos })}${tabelaAnoAAno("Economia acumulada ano a ano", financeiro.economiaAcumulada)}</div>
<div class="full-chart"><h3>Fluxo de caixa acumulado — Solar+BESS</h3>${linha(financeiro.fluxoCaixaAcumulado, "fluxo acumulado (R$)", { incluirZero: true, rotulos: rotulosFluxo })}${tabelaAnoAAno("Fluxo de caixa acumulado", financeiro.fluxoCaixaAcumulado, 0)}</div>
<div class="note">Premissas do estudo: horizonte de ${numero(premissas.horizonteAnos)} anos, reajuste tarifário de ${percentual(premissas.reajusteTarifarioAnual * 100, 0)} ao ano e taxa mínima de atratividade de ${percentual(premissas.tmaAnual * 100, 0)} ao ano. Os valores de investimento são estimativa preliminar e não constituem orçamento fechado: dependem de projeto, instalação, adequações elétricas, operação e manutenção e cotação de fornecedor.</div>`;
}

export function gerarRelatorio(entrada: EntradaDoRelatorio): RelatorioGerado {
  const { caso, fatura, auditoria, economia, financeiro, dimensionamento } = entrada;
  const envelope = carregarEnvelope();

  const composicao = barras(
    ["Ponta", "Fora ponta", "Demanda", "Reativo"],
    [fatura.valorPonta, fatura.valorForaPonta, fatura.valorDemanda, fatura.valorReativo],
    [CORES.ambar, CORES.azul, CORES.roxo, CORES.vermelho],
  );

  const consumo = barras(
    ["Ponta", "Fora ponta"],
    [fatura.consumoPontaKwh, fatura.consumoForaPontaKwh],
    [CORES.ambar, CORES.azul],
    { mostrarValores: false },
  );

  const pesoPonta = (fatura.consumoPontaKwh / auditoria.consumoTotalKwh) * 100;

  const secoes = `<h2>1. Resumo executivo da fatura</h2>
<div class="grid">
${kpi("Valor total da fatura", dinheiro(fatura.valorTotal))}
${kpi("Referência", escapar(caso.referencia), caso.vencimento ? `vencimento ${escapar(caso.vencimento)}` : undefined)}
${kpi("Consumo total", `${numero(auditoria.consumoTotalKwh)} kWh`)}
${kpi("Custo médio total da fatura", `${dinheiro(auditoria.custoMedioTotal)}/kWh`)}
</div>
<div class="note">A energia consumida no horário de ponta representa ${percentual(pesoPonta)} do total, mas custa ${dinheiro(auditoria.custoKwhPonta)} por kWh contra ${dinheiro(auditoria.custoKwhForaPonta)} fora da ponta. Essa diferença é o que define onde está a oportunidade desta unidade.</div>

<h2>2. Identificação da unidade consumidora</h2>
<table>${cabecalhoTabela(["Campo", "Informação"])}
${linhaTabela(["Consumidor", escapar(caso.cliente)])}
${linhaTabela(["Unidade consumidora", escapar(caso.unidadeConsumidora)])}
${linhaTabela(["Distribuidora", escapar(caso.distribuidora)])}
${linhaTabela(["Localidade", escapar(caso.localidade)])}
${linhaTabela(["Grupo e modalidade", escapar(caso.grupoModalidade)])}
${linhaTabela(["Referência", escapar(caso.referencia)])}
</table>

${secaoDemanda(entrada)}

<h2>4. Consumo, custo médio efetivo e tarifa aplicada</h2>
<div class="grid">
${kpi("Consumo em ponta", `${numero(fatura.consumoPontaKwh)} kWh`, percentual(pesoPonta) + " do total")}
${kpi("Consumo fora ponta", `${numero(fatura.consumoForaPontaKwh)} kWh`)}
${kpi("Custo médio de energia", `${dinheiro(auditoria.custoMedioEfetivo)}/kWh`)}
${kpi("Custo médio total da fatura", `${dinheiro(auditoria.custoMedioTotal)}/kWh`)}
</div>
<table>${cabecalhoTabela(["Componente", "Base", "Tarifa aplicada", "Valor faturado", "Peso na fatura"])}
${linhaTabela(["Energia em ponta", `${numero(fatura.consumoPontaKwh)} kWh`, tarifa(fatura.tarifaPonta), dinheiro(fatura.valorPonta), percentual((fatura.valorPonta / fatura.valorTotal) * 100)])}
${linhaTabela(["Energia fora ponta", `${numero(fatura.consumoForaPontaKwh)} kWh`, tarifa(fatura.tarifaForaPonta), dinheiro(fatura.valorForaPonta), percentual((fatura.valorForaPonta / fatura.valorTotal) * 100)])}
${linhaTabela(["Demanda", `${numero(fatura.demandaContratadaKw)} kW`, "Conforme fatura", dinheiro(fatura.valorDemanda), percentual((fatura.valorDemanda / fatura.valorTotal) * 100)])}
</table>
<div class="note">O custo médio de energia considera energia e demanda; o custo médio total da fatura considera todos os componentes. A separação mostra quanto custa consumir e quanto custa a conta fechada.</div>

<h2>5. Composição da fatura, reativo e benefício fiscal</h2>
<div class="grid">
${kpi("Energia em ponta", dinheiro(fatura.valorPonta))}
${kpi("Energia fora ponta", dinheiro(fatura.valorForaPonta))}
${kpi("Demanda", dinheiro(fatura.valorDemanda))}
${kpi("Energia reativa", dinheiro(fatura.valorReativo), percentual(auditoria.reativoPercentual) + " da fatura")}
</div>
<div class="chart-pair"><div class="mini-chart"><h3>Consumo por posto horário</h3>${consumo}</div><div class="mini-chart"><h3>Composição econômica da fatura</h3>${composicao}</div></div>
<div class="note">A energia reativa representa ${percentual(auditoria.reativoPercentual)} da fatura. ${auditoria.reativoDiagnostico === "investigar" ? "O peso justifica investigação técnica do fator de potência." : auditoria.reativoDiagnostico === "atencao" ? "O peso merece acompanhamento nos próximos ciclos." : "O peso é baixo e cabe apenas monitoramento."}</div>

<h2>6. Diagnóstico e recomendações da auditoria</h2>
<div class="note">A auditoria identifica ${auditoria.reativoDiagnostico === "registrar" ? "fatura controlada em energia reativa" : "energia reativa com peso relevante"} e custo de ponta ${numero(auditoria.custoKwhPonta / Math.max(auditoria.custoKwhForaPonta, 0.000001), 1)} vezes superior ao fora ponta. Antes de qualquer investimento, recomenda-se validar tarifa homologada, regra tributária e benefício fiscal aplicável, além de reunir histórico de doze meses e memória de massa de quinze minutos.</div>

${secaoOportunidades(entrada)}

<div class="analysis"><div class="eyebrow">ANÁLISE TÉCNICA</div>
<h2>Análise de eficiência energética</h2>
<p>A unidade apresenta consumo de ${numero(auditoria.consumoTotalKwh)} kWh no período, com ${percentual(pesoPonta)} concentrados no horário de ponta a um custo de ${dinheiro(auditoria.custoKwhPonta)} por kWh.</p>
<p>O cenário Solar+BESS preliminar considera ${numero(dimensionamento.fvKwp)} kWp de geração e ${dimensionamento.bessUnidades} ${dimensionamento.bessUnidades === 1 ? "unidade" : "unidades"} de armazenamento, com investimento estimado de ${dinheiro(financeiro.capexTotal)} e economia mensal projetada de ${dinheiro(economia.economiaMensal)}.</p>
<p><b>Recomendação Plugga:</b> avançar para validação técnica e comercial com histórico de doze meses, memória de massa, confirmação de área disponível, parecer de conexão e cotação de fornecedor antes de proposta fechada.</p></div>

<h2>8. Próximos passos</h2>
<div class="timeline">
<div class="step"><div class="num">1</div><h3>Enviar histórico</h3><p>Reunir doze faturas para confirmar sazonalidade, demanda e consumo em ponta.</p></div>
<div class="step"><div class="num">2</div><h3>Memória de massa</h3><p>Enviar medição de quinze minutos para validar potência real e duração da ponta.</p></div>
<div class="step"><div class="num">3</div><h3>Validar bases</h3><p>Confirmar tarifa homologada, regra tributária e benefício fiscal aplicável.</p></div>
<div class="step"><div class="num">4</div><h3>Área e conexão</h3><p>Validar área disponível, conexão, proteção e restrições da distribuidora.</p></div>
<div class="step"><div class="num">5</div><h3>Obter cotações</h3><p>Cotar projeto, instalação, fornecimento, operação e manutenção.</p></div>
</div>`;

  // O hero do modelo carrega o cliente, a UC e a distribuidora do caso-fonte.
  // Sem esta troca, o relatório sai com o nome de outro cliente no topo — e a
  // validação abaixo bloqueia justamente esse resíduo.
  const identificacao =
    `Cliente <b>${escapar(caso.cliente)}</b> • UC ${escapar(caso.unidadeConsumidora)} • ` +
    `${escapar(caso.distribuidora)} • Referência ${escapar(caso.referencia)} • ` +
    "Base de análise: fatura cativa e oportunidades energéticas";

  const etiquetas = [
    escapar(caso.grupoModalidade),
    escapar(caso.localidade),
    entrada.demanda.preliminar
      ? `Análise preliminar · ${numero(entrada.demanda.mesesDeHistorico)} ${entrada.demanda.mesesDeHistorico === 1 ? "fatura" : "faturas"}`
      : "Histórico completo",
  ];

  const cabecalho = aplicarCabecalhoDoCaso(envelope.cabecalho, identificacao, etiquetas);
  const html = cabecalho + secoes + "\n" + envelope.rodape;

  return {
    html,
    problemas: validarDocumento({
      html,
      capexFv: financeiro.capexFv,
      capexBess: financeiro.capexBess,
      capexTotal: financeiro.capexTotal,
    }),
  };
}

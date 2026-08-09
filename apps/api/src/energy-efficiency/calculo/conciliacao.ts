import type {
  InvoiceContext,
  InvoiceData,
  ProblemaDeValidacao,
  ReconciledInvoiceItem,
  ReconciledInvoiceItemCategory,
  ReconciliationProof,
} from "@plugga/shared";

const TOLERANCIA_TOTAL = 0.005;
const TOLERANCIA_ITEM = 0.06;
const TOLERANCIA_CAMPO_MONETARIO = 0.01;
const TOLERANCIA_CAMPO_QUANTIDADE = 0.001;
const TOLERANCIA_CAMPO_TARIFA = 0.000001;

export type ResultadoConciliacao = {
  prova: ReconciliationProof;
  problemas: ProblemaDeValidacao[];
};

const itensDaCategoria = (
  contexto: InvoiceContext,
  categoria: ReconciledInvoiceItemCategory,
): ReconciledInvoiceItem[] => contexto.itens.filter((item) => item.categoria === categoria);

const somaValores = (itens: readonly ReconciledInvoiceItem[]): number =>
  itens.reduce((soma, item) => soma + item.valor, 0);

const somaQuantidades = (itens: readonly ReconciledInvoiceItem[]): number =>
  itens.reduce((soma, item) => soma + (item.quantidade ?? 0), 0);

function compararCampo(
  problemas: ProblemaDeValidacao[],
  campo: string,
  informado: number,
  conciliado: number,
  tolerancia: number,
): void {
  if (Math.abs(informado - conciliado) <= tolerancia) return;
  problemas.push({
    regra: "conciliacao_campo",
    detalhe: `${campo}: snapshot informa ${informado}, mas os itens conciliados provam ${conciliado}`,
  });
}

function exigirCategoria(
  contexto: InvoiceContext,
  problemas: ProblemaDeValidacao[],
  categoria: ReconciledInvoiceItemCategory,
  rotulo: string,
): ReconciledInvoiceItem[] {
  const itens = itensDaCategoria(contexto, categoria);
  if (itens.length === 0) {
    problemas.push({
      regra: "conciliacao_campo_ausente",
      detalhe: `a conciliação não contém a prova de ${rotulo}`,
    });
  }
  return itens;
}

function conferirEnergia(
  fatura: InvoiceData,
  contexto: InvoiceContext,
  problemas: ProblemaDeValidacao[],
  posto: "ponta" | "fora_ponta",
): void {
  const categoria: ReconciledInvoiceItemCategory =
    posto === "ponta" ? "consumo_ponta" : "consumo_fora_ponta";
  const rotulo = posto === "ponta" ? "consumo em ponta" : "consumo fora ponta";
  const itens = exigirCategoria(contexto, problemas, categoria, rotulo);
  if (itens.length === 0) return;

  if (
    itens.some(
      (item) =>
        !item.compoeTotal ||
        item.unidade !== "kWh" ||
        item.quantidade === null ||
        item.tarifa === null,
    )
  ) {
    problemas.push({
      regra: "conciliacao_campo",
      detalhe: `${rotulo}: cada linha precisa informar quantidade em kWh e tarifa`,
    });
    return;
  }

  const quantidade = somaQuantidades(itens);
  const valor = somaValores(itens);
  const tarifaMedia = quantidade > 0 ? valor / quantidade : 0;
  const consumoInformado =
    posto === "ponta" ? fatura.consumoPontaKwh : fatura.consumoForaPontaKwh;
  const valorInformado = posto === "ponta" ? fatura.valorPonta : fatura.valorForaPonta;
  const tarifaInformada = posto === "ponta" ? fatura.tarifaPonta : fatura.tarifaForaPonta;

  compararCampo(
    problemas,
    `${rotulo} (kWh)`,
    consumoInformado,
    quantidade,
    TOLERANCIA_CAMPO_QUANTIDADE,
  );
  compararCampo(
    problemas,
    `${rotulo} (R$)`,
    valorInformado,
    valor,
    TOLERANCIA_CAMPO_MONETARIO,
  );
  compararCampo(
    problemas,
    `${rotulo} (tarifa)`,
    tarifaInformada,
    tarifaMedia,
    Math.max(TOLERANCIA_CAMPO_TARIFA, Math.abs(tarifaInformada) * 0.001),
  );
}

function conferirDemanda(
  fatura: InvoiceData,
  contexto: InvoiceContext,
  problemas: ProblemaDeValidacao[],
): void {
  const faturada =
    fatura.valorDemanda > 0
      ? exigirCategoria(contexto, problemas, "demanda_faturada", "valor faturado de demanda")
      : itensDaCategoria(contexto, "demanda_faturada");
  if (faturada.some((item) => !item.compoeTotal)) {
    problemas.push({
      regra: "conciliacao_campo",
      detalhe: "valor faturado de demanda: cada linha deve compor o total",
    });
  }
  if (
    fatura.valorDemanda > 0 &&
    faturada.some(
      (item) => item.unidade !== "kW" || item.quantidade === null || item.tarifa === null,
    )
  ) {
    problemas.push({
      regra: "conciliacao_campo",
      detalhe: "valor faturado de demanda: cada linha precisa informar quantidade em kW e tarifa",
    });
  }
  compararCampo(
    problemas,
    "valor de demanda (R$)",
    fatura.valorDemanda,
    somaValores(faturada),
    TOLERANCIA_CAMPO_MONETARIO,
  );
  const quantidadeFaturada = somaQuantidades(faturada);
  const tarifaEfetiva = quantidadeFaturada > 0 ? somaValores(faturada) / quantidadeFaturada : 0;
  if (fatura.valorDemanda > 0) {
    compararCampo(
      problemas,
      "tarifa de demanda (R$/kW)",
      fatura.tarifaDemanda ?? 0,
      tarifaEfetiva,
      Math.max(
        TOLERANCIA_CAMPO_TARIFA,
        Math.abs(fatura.tarifaDemanda ?? 0) * 0.001,
      ),
    );
  }

  const campos = [
    ["demanda_contratada", "demanda contratada", fatura.demandaContratadaKw],
    ["demanda_medida_ponta", "demanda medida em ponta", fatura.demandaMedidaPontaKw],
    [
      "demanda_medida_fora_ponta",
      "demanda medida fora ponta",
      fatura.demandaMedidaForaPontaKw,
    ],
  ] as const;

  for (const [categoria, rotulo, informado] of campos) {
    const itens = exigirCategoria(contexto, problemas, categoria, rotulo);
    if (itens.length === 0) continue;
    if (itens.some((item) => item.compoeTotal || item.unidade !== "kW" || item.quantidade === null)) {
      problemas.push({
        regra: "conciliacao_campo",
        detalhe: `${rotulo}: a prova deve ser metadado fora do total, com quantidade em kW`,
      });
      continue;
    }
    compararCampo(
      problemas,
      `${rotulo} (kW)`,
      informado,
      somaQuantidades(itens),
      TOLERANCIA_CAMPO_QUANTIDADE,
    );
  }
}

function conferirComponenteMonetario(
  fatura: InvoiceData,
  contexto: InvoiceContext,
  problemas: ProblemaDeValidacao[],
  categoria: "reativo" | "beneficio_fiscal" | "multas_juros_encargos",
  campo: "valorReativo" | "valorBeneficioFiscal" | "valorMultasJurosEncargos",
  rotulo: string,
): void {
  const informado = fatura[campo];
  const itens =
    informado > 0
      ? exigirCategoria(contexto, problemas, categoria, rotulo)
      : itensDaCategoria(contexto, categoria);
  const conciliado = somaValores(itens);
  if (itens.some((item) => !item.compoeTotal)) {
    problemas.push({
      regra: "conciliacao_campo",
      detalhe: `${rotulo}: cada linha deve compor o total`,
    });
  }
  compararCampo(
    problemas,
    `${rotulo} (R$)`,
    informado,
    categoria === "beneficio_fiscal" ? Math.abs(conciliado) : conciliado,
    TOLERANCIA_CAMPO_MONETARIO,
  );
}

/** TRAVA 1 do PRD: a fatura precisa provar a si mesma antes do motor. */
export function conciliarFatura(
  fatura: InvoiceData,
  contexto: InvoiceContext,
): ResultadoConciliacao {
  const somaItens = contexto.itens
    .filter((item) => item.compoeTotal)
    .reduce((soma, item) => soma + item.valor, 0);
  const diferenca = somaItens - fatura.valorTotal;
  const problemas: ProblemaDeValidacao[] = [];
  let itensConferidos = 0;
  let itensSemConferencia = 0;

  if (Math.abs(diferenca) > TOLERANCIA_TOTAL) {
    problemas.push({
      regra: "conciliacao_total",
      detalhe:
        `soma dos itens (R$ ${somaItens.toFixed(2)}) difere do total ` +
        `(R$ ${fatura.valorTotal.toFixed(2)}) em R$ ${diferenca.toFixed(2)}; ` +
        "corrija a extração, nunca ajuste o total para fechar",
    });
  }

  for (const item of contexto.itens) {
    if (!item.compoeTotal) continue;
    if (item.quantidade === null || item.tarifa === null) {
      itensSemConferencia += 1;
      continue;
    }
    const esperado = item.quantidade * item.tarifa;
    const tolerancia = Math.max(TOLERANCIA_ITEM, Math.abs(item.valor) * 0.001);
    if (Math.abs(esperado - item.valor) > tolerancia) {
      problemas.push({
        regra: "conciliacao_item",
        detalhe: `${item.nome}: ${item.quantidade} × ${item.tarifa} = R$ ${esperado.toFixed(2)}, mas o item informa R$ ${item.valor.toFixed(2)}`,
      });
    } else {
      itensConferidos += 1;
    }
  }

  conferirEnergia(fatura, contexto, problemas, "ponta");
  conferirEnergia(fatura, contexto, problemas, "fora_ponta");
  conferirDemanda(fatura, contexto, problemas);
  conferirComponenteMonetario(fatura, contexto, problemas, "reativo", "valorReativo", "energia reativa");
  conferirComponenteMonetario(
    fatura,
    contexto,
    problemas,
    "beneficio_fiscal",
    "valorBeneficioFiscal",
    "benefício fiscal",
  );
  conferirComponenteMonetario(
    fatura,
    contexto,
    problemas,
    "multas_juros_encargos",
    "valorMultasJurosEncargos",
    "multas, juros e encargos",
  );

  const demandaRegistrada = Math.max(
    fatura.demandaMedidaPontaKw,
    fatura.demandaMedidaForaPontaKw,
  );
  if (demandaRegistrada > fatura.demandaContratadaKw * 1.05) {
    const declarouUltrapassagem = contexto.itens.some((item) =>
      item.nome.toLocaleLowerCase("pt-BR").includes("ultrapass"),
    );
    if (!declarouUltrapassagem) {
      problemas.push({
        regra: "ultrapassagem_ausente",
        detalhe:
          `demanda registrada ${demandaRegistrada} kW supera contratada + 5% ` +
          "sem item de ultrapassagem declarado",
      });
    }
  }

  return {
    prova: {
      somaItens,
      total: fatura.valorTotal,
      diferenca,
      itensConferidos,
      itensSemConferencia,
    },
    problemas,
  };
}

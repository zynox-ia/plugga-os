import type {
  InvoiceData,
  ReconciledInvoiceItem,
  ReconciledInvoiceItemCategory,
} from "@plugga/shared";

const semAcentos = (texto: string): string =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

/** Sugestão inicial; o operador confirma a categoria no editor. */
export function inferirCategoriaDaLinha(rotulo: string): ReconciledInvoiceItemCategory {
  const texto = semAcentos(rotulo);
  if (texto.includes("demanda")) return "demanda_faturada";
  if (texto.includes("fora ponta") || texto.includes("fora de ponta")) {
    return "consumo_fora_ponta";
  }
  if (texto.includes("ponta")) return "consumo_ponta";
  if (texto.includes("reativ")) return "reativo";
  if (texto.includes("beneficio") || texto.includes("subvenc")) return "beneficio_fiscal";
  if (texto.includes("multa") || texto.includes("juros") || texto.includes("encargo")) {
    return "multas_juros_encargos";
  }
  return "outros";
}

const numero = (valor: string | number | undefined): number => {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
};

export type CamposDaConciliacao = Pick<
  InvoiceData,
  | "valorTotal"
  | "consumoPontaKwh"
  | "consumoForaPontaKwh"
  | "tarifaPonta"
  | "tarifaForaPonta"
  | "valorPonta"
  | "valorForaPonta"
  | "valorDemanda"
  | "tarifaDemanda"
  | "demandaContratadaKw"
  | "demandaMedidaPontaKw"
  | "demandaMedidaForaPontaKw"
  | "valorReativo"
  | "valorBeneficioFiscal"
  | "valorMultasJurosEncargos"
>;

export function camposDaFicha(ficha: Record<string, string>): CamposDaConciliacao {
  return {
    valorTotal: numero(ficha.valorTotal),
    consumoPontaKwh: numero(ficha.consumoPontaKwh),
    consumoForaPontaKwh: numero(ficha.consumoForaPontaKwh),
    tarifaPonta: numero(ficha.tarifaPonta),
    tarifaForaPonta: numero(ficha.tarifaForaPonta),
    valorPonta: numero(ficha.valorPonta),
    valorForaPonta: numero(ficha.valorForaPonta),
    valorDemanda: numero(ficha.valorDemanda),
    tarifaDemanda: numero(ficha.tarifaDemanda),
    demandaContratadaKw: numero(ficha.demandaContratadaKw),
    demandaMedidaPontaKw: numero(ficha.demandaMedidaPontaKw),
    demandaMedidaForaPontaKw: numero(ficha.demandaMedidaForaPontaKw),
    valorReativo: numero(ficha.valorReativo),
    valorBeneficioFiscal: numero(ficha.valorBeneficioFiscal),
    valorMultasJurosEncargos: numero(ficha.valorMultasJurosEncargos),
  };
}

function metadadosDeDemanda(campos: CamposDaConciliacao): ReconciledInvoiceItem[] {
  return [
    {
      nome: "Demanda contratada",
      categoria: "demanda_contratada",
      compoeTotal: false,
      valor: 0,
      quantidade: campos.demandaContratadaKw,
      unidade: "kW",
      tarifa: null,
    },
    {
      nome: "Demanda medida em ponta",
      categoria: "demanda_medida_ponta",
      compoeTotal: false,
      valor: 0,
      quantidade: campos.demandaMedidaPontaKw,
      unidade: "kW",
      tarifa: null,
    },
    {
      nome: "Demanda medida fora ponta",
      categoria: "demanda_medida_fora_ponta",
      compoeTotal: false,
      valor: 0,
      quantidade: campos.demandaMedidaForaPontaKw,
      unidade: "kW",
      tarifa: null,
    },
  ];
}

const proximos = (a: number, b: number, tolerancia: number): boolean =>
  Math.abs(a - b) <= tolerancia;

export type AvaliacaoConciliacaoLocal = {
  itens: ReconciledInvoiceItem[];
  soma: number;
  diferenca: number;
  multiplicacoesInvalidas: number;
  camposInvalidos: string[];
  pronta: boolean;
};

export function avaliarConciliacaoLocal(
  itensCobrados: readonly ReconciledInvoiceItem[],
  campos: CamposDaConciliacao,
): AvaliacaoConciliacaoLocal {
  const itens = [
    ...itensCobrados.map((item) => ({ ...item, compoeTotal: true })),
    ...metadadosDeDemanda(campos),
  ];
  const soma = itensCobrados.reduce((total, item) => total + item.valor, 0);
  const diferenca = soma - campos.valorTotal;
  const multiplicacoesInvalidas = itensCobrados.filter((item) => {
    if (item.quantidade === null || item.tarifa === null) return false;
    return (
      Math.abs(item.quantidade * item.tarifa - item.valor) >
      Math.max(0.06, Math.abs(item.valor) * 0.001)
    );
  }).length;
  const camposInvalidos: string[] = [];
  const daCategoria = (categoria: ReconciledInvoiceItemCategory) =>
    itensCobrados.filter((item) => item.categoria === categoria);
  const somaValores = (categoria: ReconciledInvoiceItemCategory) =>
    daCategoria(categoria).reduce((total, item) => total + item.valor, 0);
  const somaQuantidades = (categoria: ReconciledInvoiceItemCategory) =>
    daCategoria(categoria).reduce((total, item) => total + (item.quantidade ?? 0), 0);

  for (const [categoria, rotulo, quantidade, valor] of [
    ["consumo_ponta", "ponta", campos.consumoPontaKwh, campos.valorPonta],
    ["consumo_fora_ponta", "fora ponta", campos.consumoForaPontaKwh, campos.valorForaPonta],
  ] as const) {
    const linhas = daCategoria(categoria);
    if (
      linhas.length === 0 ||
      linhas.some(
        (item) =>
          item.quantidade === null || item.tarifa === null || item.unidade !== "kWh",
      ) ||
      !proximos(somaQuantidades(categoria), quantidade, 0.001) ||
      !proximos(somaValores(categoria), valor, 0.01)
    ) {
      camposInvalidos.push(rotulo);
    }
  }

  for (const [categoria, rotulo, valor] of [
    ["demanda_faturada", "demanda faturada", campos.valorDemanda],
    ["reativo", "energia reativa", campos.valorReativo],
    ["multas_juros_encargos", "multas/juros/encargos", campos.valorMultasJurosEncargos],
  ] as const) {
    if (!proximos(somaValores(categoria), valor, 0.01)) camposInvalidos.push(rotulo);
  }
  const linhasDemanda = daCategoria("demanda_faturada");
  const quantidadeDemanda = somaQuantidades("demanda_faturada");
  if (
    campos.valorDemanda > 0 &&
    (linhasDemanda.some(
      (item) => item.quantidade === null || item.tarifa === null || item.unidade !== "kW",
    ) ||
      quantidadeDemanda === 0 ||
      !proximos(
        somaValores("demanda_faturada") / quantidadeDemanda,
        campos.tarifaDemanda ?? 0,
        Math.max(0.000001, Math.abs(campos.tarifaDemanda ?? 0) * 0.001),
      ))
  ) {
    camposInvalidos.push("tarifa de demanda");
  }
  if (!proximos(Math.abs(somaValores("beneficio_fiscal")), campos.valorBeneficioFiscal, 0.01)) {
    camposInvalidos.push("benefício fiscal");
  }

  return {
    itens,
    soma,
    diferenca,
    multiplicacoesInvalidas,
    camposInvalidos,
    pronta:
      itensCobrados.length > 0 &&
      Math.abs(diferenca) <= 0.005 &&
      multiplicacoesInvalidas === 0 &&
      camposInvalidos.length === 0,
  };
}

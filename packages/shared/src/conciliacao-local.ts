import type {
  InvoiceData,
  InvoiceReadingItem,
  ReconciledInvoiceItem,
  ReconciledInvoiceItemCategory,
} from "./energy-efficiency.js";

/**
 * A prontidão da conciliação, julgada sem servidor.
 *
 * É o que decide se o botão de abrir o estudo nasce habilitado: a soma das
 * linhas fecha com o total impresso, cada multiplicação fecha, e os campos
 * críticos da ficha batem com as linhas que os alimentam.
 *
 * **Por que isto mora em `shared` e não na tela.** Ele nasceu em
 * `apps/web/app/components/conciliacao-model.ts` e o defeito de 11/08/2026
 * mostrou o preço: nenhum teste conseguia atravessar a fronteira
 * servidor→tela, porque o leitor mora na API e o julgamento morava no
 * navegador. O corpus podia crescer para cem faturas e continuaria cego ao
 * caminho que o usuário percorre. Aqui os dois lados alcançam o mesmo código, e
 * `conciliacao.corpus.spec.ts` na API prova, fatura real por fatura real, o
 * veredicto que a tela vai dar.
 *
 * "Local" continua querendo dizer *sem ida ao servidor* — não *só na tela*.
 */

/**
 * O item lido virando linha da conciliação — sem redecidir nada.
 *
 * É a costura onde o defeito de 11/08/2026 morava: aqui a tela chamava um
 * classificador próprio, com um vocabulário paralelo ao do leitor. Agora todo
 * campo vem do que foi lido, e a função mora junto do julgamento para que o
 * teste de corpus atravesse **esta** costura, e não uma cópia dela — foi
 * justamente uma cópia que deixou o corpus cego ao caminho do navegador.
 *
 * O que a pessoa fizer depois disso no editor é dela; o que sai daqui é a
 * sugestão do leitor, inteira.
 */
export function itensParaConciliar(
  itens: readonly InvoiceReadingItem[],
): ReconciledInvoiceItem[] {
  return itens.map((item) => ({
    nome: item.rotulo,
    categoria: item.categoria,
    compoeTotal: item.compoeTotal,
    valor: item.valor,
    quantidade: item.quantidade,
    unidade: item.unidade,
    tarifa: item.tarifa,
  }));
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
  const itens = [...itensCobrados.map((item) => ({ ...item })), ...metadadosDeDemanda(campos)];
  // A soma que tem de fechar com o total é a soma de quem **compõe** o total.
  //
  // Antes daqui saía a soma de tudo, e `itens` ainda reescrevia `compoeTotal`
  // para `true` em toda linha cobrada — o que apagava, na hora de salvar, a
  // marcação que o leitor tinha feito e que a pessoa podia ter feito à mão. As
  // duas coisas juntas tinham três efeitos, todos medidos contra o corpus em
  // 11/08/2026:
  //
  // - a Santa Tereza e a Jardim Floresta nunca ficavam prontas. O leitor prova
  //   pela aritmética que a "Adicional Bandeira Amarela" é informativa e a marca
  //   fora do total; a tela a somava de volta, e a diferença que sobrava era
  //   exatamente o valor da bandeira — R$ 3.774,59 e R$ 1.491,05;
  // - desmarcar "compõe o total" no editor não adiantava: a soma ignorava a
  //   marcação, então não havia como destravar a fatura à mão;
  // - e se houvesse, a marcação era descartada no envio, de forma que
  //   `faturaNormativaDoSistema` receberia a bandeira dentro de `itens` em vez de
  //   `naoCobrados`, e a Trava 1 do servidor reprovaria o estudo.
  //
  // O servidor sempre respeitou o campo; quem não respeitava era a tela.
  const soma = itensCobrados
    .filter((item) => item.compoeTotal)
    .reduce((total, item) => total + item.valor, 0);
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
  // A média só descreve a fatura quando há uma tarifa de demanda. A Santa
  // Tereza tem duas linhas — `Demanda Ponta sem ICMS` a 22,16 e `com ICMS` a
  // 27,70 —, e a média delas (26,23) nunca ia bater com o campo `tarifaDemanda`
  // (27,70), que guarda uma só. A comparação reprovava uma fatura correta.
  //
  // Com mais de uma linha a prova certa é a que a fatura já oferece: cada linha
  // fecha na própria multiplicação — conferida acima, em `multiplicacoesInvalidas`
  // — e a soma das linhas bate com o valor de demanda, conferida logo antes
  // daqui. A média deixa de ser exigida porque deixou de significar algo.
  const umaTarifaSo = linhasDemanda.length <= 1;
  if (
    campos.valorDemanda > 0 &&
    (linhasDemanda.some(
      (item) => item.quantidade === null || item.tarifa === null || item.unidade !== "kW",
    ) ||
      quantidadeDemanda === 0 ||
      (umaTarifaSo &&
        !proximos(
          somaValores("demanda_faturada") / quantidadeDemanda,
          campos.tarifaDemanda ?? 0,
          Math.max(0.000001, Math.abs(campos.tarifaDemanda ?? 0) * 0.001),
        )))
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

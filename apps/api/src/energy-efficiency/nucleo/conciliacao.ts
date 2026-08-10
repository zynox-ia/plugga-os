import type {
  FaturaNormativa,
  ItemDaFatura,
  ProblemaDaConciliacao,
  ResultadoDaConciliacao,
} from "@plugga/shared";

/**
 * TRAVA 1 — conciliação da fatura.
 *
 * Port fiel de `assets/conciliar_fatura.py` do pacote normativo.
 *
 * O maior risco da produção de relatórios não é layout nem conta: é erro de
 * extração. Esta trava exige a prova aritmética antes de qualquer estudo — a
 * soma dos itens extraídos tem que bater com o total da fatura ao centavo. Sem
 * essa prova, o motor não roda e o relatório não nasce.
 *
 * Foi essa checagem que revelou, em Santa Tereza 06/2026, que a "Adicional
 * Bandeira Amarela" era informativa e não entrava no total — um erro que teria
 * contaminado o estudo inteiro.
 *
 * A regra de ouro está no próprio script: corrija a extração, **nunca ajuste o
 * total para fechar**.
 */

/** Meio centavo: um centavo de diferença já reprova. */
export const TOLERANCIA_DO_TOTAL = 0.005;

/** Tarifa × quantidade contra o valor do item, para absorver arredondamento. */
export const TOLERANCIA_DO_ITEM = 0.06;

/** Acima disso a demanda registrada exige item de ultrapassagem declarado. */
export const FOLGA_DA_DEMANDA_CONTRATADA = 1.05;

/** Campos sem os quais a extração está incompleta e nada mais é conferido. */
const OBRIGATORIOS = [
  "cliente",
  "uc",
  "distribuidora",
  "regime",
  "modalidade",
  "referencia",
  "vencimento",
  "total",
  "itens",
  "consumoPontaKwh",
  "consumoFpKwh",
  "demandaContratadaKw",
] as const satisfies readonly (keyof FaturaNormativa)[];

function ausente(valor: unknown): boolean {
  return (
    valor === undefined ||
    valor === null ||
    valor === "" ||
    (Array.isArray(valor) && valor.length === 0)
  );
}

function quantidadeDoItem(item: ItemDaFatura): number | undefined {
  return item.kwh ?? item.kw;
}

/**
 * Soma como o oráculo soma.
 *
 * Desde a 3.12 o `sum()` do CPython usa somatório compensado de Neumaier para
 * floats. Somar ingenuamente da esquerda para a direita diverge em 5 das 27
 * faturas do corpus — em Jatuarana a soma ingênua deixa um resíduo de
 * −1,46e−11 onde o oráculo fecha em zero exato, e em Alvorada II acontece o
 * contrário. Nenhuma das duas reprova a fatura, mas as duas mudariam a prova
 * gravada, e a prova é comparada ao centavo contra o oráculo.
 *
 * O harness pegaria isso de qualquer jeito; reproduzir o algoritmo é mais
 * honesto do que afrouxar a comparação.
 */
export function somarComoOOraculo(valores: readonly number[]): number {
  let soma = 0;
  let compensacao = 0;

  for (const valor of valores) {
    const parcial = soma + valor;
    compensacao +=
      Math.abs(soma) >= Math.abs(valor)
        ? soma - parcial + valor
        : valor - parcial + soma;
    soma = parcial;
  }

  return soma + compensacao;
}

/**
 * Arredonda como o `round()` do Python: empate vai para o par, não para longe
 * do zero como faz o `Math.round`. O zero negativo é preservado, porque o
 * oráculo grava `-0.0` quando a diferença é um resíduo negativo.
 */
function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  const escalado = valor * fator;
  const piso = Math.floor(escalado);
  const resto = escalado - piso;

  let inteiro: number;
  if (resto > 0.5) inteiro = piso + 1;
  else if (resto < 0.5) inteiro = piso;
  else inteiro = piso % 2 === 0 ? piso : piso + 1;

  const resultado = inteiro / fator;
  return resultado === 0 && (valor < 0 || Object.is(valor, -0))
    ? -0
    : resultado;
}

function formatar(valor: number): string {
  return valor.toFixed(2);
}

/**
 * A ordem importa e é a do oráculo: campos obrigatórios primeiro — sem eles
 * nada mais é conferido —, depois a soma, depois as coerências, e por último a
 * nota fiscal do mercado livre.
 */
export function conciliarFatura(fatura: FaturaNormativa): ResultadoDaConciliacao {
  const soma = somarComoOOraculo(fatura.itens.map((item) => item.valor));
  const diferenca = soma - fatura.total;
  const prova = {
    somaItens: arredondar(soma, 2),
    total: fatura.total,
    diferenca: arredondar(diferenca, 4),
  };
  const foraDoTotal = fatura.naoCobrados ?? [];

  const faltando: ProblemaDaConciliacao[] = OBRIGATORIOS.filter((campo) =>
    ausente(fatura[campo]),
  ).map((campo) => ({
    regra: "campo_obrigatorio" as const,
    detalhe: `campo obrigatório ausente: ${campo}`,
  }));
  if (faltando.length > 0) {
    return { conciliada: false, prova, problemas: faltando, foraDoTotal };
  }

  // 1) Prova central: soma dos itens == total da fatura.
  if (Math.abs(diferenca) > TOLERANCIA_DO_TOTAL) {
    return {
      conciliada: false,
      prova,
      problemas: [
        {
          regra: "soma_dos_itens",
          detalhe:
            `soma dos itens (R$ ${formatar(soma)}) != total da fatura ` +
            `(R$ ${formatar(fatura.total)}). Diferença: R$ ${formatar(diferenca)}. ` +
            "Causas comuns: item informativo somado, item esquecido, valor digitado " +
            "errado. Corrija a extração — nunca ajuste o total para fechar.",
        },
      ],
      foraDoTotal,
    };
  }

  const problemas: ProblemaDaConciliacao[] = [];

  // 2) Coerência item a item: tarifa × quantidade ≈ valor.
  for (const item of fatura.itens) {
    const quantidade = quantidadeDoItem(item);
    if (quantidade === undefined || item.tarifa === undefined) continue;

    const calculado = quantidade * item.tarifa;
    const folga = Math.max(TOLERANCIA_DO_ITEM, Math.abs(item.valor) * 0.001);
    if (Math.abs(calculado - item.valor) > folga) {
      problemas.push({
        regra: "item_incoerente",
        detalhe:
          `item '${item.nome}': ${quantidade} x ${item.tarifa} = ` +
          `${formatar(calculado)}, mas valor extraído é ${formatar(item.valor)}`,
      });
    }
  }

  // 3) Demanda registrada acima da contratada + 5% exige ultrapassagem declarada.
  const registrada = Math.max(
    fatura.demandaRegistradaPontaKw ?? 0,
    fatura.demandaRegistradaFpKw ?? 0,
  );
  if (registrada > fatura.demandaContratadaKw * FOLGA_DA_DEMANDA_CONTRATADA) {
    const nomes = fatura.itens
      .map((item) => `${item.nome} ${item.detalhe ?? ""}`.toLowerCase())
      .join(" ");
    if (!nomes.includes("ultrapassagem") && !fatura.ultrapassagemValor) {
      problemas.push({
        regra: "ultrapassagem",
        detalhe:
          `demanda registrada ${registrada} kW > contratada+5% e não há item ` +
          "de ultrapassagem — conferir fatura",
      });
    }
  }

  if (problemas.length > 0) {
    return { conciliada: false, prova, problemas, foraDoTotal };
  }

  // 4) Mercado livre: o preço da energia é derivado, não digitado, e a tarifa
  //    de ponta publicada é o fio somado à energia da NF.
  const nf = fatura.energiaNf;
  if (nf) {
    const derivado = nf.total / nf.mwh / 1000;
    if (Math.abs(derivado - nf.precoKwh) > 1e-6) {
      return {
        conciliada: false,
        prova,
        problemas: [
          {
            regra: "energia_nf",
            detalhe:
              `energia_nf: precoKwh ${nf.precoKwh.toFixed(7)} != total/volume ` +
              `${derivado.toFixed(7)}`,
          },
        ],
        foraDoTotal,
      };
    }

    const consumoPonta = fatura.itens.find((item) =>
      item.nome.toLowerCase().includes("consumo ponta"),
    );
    const tusdPonta = consumoPonta?.tarifa;
    if (
      tusdPonta !== undefined &&
      Math.abs((fatura.tarifaPontaTotal ?? 0) - (tusdPonta + nf.precoKwh)) > 1e-6
    ) {
      return {
        conciliada: false,
        prova,
        problemas: [
          {
            regra: "energia_nf",
            detalhe: "tarifaPontaTotal != TUSD + energia da NF",
          },
        ],
        foraDoTotal,
      };
    }
  }

  return { conciliada: true, prova, problemas: [], foraDoTotal };
}

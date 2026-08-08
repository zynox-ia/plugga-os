/**
 * Itens financeiros da fatura, lidos linha a linha.
 *
 * A distribuidora imprime cada item em três colunas — descrição, tarifa com
 * impostos e valor:
 *
 *     Consumo Ponta 2.455 kWh a 1,793450
 *     1,793450
 *     4.402,91
 *
 * Dependendo do gerador do PDF, as três colunas saem em linhas separadas ou
 * coladas numa só:
 *
 *     Consumo Ponta 21.231 kWh a 0,697040        0,69704014.798,85
 *
 * É a mesma estrutura, então o leitor trata as duas como uma: casa a cabeça do
 * item — rótulo, quantidade, unidade e tarifa — e depois procura tarifa e valor
 * no que sobrou da linha ou nas linhas seguintes. Colar não é ambíguo: a tarifa
 * tem sempre seis casas e o valor duas, então o corte é determinístico. E se o
 * corte errasse, a conferência aritmética não fecharia — não passa adiante.
 *
 * Também há itens só com valor, sem quantidade (COSIP, bandeira, crédito de
 * geração). Entram marcados como não conferíveis: não existe multiplicação que
 * prove que estão certos.
 */

export type UnidadeDoItem = "kWh" | "kW";

export type ItemDaFatura = {
  rotulo: string;
  quantidade: number | null;
  unidade: UnidadeDoItem | null;
  tarifa: number | null;
  valor: number;
  /** A linha original, para a tela mostrar de onde o número saiu. */
  origem: string;
};

/** "14.798,85" → 14798.85 */
function numero(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", "."));
}

/** Cabeça do item: rótulo, quantidade, unidade e a tarifa sem impostos. */
const CABECA =
  /^(?<rotulo>.*?)\s*(?<quantidade>\d[\d.]*)\s*(?<unidade>kWh|kW)\s*a\s*(?<tarifa>[\d.]*,\d{6})(?<resto>.*)$/;

/** Tarifa isolada numa linha (a coluna do meio). */
const SO_TARIFA = /^[\d.]*,\d{6}$/;

/** Valor isolado numa linha; negativo é crédito e precisa sobreviver. */
const SO_VALOR = /^-?[\d.]+,\d{2}$/;

/** Tarifa e valor colados: "0,69704014.798,85". */
const TARIFA_E_VALOR = /([\d.]*,\d{6})(-?[\d.]+,\d{2})/;

/** Rótulo puro: texto sem número no fim, candidato a item só com valor. */
const SO_ROTULO = /^(?![\d.,\s-]+$)[^\d]*[A-Za-zÀ-ÿ)][^\d]*$/;

/** Linhas que nunca são item financeiro, por mais que a forma engane. */
const NAO_E_ITEM = /^(?:CEP|CNPJ|INSC|Chave|Protocolo|Nota Fiscal|https?:|Total|Per[íi]odo)/i;

export function lerItens(linhas: readonly string[]): ItemDaFatura[] {
  const itens: ItemDaFatura[] = [];
  const em = (indice: number): string => linhas[indice]?.trim() ?? "";

  for (let i = 0; i < linhas.length; i++) {
    const linha = em(i);
    if (NAO_E_ITEM.test(linha)) continue;

    const cabeca = CABECA.exec(linha);
    if (cabeca?.groups) {
      const { rotulo = "", quantidade = "", unidade = "", tarifa = "", resto = "" } = cabeca.groups;

      // Colunas coladas na própria linha.
      const colado = TARIFA_E_VALOR.exec(resto);
      if (colado?.[2]) {
        itens.push({
          rotulo: rotulo.trim(),
          quantidade: numero(quantidade),
          unidade: unidade as UnidadeDoItem,
          tarifa: numero(tarifa),
          valor: numero(colado[2]),
          origem: linha,
        });
        continue;
      }

      // Colunas nas linhas seguintes: pula a tarifa repetida, pega o valor.
      let j = i + 1;
      while (j < linhas.length && SO_TARIFA.test(em(j))) j += 1;

      if (j < linhas.length && SO_VALOR.test(em(j))) {
        itens.push({
          rotulo: rotulo.trim(),
          quantidade: numero(quantidade),
          unidade: unidade as UnidadeDoItem,
          tarifa: numero(tarifa),
          valor: numero(em(j)),
          origem: `${linha} | ${em(j)}`,
        });
        i = j;
      }
      continue;
    }

    // Item só com valor, com o valor na linha seguinte.
    if (SO_ROTULO.test(linha) && linha.length >= 4 && i + 1 < linhas.length) {
      const proxima = em(i + 1);
      if (SO_VALOR.test(proxima)) {
        itens.push({
          rotulo: linha,
          quantidade: null,
          unidade: null,
          tarifa: null,
          valor: numero(proxima),
          origem: `${linha} | ${proxima}`,
        });
        i += 1;
      }
    }
  }

  return itens;
}

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

/**
 * Tarifa como a fatura a imprime, com ponto ou vírgula decimal.
 *
 * `2.689175` e `2,151340` são o mesmo tipo de número; o que separa o decimal do
 * milhar aqui são as seis casas — quem tem seis dígitos depois do separador é
 * decimal, sempre.
 */
function tarifaNumero(texto: string): number {
  const decimal = /[.,](\d{6})$/.exec(texto);
  if (!decimal) return numero(texto);
  const inteiro = texto.slice(0, texto.length - 7).replace(/[.,]/g, "");
  return Number(`${inteiro || "0"}.${decimal[1]}`);
}

/**
 * Cabeça do item: rótulo, quantidade, unidade e a tarifa.
 *
 * O separador decimal da tarifa varia por distribuidora. A Roraima Energia
 * imprime `2.689175` com ponto na descrição e `2,151340` com vírgula na coluna
 * ao lado — a mesma tarifa, dois separadores, na mesma linha. Aceitar só a
 * vírgula fazia a fatura inteira passar batido: nenhuma linha de consumo ou de
 * demanda era reconhecida.
 *
 * Aceitar os dois não é ambíguo aqui: são sempre seis casas depois do
 * separador, ancoradas no `a` que a fatura imprime entre a unidade e a tarifa.
 * Milhar não aparece nessa posição — tarifa de energia não chega a mil.
 */
const CABECA =
  /^(?<rotulo>.*?)\s*(?<quantidade>\d[\d.]*)\s*(?<unidade>kWh|kW)\s*a\s*(?<tarifa>[\d.]*[.,]\d{6})(?<resto>.*)$/;

/**
 * Item em tabela: unidade, quantidade, tarifa e valor, todos na mesma linha.
 *
 * Alguns documentos imprimem a unidade antes dos três números, sem o `a` da
 * forma acima:
 *
 *     TUSD em kWh - Ponta KWH 12.524,00 3,463060 43.371,44
 *
 * O que vier depois do valor pertence a outras colunas da mesma tabela
 * (tributos e tarifa sem impostos) e não muda os quatro campos financeiros.
 * A expressão fica deliberadamente alheia à distribuidora: é a forma da linha,
 * não o nome no cabeçalho, que decide se há um item candidato. Como nos demais
 * formatos, a conferência aritmética posterior é quem julga se o candidato
 * entra na ficha.
 */
const UNIDADE_QUANTIDADE_TARIFA_VALOR =
  /^(?<rotulo>.*?)\s+(?<unidade>kWh|kW|UN)\s+(?<quantidade>\d[\d.]*,\d{2})\s+(?<tarifa>[\d.]*[.,]\d{6})\s+(?<valor>-?[\d.]+,\d{2})(?:\s|$)/i;

/**
 * Ajuste ou encargo cujo valor cobrado é o primeiro número após o rótulo.
 *
 * A âncora é estreita: crédito/débito precisa trazer a competência, e a
 * contribuição precisa se identificar como iluminação pública. Assim uma
 * linha qualquer do quadro fiscal não vira item só porque começa com texto e
 * contém dinheiro. As colunas posteriores são bases e tributos, não parcelas.
 */
const AJUSTE_OU_ENCARGO_COM_VALOR =
  /^(?<rotulo>(?:(?:cr[eé]dito|d[eé]bito)\b.*?\b\d{2}\/\d{4}|Contrib(?:uiç[aã]o)?\s+(?:de\s+)?Ilum(?:inaç[aã]o)?\s+P[uú]b(?:lica)?))\s+(?<valor>-?[\d.]+,\d{2})(?:\s|$)/i;

/** Tarifa isolada numa linha (a coluna do meio). */
const SO_TARIFA = /^[\d.]*,\d{6}$/;

/** Valor isolado numa linha; negativo é crédito e precisa sobreviver. */
const SO_VALOR = /^-?[\d.]+,\d{2}$/;

/**
 * Tarifa e valor na mesma linha: "0,69704014.798,85" ou "1,730090 145,32".
 *
 * O espaço entre as duas é opcional porque depende de como o texto chegou. No
 * fluxo do PDF as colunas costumam vir coladas; lidas pela posição na folha —
 * que é como a leitura óptica devolve — vêm separadas por espaço. É a mesma
 * informação impressa no mesmo lugar, e o corte continua determinístico: a
 * tarifa tem seis casas decimais e o valor tem duas.
 */
const TARIFA_E_VALOR = /([\d.]*,\d{6})\s*(-?[\d.]+,\d{2})/;

/** Rótulo puro: texto sem número no fim, candidato a item só com valor. */
const SO_ROTULO = /^(?![\d.,\s-]+$)[^\d]*[A-Za-zÀ-ÿ)][^\d]*$/;

/**
 * Rótulo financeiro com dígitos, quando o valor cai na linha seguinte.
 *
 * `SO_ROTULO` continua deliberadamente sem aceitar dígitos: datas de leitura,
 * históricos e grandezas de medição também costumam vir antes de um número e
 * não podem virar cobrança. Esta segunda forma é mais estreita. Além de conter
 * um dígito, a linha precisa se identificar pelo vocabulário de uma cobrança,
 * crédito ou serviço tarifado conhecido, sem depender de concessionária:
 *
 *     Desligamento E Religacao Programados (2X)
 *     Devolução Diferenca Desconto Tusd - Ccee 04/26-
 *
 * A linha seguinte ainda precisa ser **somente** um valor monetário. O par é
 * preservado em `origem`, para a reconstrução continuar rastreável.
 */
const ROTULO_FINANCEIRO_COM_DIGITOS =
  /^(?=.*\d)(?=.*\b(?:cr[eé]dito|d[eé]bito|devolu[cç][aã]o|desconto|encargo|multa|juros?|desligamento|religa[cç][aã]o|ressarcimento|compensa[cç][aã]o)\b)[A-Za-zÀ-ÿ\d()/\s-]+$/i;

/**
 * Rótulo e valor na mesma linha: "Contribuição de Iluminação Pública (COSIP) 170,65".
 *
 * É o mesmo item sem quantidade tratado acima, só que lido pela posição na
 * folha em vez da ordem do fluxo — aí rótulo e valor caem juntos. Sem isto,
 * COSIP, bandeira tarifária e crédito de geração sumiriam da leitura, e com
 * eles a energia reativa e os encargos que a ficha usa.
 *
 * As duas âncoras é que tornam o padrão seguro. O rótulo não pode conter
 * dígito, e depois dele tem de haver **exatamente um** valor até o fim da
 * linha: é o que impede casar as linhas de medição, do tipo
 * "En Ativa Pta 43,60 43,20 210,00000 84", que têm rótulo parecido e quatro
 * números.
 */
const ROTULO_E_VALOR =
  /^(?<rotulo>(?![\d.,\s-]+$)[^\d]*[A-Za-zÀ-ÿ)])\s+(?<valor>-?[\d.]+,\d{2})$/;

/**
 * Linhas que nunca são item financeiro, por mais que a forma engane.
 *
 * O segundo grupo são as **grandezas de medição** — o quadro "Dados da Leitura",
 * com leitura anterior, atual, constante e registrado. Elas têm rótulo curto e
 * terminam em número, que é exatamente a forma de um item sem quantidade. Na
 * leitura de largura inteira passavam despercebidas porque vinham grudadas em
 * outra coluna; lendo por coluna, cada uma vira uma linha limpa e entraria como
 * item de R$ 52.536.132,00. Medição não é dinheiro.
 */
const NAO_E_ITEM =
  /^(?:CEP|CNPJ|INSC|Chave|Protocolo|Nota Fiscal|https?:|Total|Per[íi]odo|En\s+Ativa|En\s+Reativa|Dem\s+Acum|Dmcr\s+Acum|Ufer|Desc\.?\s+da\s+Grandeza|Leit\.|Constante|Registrado)/i;

export function lerItens(linhas: readonly string[]): ItemDaFatura[] {
  const itens: ItemDaFatura[] = [];
  const em = (indice: number): string => linhas[indice]?.trim() ?? "";

  for (let i = 0; i < linhas.length; i++) {
    const linha = em(i);
    if (NAO_E_ITEM.test(linha)) continue;

    const tabelado = UNIDADE_QUANTIDADE_TARIFA_VALOR.exec(linha);
    if (tabelado?.groups) {
      const { rotulo = "", quantidade = "", unidade = "", tarifa = "", valor = "" } =
        tabelado.groups;

      const unidadeDoItem: UnidadeDoItem | null =
        unidade.toLowerCase() === "kwh"
          ? "kWh"
          : unidade.toLowerCase() === "kw"
            ? "kW"
            : null;

      itens.push({
        rotulo: rotulo.trim(),
        // `UN` não existe no contrato da ficha. O valor ainda é uma parcela
        // válida, mas manter quantidade/tarifa com unidade nula fingiria uma
        // grandeza que o modelo não sabe representar. Ela entra como valor
        // único, visível e somável, sem inventar kWh ou kW.
        quantidade: unidadeDoItem === null ? null : numero(quantidade),
        unidade: unidadeDoItem,
        tarifa: unidadeDoItem === null ? null : tarifaNumero(tarifa),
        valor: numero(valor),
        origem: linha,
      });
      continue;
    }

    const ajusteOuEncargo = AJUSTE_OU_ENCARGO_COM_VALOR.exec(linha);
    if (ajusteOuEncargo?.groups?.rotulo && ajusteOuEncargo.groups.valor) {
      itens.push({
        rotulo: ajusteOuEncargo.groups.rotulo.trim(),
        quantidade: null,
        unidade: null,
        tarifa: null,
        valor: numero(ajusteOuEncargo.groups.valor),
        origem: linha,
      });
      continue;
    }

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
          tarifa: tarifaNumero(tarifa),
          valor: numero(colado[2]),
          origem: linha,
        });
        continue;
      }

      // Só o valor sobrou na linha, sem a tarifa repetida no meio. Acontece
      // quando a coluna da tarifa sem impostos repete a tarifa já lida na
      // descrição e a leitura funde as duas — e acontece sempre que o
      // reconhecimento óptico junta as colunas por proximidade. O valor é o
      // que interessa; a tarifa já veio da descrição.
      const apenasValor = /^\s*(-?[\d.]+,\d{2})\s*$/.exec(resto);
      if (apenasValor?.[1]) {
        itens.push({
          rotulo: rotulo.trim(),
          quantidade: numero(quantidade),
          unidade: unidade as UnidadeDoItem,
          tarifa: tarifaNumero(tarifa),
          valor: numero(apenasValor[1]),
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
          tarifa: tarifaNumero(tarifa),
          valor: numero(em(j)),
          origem: `${linha} | ${em(j)}`,
        });
        i = j;
      }
      continue;
    }

    // Item só com valor, com o valor na mesma linha.
    const juntos = ROTULO_E_VALOR.exec(linha);
    if (juntos?.groups?.rotulo && juntos.groups.valor) {
      const rotulo = juntos.groups.rotulo.trim();
      if (rotulo.length >= 4) {
        itens.push({
          rotulo,
          quantidade: null,
          unidade: null,
          tarifa: null,
          valor: numero(juntos.groups.valor),
          origem: linha,
        });
        continue;
      }
    }

    // Item só com valor, com o valor na linha seguinte. Rótulos com dígitos
    // entram apenas pela forma financeira estreita acima; `SO_ROTULO` não é
    // relaxado para não capturar datas, históricos ou medições.
    if (
      (SO_ROTULO.test(linha) || ROTULO_FINANCEIRO_COM_DIGITOS.test(linha)) &&
      linha.length >= 4 &&
      i + 1 < linhas.length
    ) {
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

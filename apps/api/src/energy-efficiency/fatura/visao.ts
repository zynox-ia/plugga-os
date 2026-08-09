import type { OpenRouterGateway } from "../../llm/openrouter.gateway.js";
import { PROCESSOS } from "../../llm/processo.js";
import type { IdentificacaoDaFatura } from "./identificacao.js";
import type { ItemDaFatura, UnidadeDoItem } from "./itens.js";

/**
 * Leitura da fatura por modelo de visão, para layout que as regras não conhecem.
 *
 * Existe porque o gargalo nunca foi enxergar o texto — foi saber o que cada
 * número significa. A conta da Roraima Energia prova: o PDF tinha camada de
 * texto, a extração leu R$ 174.636,70 sem errar um dígito, e a ficha não saiu
 * porque aquela distribuidora chama a unidade consumidora de "Código Único" e
 * escreve sem dígito verificador. Nenhum OCR melhor resolveria isso; é semântica,
 * não óptica. Escrever uma regra por distribuidora é esteira rolante quando o
 * alvo é o Brasil inteiro.
 *
 * **O modelo não decide nada.** Ele devolve itens candidatos — rótulo,
 * quantidade, tarifa, valor — que entram na MESMA `conferir()` do caminho
 * determinístico. Item cuja multiplicação não fecha cai fora da ficha e vai para
 * conferência humana, tenha vindo de regex ou de modelo. É o que torna aceitável
 * usar um modelo aqui: a fatura confere a si mesma, então um número inventado
 * falha a aritmética em vez de passar em silêncio. Sem essa rede, esta integração
 * não deveria existir.
 *
 * A chamada vai pelo gateway da OpenRouter, nunca por cliente próprio: é o que
 * garante que estes tokens apareçam no relatório de consumo com o dono certo.
 * Uma leitura de fatura que gasta sem aparecer torna a conta do mês inexplicável.
 */

export type LeituraPorVisao = {
  identificacao: IdentificacaoDaFatura;
  itens: ItemDaFatura[];
};

export type PaginaParaVisao = { conteudo: Buffer; mime: string };

export type LeitorPorVisao = (
  paginas: PaginaParaVisao[],
  referencia?: string,
) => Promise<LeituraPorVisao | null>;

/**
 * `strict` exige `additionalProperties: false` e `required` em todo objeto, e a
 * saída estruturada garante que o JSON casa com isto — não é pedir e torcer. Sem
 * restrição numérica: quem valida número aqui é a aritmética da fatura.
 */
const ESQUEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["distribuidora", "unidadeConsumidora", "competenciaMes", "competenciaAno", "itens"],
  properties: {
    distribuidora: {
      type: ["string", "null"],
      description: "Nome da distribuidora como impresso, sem razão social nem CNPJ.",
    },
    unidadeConsumidora: {
      type: ["string", "null"],
      description:
        "Código da unidade consumidora exatamente como impresso, preservando zeros à " +
        "esquerda e traço se houver. Cada distribuidora usa um rótulo diferente: " +
        "'Unidade Consumidora', 'Código Único', 'Número do Cliente', 'Instalação'. " +
        "Não confundir com CNPJ, número da nota fiscal, número do medidor, protocolo " +
        "de autorização ou chave de acesso — todos também são blocos de dígitos.",
    },
    competenciaMes: { type: ["integer", "null"], description: "Mês faturado, 1 a 12." },
    competenciaAno: { type: ["integer", "null"], description: "Ano faturado, quatro dígitos." },
    itens: {
      type: "array",
      description:
        "Itens financeiros da tabela de faturamento, um por linha impressa. Inclua " +
        "todos, mesmo os sem quantidade e tarifa (bandeira, contribuição de " +
        "iluminação, multa, juros, desconto). Não inclua o total geral nem subtotais: " +
        "só as parcelas. Atenção a layouts que intercalam colunas de duas seções na " +
        "mesma linha impressa — leia pela posição na folha, não pela ordem do texto.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rotulo", "quantidade", "unidade", "tarifa", "valor"],
        properties: {
          rotulo: {
            type: "string",
            description: "Descrição do item como impressa, ex.: 'Consumo Ponta'.",
          },
          quantidade: {
            type: ["number", "null"],
            description: "Quantidade medida; nula quando o item não tem quantidade.",
          },
          unidade: {
            type: ["string", "null"],
            enum: ["kWh", "kW", null],
            description: "kWh para energia, kW para demanda, nula quando não se aplica.",
          },
          tarifa: {
            type: ["number", "null"],
            description:
              "Preço unitário SEM impostos quando a fatura publica as duas colunas — " +
              "é o valor cuja multiplicação pela quantidade fecha com o valor do item. " +
              "Nula quando o item não tem tarifa.",
          },
          valor: {
            type: "number",
            description: "Valor em reais da linha. Débito positivo, crédito negativo.",
          },
        },
      },
    },
  },
};

const INSTRUCAO = [
  "Você lê faturas de energia elétrica de distribuidoras brasileiras e devolve os",
  "campos publicados no documento.",
  "",
  "Transcreva. Não calcule, não corrija, não complete.",
  "",
  "- Copie cada número como está impresso. Se a fatura traz 1,730090, devolva",
  "  1.73009 — nunca arredonde nem 'conserte' um valor que pareça estranho.",
  "- Um campo que você não encontra é nulo. Nulo é uma resposta correta e barata;",
  "  um palpite custa caro, porque do outro lado há uma auditoria.",
  "- Não deduza a tarifa dividindo valor por quantidade, nem o valor multiplicando.",
  "  Um número que você calculou passaria na conferência aritmética por construção",
  "  e destruiria justamente a verificação que existe para pegar erro de leitura.",
].join("\n");

type ItemBruto = {
  rotulo: string;
  quantidade: number | null;
  unidade: string | null;
  tarifa: number | null;
  valor: number;
};

function converter(item: ItemBruto): ItemDaFatura {
  const unidade =
    item.unidade === "kWh" || item.unidade === "kW" ? (item.unidade as UnidadeDoItem) : null;
  return {
    rotulo: item.rotulo,
    quantidade: item.quantidade,
    unidade,
    tarifa: item.tarifa,
    valor: item.valor,
    // Procedência registrada: numa auditoria, saber que a linha veio do modelo e
    // não de um padrão conferível não é detalhe.
    origem: "visao",
  };
}

/**
 * Fecha o gateway numa função que a leitura pode chamar sem conhecer Nest.
 *
 * `leitura.ts` continua puro e testável; a dependência entra por parâmetro em
 * vez de por importação, que é o que permite o teste rodar sem rede.
 */
export function criarLeitorPorVisao(gateway: OpenRouterGateway): LeitorPorVisao {
  return async (paginas, referencia) => {
    if (paginas.length === 0) return null;

    const resposta = await gateway.completar({
      processo: PROCESSOS.FATURA_VISAO,
      instrucao: INSTRUCAO,
      esquema: { nome: "fatura", schema: ESQUEMA },
      referencia,
      partes: [
        ...paginas.map((p) => ({ tipo: "imagem" as const, conteudo: p.conteudo, mime: p.mime })),
        { tipo: "texto" as const, texto: "Leia esta fatura e devolva os campos publicados." },
      ],
    });

    if (!resposta || !resposta.texto) return null;

    try {
      const dados = JSON.parse(resposta.texto) as {
        distribuidora: string | null;
        unidadeConsumidora: string | null;
        competenciaMes: number | null;
        competenciaAno: number | null;
        itens: ItemBruto[];
      };

      const competencia =
        dados.competenciaMes && dados.competenciaAno
          ? { mes: dados.competenciaMes, ano: dados.competenciaAno }
          : null;

      return {
        identificacao: {
          unidadeConsumidora: dados.unidadeConsumidora,
          competencia,
          distribuidora: dados.distribuidora,
        },
        itens: (dados.itens ?? []).map(converter),
      };
    } catch {
      // JSON quebrado é o mesmo que não ter lido: a fatura segue pelo caminho
      // das regras em vez de derrubar o envio.
      return null;
    }
  };
}

import Anthropic from "@anthropic-ai/sdk";

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
 * Como o armazenamento, é apoio e não serviço: sem credencial configurada a
 * leitura segue pelo caminho de sempre e a resposta apenas não ganha os campos
 * que só o modelo acharia. Nenhuma fatura deixa de ser lida porque a API caiu.
 */

/** Só o que a fatura publica; o resto a ficha calcula. */
export type LeituraPorVisao = {
  identificacao: IdentificacaoDaFatura;
  itens: ItemDaFatura[];
};

/**
 * `strict` exige `additionalProperties: false` e `required` em todo objeto, e a
 * saída estruturada garante que o JSON casa com isto — não é pedir e torcer. Sem
 * restrição numérica: a especificação não as suporta, e quem valida número aqui
 * é a aritmética da fatura, não o schema.
 */
const ESQUEMA = {
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
} as const;

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

/** Modelo e limites vêm do ambiente para dar para trocar sem reimplantar. */
const MODELO = process.env.VISAO_MODELO || "claude-opus-5";
const ESFORCO = process.env.VISAO_ESFORCO || "medium";
/**
 * Folgado de propósito: no Claude Opus 5 o pensamento é ligado por padrão e
 * `max_tokens` limita pensamento MAIS resposta. Apertar aqui trunca a ficha no
 * meio de uma fatura com muitos itens.
 */
const TETO_DE_SAIDA = Number(process.env.VISAO_MAX_TOKENS || 16000);

export function configurado(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** `true` quando o arquivo é PDF; o resto tratamos como imagem. */
function ehPdf(mime: string): boolean {
  return mime === "application/pdf";
}

function bloco(conteudo: Buffer, mime: string) {
  const data = conteudo.toString("base64");
  return ehPdf(mime)
    ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
    : ({
        type: "image",
        source: { type: "base64", media_type: mime as "image/png", data },
      } as const);
}

type ItemBruto = {
  rotulo: string;
  quantidade: number | null;
  unidade: string | null;
  tarifa: number | null;
  valor: number;
};

/**
 * O modelo devolve texto validado contra o schema; aqui só traduzimos para os
 * tipos do domínio. `origem` registra a procedência para a tela poder dizer de
 * onde veio cada linha — numa auditoria isso não é detalhe.
 */
function converter(item: ItemBruto): ItemDaFatura {
  const unidade =
    item.unidade === "kWh" || item.unidade === "kW" ? (item.unidade as UnidadeDoItem) : null;
  return {
    rotulo: item.rotulo,
    quantidade: item.quantidade,
    unidade,
    tarifa: item.tarifa,
    valor: item.valor,
    origem: "visao",
  };
}

let cliente: Anthropic | null = null;

/**
 * Lê a fatura pelo modelo. Devolve `null` quando não há credencial ou quando a
 * chamada falha — o chamador segue com o que as regras conseguiram, que é sempre
 * melhor que derrubar a leitura inteira.
 */
export async function lerPorVisao(
  conteudo: Buffer,
  mime: string,
): Promise<LeituraPorVisao | null> {
  if (!configurado()) return null;

  cliente ??= new Anthropic();

  try {
    const resposta = await cliente.messages.create({
      model: MODELO,
      max_tokens: TETO_DE_SAIDA,
      output_config: {
        effort: ESFORCO as "low" | "medium" | "high",
        format: { type: "json_schema", schema: ESQUEMA },
      },
      system: INSTRUCAO,
      messages: [
        {
          role: "user",
          content: [
            bloco(conteudo, mime),
            { type: "text", text: "Leia esta fatura e devolva os campos publicados." },
          ],
        },
      ],
    });

    // Recusa por política volta com 200 e conteúdo vazio; ler content[0] sem
    // conferir o motivo quebraria aqui em vez de degradar.
    if (resposta.stop_reason === "refusal") return null;

    const texto = resposta.content.find((b) => b.type === "text");
    if (!texto || texto.type !== "text") return null;

    const dados = JSON.parse(texto.text) as {
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
      itens: dados.itens.map(converter),
    };
  } catch {
    // Silencioso de propósito: leitura por visão é apoio. Quem chama já sabe
    // seguir sem ela, e derrubar a fatura por indisponibilidade de terceiro
    // seria trocar um resultado parcial por nenhum.
    return null;
  }
}

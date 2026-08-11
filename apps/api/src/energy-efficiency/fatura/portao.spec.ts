import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TOLERANCIA_DO_TOTAL } from "../nucleo/conciliacao.js";
import type { DocumentoNormalizado } from "./documento.js";
import { MOTIVO_INFORMATIVO } from "./informativos.js";
import type { ItemDaFatura } from "./itens.js";
import {
  lerComVisao,
  lerPorRegras,
  leituraProvada,
  somaDoQueCompoeOTotal,
  somaFechaComOTotal,
} from "./leitura.js";
import type { LeitorPorVisao, PaginaParaVisao } from "./visao.js";

/**
 * O portão do escalonamento, que passou a ser a Trava 1.
 *
 * O defeito que este arquivo guarda: a decisão de chamar a visão era
 * `aproveitavel`, que significa **os itens fecharem individualmente**
 * (`quantidade × tarifa = valor`). Uma leitura que perde um item inteiro passa
 * nessa prova — os itens que sobraram fecham entre si —, a visão nunca é
 * chamada, e a soma aberta só aparece na conciliação, com o estudo já sendo
 * montado.
 *
 * Tudo aqui roda sobre a fixture sintética que vive no git: sem credencial, sem
 * rede e sem PDF. O corpus real cobre a variedade; este arquivo cobre a
 * decisão, e uma coisa não substitui a outra.
 */
const CAMINHO = join(__dirname, "usina-cerrado-sintetica-2026-01.pagina.json");

const TOTAL_IMPRESSO = 24_661;

function documento(): DocumentoNormalizado {
  return JSON.parse(readFileSync(CAMINHO, "utf8")) as DocumentoNormalizado;
}

/** A mesma folha, sem os fragmentos que casarem com o padrão. */
function documentoSem(padrao: RegExp): DocumentoNormalizado {
  const original = documento();
  return {
    ...original,
    paginas: original.paginas.map((pagina) => ({
      ...pagina,
      fragmentos: pagina.fragmentos.filter((fragmento) => !padrao.test(fragmento.texto)),
    })),
  };
}

/** A folha inteira, menos a linha da demanda de ponta: R$ 4.260,00 somem. */
const SEM_DEMANDA_PONTA = /^Demanda Ponta 150 kW|^4\.260,00$/;

/** A folha inteira, menos o total impresso no cabeçalho. */
const SEM_TOTAL = /^24\.661,00$/;

/**
 * Um leitor por visão de mentira, que registra se foi chamado.
 *
 * O que se prova com ele não é a qualidade do modelo — é **quando** o código
 * decide gastá-lo, que é a mudança deste ticket.
 */
function visaoDeMentira(resposta: ItemDaFatura[] | null = null): LeitorPorVisao & {
  chamadas: number;
} {
  const leitor = async (): Promise<{
    identificacao: { unidadeConsumidora: null; competencia: null; distribuidora: null };
    itens: ItemDaFatura[];
  } | null> => {
    leitor.chamadas += 1;
    if (!resposta) return null;
    return {
      identificacao: { unidadeConsumidora: null, competencia: null, distribuidora: null },
      itens: resposta,
    };
  };
  leitor.chamadas = 0;
  return leitor;
}

/** As páginas que o modelo receberia, contando quantas vezes foram pedidas. */
function paginasDeMentira(): (() => Promise<PaginaParaVisao[]>) & { pedidas: number } {
  const paginas = async (): Promise<PaginaParaVisao[]> => {
    paginas.pedidas += 1;
    return [{ conteudo: Buffer.from("folha"), mime: "image/png" }];
  };
  paginas.pedidas = 0;
  return paginas;
}

const item = (
  rotulo: string,
  quantidade: number | null,
  tarifa: number | null,
  valor: number,
): ItemDaFatura => ({
  rotulo,
  quantidade,
  unidade: quantidade === null ? null : /kWh/i.test(rotulo) ? "kWh" : "kW",
  tarifa,
  valor,
  origem: `${rotulo} (modelo)`,
});

/** Os quatro itens essenciais mais a COSIP, fechando o total impresso. */
const ITENS_QUE_FECHAM: ItemDaFatura[] = [
  item("Consumo Ponta kWh", 1_200, 3.105, 3_726),
  item("Consumo F/Ponta kWh", 18_000, 0.7125, 12_825),
  item("Demanda Ponta", 150, 28.4, 4_260),
  item("Demanda F/Ponta", 300, 12.15, 3_645),
  item("Contribuição de Iluminação Pública (COSIP)", null, null, 205),
];

describe("a soma dos itens contra o total impresso", () => {
  it("respeita `compoeTotal`: a bandeira informativa fica fora da soma", () => {
    const leitura = lerPorRegras(documento());
    const bandeira = leitura.itens.find((i) => /bandeira/i.test(i.rotulo));

    // A prova de que a exceção é necessária: com a bandeira dentro, a soma
    // estoura o total e a fatura reprovaria por causa de uma linha que a
    // distribuidora imprime sem cobrar.
    expect(bandeira?.compoeTotal).toBe(false);
    expect(bandeira?.motivoForaDoTotal).toBe(MOTIVO_INFORMATIVO);
    expect(leitura.itens.reduce((total, i) => total + i.valor, 0)).toBeGreaterThan(TOTAL_IMPRESSO);

    expect(somaDoQueCompoeOTotal(leitura.itens)).toBeCloseTo(TOTAL_IMPRESSO, 2);
    expect(somaFechaComOTotal(leitura)).toBe(true);
  });

  it("usa a folga da conciliação, e não uma folga própria", () => {
    const leitura = lerPorRegras(documento());
    const comDiferencaDe = (diferenca: number) => ({
      ...leitura,
      invoice: { ...leitura.invoice, valorTotal: TOTAL_IMPRESSO + diferenca },
    });

    // Meio centavo é a folga da Trava 1, e é a mesma aqui. Um centavo de
    // diferença já manda a leitura para a visão — que é o comportamento da
    // conciliação, e é essa igualdade que a importação garante.
    expect(somaFechaComOTotal(comDiferencaDe(TOLERANCIA_DO_TOTAL * 0.9))).toBe(true);
    expect(somaFechaComOTotal(comDiferencaDe(TOLERANCIA_DO_TOTAL * 1.1))).toBe(false);
    expect(somaFechaComOTotal(comDiferencaDe(-0.01))).toBe(false);
  });

  it("sem total conhecido não há o que provar, e a soma não reprova", () => {
    const leitura = lerPorRegras(documentoSem(SEM_TOTAL));

    expect(leitura.invoice.valorTotal).toBeUndefined();
    expect(somaFechaComOTotal(leitura)).toBe(true);
  });
});

describe("o portão do escalonamento", () => {
  it("o item perdido passava pela prova antiga e não passa pela nova", () => {
    const leitura = lerPorRegras(documentoSem(SEM_DEMANDA_PONTA));

    // A prova antiga: cada item que sobrou fecha na multiplicação, e a ficha
    // saiu. É por isso que a leitura passava direto.
    expect(leitura.aproveitavel).toBe(true);
    expect(leitura.conferencia.divergentes).toBe(0);
    expect(leitura.itens.some((i) => /^Demanda Ponta/.test(i.rotulo))).toBe(false);

    // A prova nova: faltam os R$ 4.260,00 da linha que sumiu.
    expect(somaFechaComOTotal(leitura)).toBe(false);
    expect(leituraProvada(leitura)).toBe(false);
    expect(TOTAL_IMPRESSO - somaDoQueCompoeOTotal(leitura.itens)).toBeCloseTo(4_260 - 118.3, 2);
  });

  it("a ficha com a soma aberta diz que está aberta, mesmo sem visão nenhuma", () => {
    const leitura = lerPorRegras(documentoSem(SEM_DEMANDA_PONTA));

    // Sem chave de modelo configurada não há plano B: a ficha sai assim mesmo.
    // Sair com a soma aberta é aceitável; sair sem dizer isso seria devolver
    // número errado em silêncio.
    expect(leitura.camposParaConfirmar.some((c) => /não fecha com o total impresso/.test(c))).toBe(
      true,
    );
    expect(leitura.camposParaConfirmar.some((c) => /nunca ajuste o total/.test(c))).toBe(true);
  });

  it("escala para a visão quando a soma não fecha, mesmo com a ficha montada", async () => {
    const visao = visaoDeMentira();
    const paginas = paginasDeMentira();

    await lerComVisao(documentoSem(SEM_DEMANDA_PONTA), visao, paginas);

    expect(visao.chamadas).toBe(1);
    expect(paginas.pedidas).toBe(1);
  });

  it("não escala — nem rasteriza — quando a leitura por regras está provada", async () => {
    const visao = visaoDeMentira();
    const paginas = paginasDeMentira();

    const leitura = await lerComVisao(documento(), visao, paginas);

    expect(visao.chamadas).toBe(0);
    // A folha nem chega a ser rasterizada: o custo do plano B só nasce depois
    // do portão.
    expect(paginas.pedidas).toBe(0);
    expect(leitura.invoice.valorTotal).toBe(TOTAL_IMPRESSO);
  });

  it("fatura sem total conhecido cai no comportamento antigo e não escala", async () => {
    const visao = visaoDeMentira();
    const paginas = paginasDeMentira();

    const leitura = await lerComVisao(documentoSem(SEM_TOTAL), visao, paginas);

    // Exigir a prova aqui reprovaria a leitura por falta de evidência, não por
    // erro — e mandaria para o modelo toda fatura cujo total as regras não
    // acham.
    expect(visao.chamadas).toBe(0);
    expect(paginas.pedidas).toBe(0);
    expect(leitura.aproveitavel).toBe(true);
    expect(leitura.camposParaConfirmar).toContain("valor total da fatura");
  });
});

describe("o que fica quando o modelo responde", () => {
  it("a visão ganha quando fecha a soma que a regra deixou aberta", async () => {
    const leitura = await lerComVisao(
      documentoSem(SEM_DEMANDA_PONTA),
      visaoDeMentira(ITENS_QUE_FECHAM),
      paginasDeMentira(),
    );

    expect(leituraProvada(leitura)).toBe(true);
    expect(leitura.invoice.demandaMedidaPontaKw).toBe(150);
    expect(leitura.invoice.valorDemanda).toBe(4_260 + 3_645);
    // A identificação lida por regra continua tendo precedência sobre a do
    // modelo, que aqui devolveu tudo nulo.
    expect(leitura.identificacao.unidadeConsumidora).toBe("1234567-8");
  });

  it("a visão não ganha só por montar ficha: sem a soma, fica a regra", async () => {
    // O modelo devolve itens que fecham entre si e não alcançam o total — o
    // mesmo defeito da regra, agora vindo do modelo. Trocar aqui seria trocar
    // o rastreável pelo não rastreável sem ganhar prova nenhuma.
    const semACosip = ITENS_QUE_FECHAM.filter((i) => !/COSIP/.test(i.rotulo));
    const porRegras = lerPorRegras(documentoSem(SEM_DEMANDA_PONTA));

    const leitura = await lerComVisao(
      documentoSem(SEM_DEMANDA_PONTA),
      visaoDeMentira(semACosip),
      paginasDeMentira(),
    );

    expect(leitura.itens.map((i) => i.origem)).toEqual(porRegras.itens.map((i) => i.origem));
    expect(leitura.itens.some((i) => /\(modelo\)$/.test(i.origem))).toBe(false);
  });

  it("modelo que não responde deixa a leitura por regras como estava", async () => {
    const porRegras = lerPorRegras(documentoSem(SEM_DEMANDA_PONTA));
    const leitura = await lerComVisao(
      documentoSem(SEM_DEMANDA_PONTA),
      visaoDeMentira(null),
      paginasDeMentira(),
    );

    expect(leitura).toEqual(porRegras);
  });
});

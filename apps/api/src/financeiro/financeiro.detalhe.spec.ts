import { describe, expect, it } from "vitest";

import { emReais, linhaDoTempo, nomePadronizadoDoComprovante, type MarcosDoLancamento } from "./financeiro.detalhe";

const ANA = { id: "00000000-0000-4000-8000-0000000000a1", name: "Ana" };
const base: MarcosDoLancamento = {
  tipo: "saida", createdAt: new Date("2026-11-20T13:00:00Z"), criadoPor: ANA,
  aprovadoEm: new Date("2026-11-21T13:00:00Z"), aprovadoPor: ANA,
  nfRegistradaEm: null, nfNumero: null, nfRegistradaPor: null, boletoRegistradoEm: null, boletoRegistradoPor: null,
  enviadoEm: null, envioCanal: null, enviadoPor: null,
  pagamentoRegistradoEm: null, pagamentoRegistradoPor: null, recebimentoRegistradoEm: null, recebimentoRegistradoPor: null, valorRecebido: null,
  conciliadoEm: null, conciliadoPor: null, canceladoEm: null, canceladoPor: null, cancelamentoMotivo: null,
};

describe("detalhe do lançamento", () => {
  it("valor em reais com milhar e centavos", () => {
    expect(emReais("1742.18")).toBe("R$ 1.742,18");
    expect(emReais("27350.00")).toBe("R$ 27.350,00");
    expect(emReais("0.50")).toBe("R$ 0,50");
  });

  it("nome padronizado do comprovante: dia de Manaus, código, favorecido limpo e valor", () => {
    expect(nomePadronizadoDoComprovante({ dia: new Date("2026-11-21T04:00:00Z"), codigo: "CP-0401", favorecido: "Prefeitura / ISS", valor: "1742.18", mime: "application/pdf" }))
      .toBe("2026-11-21 · CP-0401 · Prefeitura - ISS · R$ 1.742,18.pdf");
  });

  it("linha do tempo junta marcos e histórico, do mais recente ao mais antigo, com o texto da pessoa", () => {
    const eventos = linhaDoTempo(base, [
      { tipo: "valor_corrigido", em: new Date("2026-11-22T13:00:00Z"), por: ANA, dados: { de: "100.00", para: "120.00" }, texto: "Frete incluído" },
      { tipo: "desconhecido", em: new Date("2026-11-23T13:00:00Z"), por: ANA, dados: {}, texto: null },
    ]);
    expect(eventos.map((e) => e.tipo)).toEqual(["valor_corrigido", "aprovado", "criado"]);
    expect(eventos[0]).toMatchObject({ resumo: "Valor corrigido de R$ 100,00 para R$ 120,00", texto: "Frete incluído", por: { nome: "Ana" } });
  });
});

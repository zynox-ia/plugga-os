import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { calcularDesempenho, camposInformados, filtroDaBusca, filtroDaSituacao, paraFornecedor, paraItemDaLista, type CotacaoParaDesempenho, type LinhaDoFornecedor } from "./fornecedores.rules";

const linha = (dados: Partial<LinhaDoFornecedor> = {}): LinhaDoFornecedor => ({
  id: "00000000-0000-4000-8000-000000000301",
  nome: "Solar Sintético Ltda",
  nomeFantasia: "Solar",
  documento: "99999001000159",
  categoria: "kit_solar",
  contatoNome: null,
  telefone: null,
  email: null,
  cep: "69000000",
  logradouro: "Rua Sintética",
  numero: "100",
  complemento: null,
  bairro: "Centro",
  cidade: "Manaus",
  uf: "AM",
  formasDePagamento: ["pix"],
  chavePix: null,
  dadosBancarios: null,
  observacoes: null,
  ativo: true,
  criadoPorId: "00000000-0000-4000-8000-000000000001",
  atualizadoPorId: null,
  createdAt: new Date("2026-11-23T10:00:00Z"),
  updatedAt: new Date("2026-11-23T11:00:00Z"),
  criadoPor: { id: "00000000-0000-4000-8000-000000000001", name: "Ana" },
  atualizadoPor: null,
  _count: { cotacoes: 2 },
  ...dados,
});

describe("filtroDaBusca", () => {
  it("sem busca não filtra", () => {
    expect(filtroDaBusca(undefined)).toEqual({});
  });

  it("procura no nome e no nome fantasia sem diferenciar maiúsculas", () => {
    expect(filtroDaBusca("solar")).toEqual({
      OR: [
        { nome: { contains: "solar", mode: "insensitive" } },
        { nomeFantasia: { contains: "solar", mode: "insensitive" } },
      ],
    });
  });

  it("compara o documento pelos dígitos, com ou sem pontuação", () => {
    expect(filtroDaBusca("99.999.001/0001")).toMatchObject({ OR: expect.arrayContaining([{ documento: { contains: "999990010001" } }]) });
  });

  it("não usa o documento quando há poucos dígitos", () => {
    expect(filtroDaBusca("Loja 12").OR).toHaveLength(2);
  });
});

describe("filtroDaSituacao", () => {
  it("todos não filtra; ativos e inativos filtram", () => {
    expect(filtroDaSituacao("todos")).toEqual({});
    expect(filtroDaSituacao("ativos")).toEqual({ ativo: true });
    expect(filtroDaSituacao("inativos")).toEqual({ ativo: false });
  });
});

describe("camposInformados", () => {
  it("lista os nomes dos campos enviados, inclusive os apagados com null, e nunca os valores", () => {
    expect(camposInformados({ nome: "X", chavePix: null, email: undefined })).toEqual(["chavePix", "nome"]);
  });
});

describe("conversão para o contrato", () => {
  it("leva autoria, contagem de cotações e datas ISO", () => {
    const convertido = paraFornecedor(linha());
    expect(convertido).toMatchObject({ cotacoes: 2, criadoPor: { id: "00000000-0000-4000-8000-000000000001", nome: "Ana" }, atualizadoPor: null, updatedAt: "2026-11-23T11:00:00.000Z" });
    expect(convertido).not.toHaveProperty("empresa");
  });

  it("a linha da lista traz e-mail, formas de pagamento e cotações, sem dados bancários", () => {
    const item = paraItemDaLista(linha({ dadosBancarios: "Banco X" }));
    expect(item).toMatchObject({ formasDePagamento: ["pix"], cotacoes: 2, email: null });
    expect(item).not.toHaveProperty("dadosBancarios");
    expect(item).not.toHaveProperty("chavePix");
  });
});

describe("calcularDesempenho", () => {
  const cotacao = (dados: Partial<CotacaoParaDesempenho> = {}): CotacaoParaDesempenho => ({
    valor: new Prisma.Decimal(100), valorFrete: null, prazoEntregaDias: null, createdAt: new Date("2026-11-01T12:00:00Z"),
    escolhida: false, pedidoCancelado: false, pedidoConcluido: false, ...dados,
  });

  it("sem cotação: zeros e nulos", () => {
    expect(calcularDesempenho([])).toEqual({ cotacoes: 0, vitorias: 0, percentualDeVitorias: null, valorComprado: "0.00", prazoMedioDeEntregaDias: null, ultimaCotacaoEm: null });
  });

  it("vitória é a escolhida de pedido não cancelado; valor comprado só dos concluídos, com frete", () => {
    const resultado = calcularDesempenho([
      cotacao({ escolhida: true, pedidoConcluido: true, valorFrete: new Prisma.Decimal("10.5"), prazoEntregaDias: 5 }),
      cotacao({ escolhida: true, pedidoConcluido: false, prazoEntregaDias: 2 }),
      cotacao({ escolhida: true, pedidoCancelado: true }),
      cotacao({ createdAt: new Date("2026-11-20T12:00:00Z") }),
    ]);
    expect(resultado).toEqual({
      cotacoes: 4,
      vitorias: 2,
      percentualDeVitorias: 50,
      valorComprado: "110.50",
      prazoMedioDeEntregaDias: 3.5,
      ultimaCotacaoEm: "2026-11-20T12:00:00.000Z",
    });
  });

  it("percentual com 1 casa", () => {
    expect(calcularDesempenho([cotacao({ escolhida: true }), cotacao(), cotacao()]).percentualDeVitorias).toBe(33.3);
  });
});

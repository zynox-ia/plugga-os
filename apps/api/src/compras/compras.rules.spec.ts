import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { ComprasEtapa, RoleKey } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import {
  acoesBloqueadas,
  assertEtapaAtual,
  assertPagamentoTemFaturado,
  assertPodeRenegociarPrazo,
  assertPodeSeguirParaAprovacao,
  assertAlcadaDePrazo,
  assertSegregacao,
  assertTransicaoPermitida,
  tetoDeRenegociacao,
  papeisQuePodemAprovar,
  paresViolados,
} from "./compras.rules";

const COMPRADOR = { id: "usuario-compras", roles: ["compras"] as RoleKey[] };
const FINANCEIRO = { id: "usuario-financeiro", roles: ["financeiro"] as RoleKey[] };
const DIRETORIA = { id: "usuario-diretoria", roles: ["diretoria"] as RoleKey[] };

const pedidoBase = {
  solicitanteId: "usuario-solicitante",
  selecionouCotacaoId: null as string | null,
  aprovouId: null as string | null,
};

describe("assertTransicaoPermitida", () => {
  it.each([
    ["pedido_gerado", "analise_estoque"],
    ["analise_estoque", "cotacoes"],
    ["analise_estoque", "retirada"],
    ["cotacoes", "aprovacao_compra"],
    ["aprovacao_compra", "pagamento"],
    ["aprovacao_compra", "cotacoes"],
    ["pagamento", "retirada"],
    ["retirada", "concluido"],
  ] as [ComprasEtapa, ComprasEtapa][])("permite %s → %s", (de, para) => {
    expect(() => assertTransicaoPermitida(de, para)).not.toThrow();
  });

  it("permite o REVISAR de volta para cotações — o único retorno do fluxo", () => {
    expect(() => assertTransicaoPermitida("aprovacao_compra", "cotacoes")).not.toThrow();
  });

  it.each([
    ["pedido_gerado", "pagamento"],
    ["analise_estoque", "concluido"],
    ["cotacoes", "retirada"],
    ["pagamento", "cotacoes"],
    ["retirada", "pagamento"],
  ] as [ComprasEtapa, ComprasEtapa][])("recusa o pulo de %s para %s", (de, para) => {
    expect(() => assertTransicaoPermitida(de, para)).toThrow(BadRequestException);
  });

  it.each(["analise_estoque", "retirada", "concluido"] as ComprasEtapa[])(
    "trata concluído como terminal (tentativa de ir para %s)",
    (para) => {
      expect(() => assertTransicaoPermitida("concluido", para)).toThrow(BadRequestException);
    },
  );
});

describe("assertEtapaAtual — a aresta do grafo não basta", () => {
  it("recusa a ação de pagamento sobre um pedido ainda em análise de estoque", () => {
    // A aresta analise_estoque → retirada existe (ramo SIM do fluxograma), então
    // só validar a transição deixaria passar pagamento de compra não aprovada.
    expect(() => assertTransicaoPermitida("analise_estoque", "retirada")).not.toThrow();
    expect(() => assertEtapaAtual("analise_estoque", "pagamento")).toThrow(BadRequestException);
  });

  it("recusa REVISAR sobre um pedido em análise de estoque", () => {
    expect(() => assertTransicaoPermitida("analise_estoque", "cotacoes")).not.toThrow();
    expect(() => assertEtapaAtual("analise_estoque", "aprovacao_compra")).toThrow(BadRequestException);
  });

  it("recusa decisão de estoque sobre um pedido já em pagamento", () => {
    expect(() => assertTransicaoPermitida("pagamento", "retirada")).not.toThrow();
    expect(() => assertEtapaAtual("pagamento", "analise_estoque")).toThrow(BadRequestException);
  });

  it("deixa passar quando a etapa é a da ação", () => {
    expect(() => assertEtapaAtual("pagamento", "pagamento")).not.toThrow();
  });
});

describe("assertPodeSeguirParaAprovacao", () => {
  it("exige a validação de necessidade que o fluxograma desenha", () => {
    expect(() =>
      assertPodeSeguirParaAprovacao({ necessidadeValidadaEm: null, cotacaoSelecionadaId: "c1" }),
    ).toThrow(/necessidade/);
  });

  it("exige a cotação selecionada", () => {
    expect(() =>
      assertPodeSeguirParaAprovacao({ necessidadeValidadaEm: new Date(), cotacaoSelecionadaId: null }),
    ).toThrow(/cotação/);
  });

  it("passa com as duas caixas cumpridas", () => {
    expect(() =>
      assertPodeSeguirParaAprovacao({ necessidadeValidadaEm: new Date(), cotacaoSelecionadaId: "c1" }),
    ).not.toThrow();
  });
});

describe("assertPagamentoTemFaturado", () => {
  it.each([null, undefined, "0", "0.00"])("recusa faturado ausente ou zero (%s)", (valor) => {
    expect(() => assertPagamentoTemFaturado(valor as string | null)).toThrow(BadRequestException);
  });

  it("aceita um valor positivo", () => {
    expect(() => assertPagamentoTemFaturado("1250.50")).not.toThrow();
  });
});

describe("assertPodeRenegociarPrazo", () => {
  const prazo = new Date("2026-08-12T22:00:00Z");

  it("permite renegociar antes do vencimento", () => {
    expect(() => assertPodeRenegociarPrazo(prazo, new Date("2026-08-12T21:59:00Z"))).not.toThrow();
  });

  it("recusa depois do vencimento — aí é atraso, não renegociação", () => {
    expect(() => assertPodeRenegociarPrazo(prazo, new Date("2026-08-12T22:00:01Z"))).toThrow(
      BadRequestException,
    );
  });

  it("recusa quando não há etapa aberta", () => {
    expect(() => assertPodeRenegociarPrazo(null, new Date())).toThrow(BadRequestException);
  });
});

describe("segregação de função", () => {
  it("bloqueia quem abriu o pedido de aprová-lo", () => {
    const solicitante = { id: pedidoBase.solicitanteId, roles: ["financeiro"] as RoleKey[] };
    expect(paresViolados("aprovar", pedidoBase, solicitante.id)).toContain("criou_e_aprova");
    expect(() => assertSegregacao("aprovar", pedidoBase, solicitante)).toThrow(ForbiddenException);
  });

  it("bloqueia quem selecionou a cotação de aprovar a compra", () => {
    const pedido = { ...pedidoBase, selecionouCotacaoId: FINANCEIRO.id };
    expect(() => assertSegregacao("aprovar", pedido, FINANCEIRO)).toThrow(ForbiddenException);
  });

  it("bloqueia quem aprovou de registrar o pagamento", () => {
    const pedido = { ...pedidoBase, aprovouId: FINANCEIRO.id };
    expect(() => assertSegregacao("pagar", pedido, FINANCEIRO)).toThrow(ForbiddenException);
  });

  it("bloqueia quem selecionou a cotação de confirmar o recebimento", () => {
    const pedido = { ...pedidoBase, selecionouCotacaoId: COMPRADOR.id };
    expect(() => assertSegregacao("receber", pedido, COMPRADOR)).toThrow(ForbiddenException);
  });

  it("deixa passar quando são pessoas diferentes", () => {
    const pedido = { ...pedidoBase, selecionouCotacaoId: COMPRADOR.id };
    expect(assertSegregacao("aprovar", pedido, FINANCEIRO)).toEqual({ dispensada: false, pares: [] });
  });

  it("aceita dispensa da diretoria com justificativa", () => {
    const pedido = { ...pedidoBase, selecionouCotacaoId: DIRETORIA.id };
    const resultado = assertSegregacao("aprovar", pedido, DIRETORIA, "equipe reduzida no feriado");
    expect(resultado.dispensada).toBe(true);
    expect(resultado.pares).toContain("cotou_e_aprova");
  });

  it("recusa dispensa de quem não é diretoria, mesmo com justificativa", () => {
    const pedido = { ...pedidoBase, selecionouCotacaoId: FINANCEIRO.id };
    expect(() => assertSegregacao("aprovar", pedido, FINANCEIRO, "estou sozinho hoje")).toThrow(
      ForbiddenException,
    );
  });
});

describe("alçada", () => {
  it("mantém a aprovação com o financeiro enquanto não houver teto — como o POP descreve", () => {
    expect(papeisQuePodemAprovar("999999.00")).toContain("financeiro");
  });
});

describe("acoesBloqueadas", () => {
  it("explica por que a aprovação está indisponível, em vez de sumir com o botão", () => {
    const bloqueadas = acoesBloqueadas(
      {
        ...pedidoBase,
        solicitanteId: FINANCEIRO.id,
        etapa: "aprovacao_compra",
        valorCotado: "100.00",
      },
      FINANCEIRO,
    );
    expect(bloqueadas).toHaveLength(1);
    expect(bloqueadas[0]).toEqual({ acao: "aprovacao", motivo: "quem abriu o pedido não pode aprová-lo" });
  });

  it("não bloqueia nada quando a etapa não é de decisão", () => {
    expect(
      acoesBloqueadas(
        { ...pedidoBase, solicitanteId: COMPRADOR.id, etapa: "cotacoes", valorCotado: null },
        COMPRADOR,
      ),
    ).toEqual([]);
  });
});

describe("alçada de renegociação de prazo", () => {
  it("usa o SLA do POP §3 como teto de cada etapa", () => {
    expect(tetoDeRenegociacao("cotacoes", null, null)).toBe(5);
    expect(tetoDeRenegociacao("aprovacao_compra", null, null)).toBe(2);
  });

  it("na retirada externa o teto é o cronograma que o fornecedor declarou", () => {
    expect(tetoDeRenegociacao("retirada", "aquisicao", 20)).toBe(20);
  });

  it("não usa o prazo do fornecedor na retirada do estoque", () => {
    expect(tetoDeRenegociacao("retirada", "estoque", 20)).toBe(5);
  });

  it("deixa Compras renegociar dentro da régua", () => {
    expect(() => assertAlcadaDePrazo(5, 5, ["compras"])).not.toThrow();
  });

  it("barra Compras de esticar além da régua", () => {
    expect(() => assertAlcadaDePrazo(30, 5, ["compras"])).toThrow(ForbiddenException);
  });

  it("deixa a diretoria esticar", () => {
    expect(() => assertAlcadaDePrazo(30, 5, ["diretoria"])).not.toThrow();
  });
});

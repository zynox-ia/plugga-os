import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AnexoDoLancamento, Lancamento } from "@plugga/shared";

import {
  anexosDaFicha,
  camposDoLancamento,
  camposTravadosNaAprovada,
  categoriasDaSaida,
  contaAPagarVazia,
  corpoDaEdicao,
  corpoDaNovaContaAPagar,
  eventosPorDia,
  fraseDoOmie,
  problemaDoAnexo,
  resumoDaTrilhaDoLancamento,
  trilhaDoLancamento,
  valorEmDigitacao,
} from "../app/lib/ficha-do-lancamento.ts";

const u = (n: number) => `6f1c2a3b-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pessoa = { id: u(90), nome: "Gerente Exemplo (sintético)" };
const saida: Lancamento = {
  id: u(1), tipo: "saida", codigo: "CP-0002", empresa: "plugga", etapa: "aberta", coluna: "preparo", emCobranca: false, cancelado: false,
  favorecido: { tipo: "fornecedor", id: u(2), nome: "Contabilidade Exemplo (sintético)" },
  categoria: { id: u(3), codigo: "2.03.02", nome: "Honorários contábeis", tipo: "despesa", natureza: "servico" },
  contaCorrente: { id: u(4), nome: "Itaú · Plugga" }, descricao: "Honorários contábeis · nov/2026", valor: "3800.00", vencimento: "2026-11-28",
  competencia: null, prazo: { situacao: "no_prazo", dias: 5 }, liquidadoEm: null, anexos: 0, omie: { estado: "nao_enviado", codigo: null, motivo: null },
  origem: { tipo: "avulsa", pedidoDeCompra: null }, createdAt: "2026-11-23T12:00:00.000Z",
  forma: "boleto", observacao: null,
  marcos: { criado: { por: pessoa, em: "2026-11-23T12:00:00.000Z" }, aprovado: null, pago: null, recebido: null, conciliado: null, cancelado: null },
  acoesPermitidas: ["aprovar", "cancelar"], podeEditar: true, updatedAt: "2026-11-23T12:00:00.000Z",
  arquivos: [], comprovanteAtual: null, linhaDoTempo: [], nf: null, envio: null, cobrancas: [], ucs: [], pendencias: [],
};

describe("trilha da ficha", () => {
  it("marca as etapas do tipo até a atual, e a 390 px vira 'N de M'", () => {
    assert.deepEqual(trilhaDoLancamento({ ...saida, etapa: "aprovada" }).map((p) => p.estado), ["feito", "atual", "futuro", "futuro"]);
    assert.deepEqual(resumoDaTrilhaDoLancamento({ ...saida, etapa: "aprovada" }), { posicao: 2, total: 4, atual: "Aprovada", proxima: "Paga" });
    assert.equal(trilhaDoLancamento({ ...saida, tipo: "entrada", etapa: "enviada" }).length, 6);
  });

  it("no cancelado, a etapa onde parou fica marcada e não há próxima", () => {
    assert.deepEqual(trilhaDoLancamento({ ...saida, cancelado: true }).map((p) => p.estado), ["cancelado", "futuro", "futuro", "futuro"]);
    assert.deepEqual(resumoDaTrilhaDoLancamento({ ...saida, cancelado: true }), { posicao: 1, total: 4, atual: "Cancelada em Aberta", proxima: null });
  });
});

describe("linha do tempo", () => {
  it("agrupa os eventos da API por dia de Manaus, com Hoje e Ontem pelo nome", () => {
    const evento = (em: string) => ({ tipo: "aprovado" as const, em, por: null, resumo: "Aprovada", texto: null });
    const dias = eventosPorDia([evento("2026-11-24T15:00:00.000Z"), evento("2026-11-23T03:30:00.000Z")], "2026-11-24"); // 22/11 23:30 em Manaus
    assert.deepEqual(dias.map((d) => d.rotulo), ["Hoje", "22/11/2026"]);
    assert.equal(eventosPorDia([evento("2026-11-23T15:00:00.000Z")], "2026-11-24")[0]?.rotulo, "Ontem");
  });
});

describe("anexos", () => {
  const anexo = (n: number, tipo: AnexoDoLancamento["tipo"], em: string, substituido = false): AnexoDoLancamento => ({
    id: u(n), tipo, nome: `arquivo-${n}.pdf`, nomePadronizado: null, tamanhoBytes: 1000, mime: "application/pdf",
    url: `/financeiro/lancamentos/${u(1)}/anexos/${u(n)}`, enviado: { por: pessoa, em }, substituido: substituido ? { por: pessoa, em } : null,
  });

  it("comprovante, NF e boleto trazem as versões substituídas; documentos ficam cada um por si, no fim", () => {
    const grupos = anexosDaFicha([
      anexo(20, "documento", "2026-11-23T10:00:00.000Z"),
      anexo(21, "comprovante", "2026-11-24T10:00:00.000Z", true),
      anexo(22, "comprovante", "2026-11-25T10:00:00.000Z"),
      anexo(23, "documento", "2026-11-25T11:00:00.000Z"),
      anexo(24, "comprovante", "2026-11-23T09:00:00.000Z", true),
    ]);
    assert.deepEqual(grupos.map((g) => [g.tipo, g.atual?.id, g.anteriores.map((a) => a.id)]), [
      ["comprovante", u(22), [u(21), u(24)]],
      ["documento", u(23), []],
      ["documento", u(20), []],
    ]);
    assert.deepEqual(anexosDaFicha([]), []);
  });

  it("confere tipo e tamanho antes de enviar", () => {
    assert.equal(problemaDoAnexo({ type: "application/pdf", size: 1000 }), null);
    assert.equal(problemaDoAnexo({ type: "image/png", size: 25 * 1024 * 1024 }), null);
    assert.equal(problemaDoAnexo({ type: "image/png", size: 25 * 1024 * 1024 + 1 }), "o arquivo passa de 25 MB.");
    assert.equal(problemaDoAnexo({ type: "text/plain", size: 10 }), "envie PDF, JPG ou PNG.");
    assert.equal(problemaDoAnexo(undefined), "escolha o arquivo.");
  });
});

describe("estado no OMIE", () => {
  it("diz para qual empresa vai, e só erro e divergência ganham o tom de perigo", () => {
    assert.deepEqual(fraseDoOmie(saida, "Plugga"), { texto: "Ainda não está no OMIE: vai para a Plugga quando for aprovada.", tom: "neutro" });
    assert.equal(fraseDoOmie({ ...saida, omie: { estado: "enviado", codigo: "8812934", motivo: null } }, "Waze Energia").texto, "No OMIE da Waze Energia · código 8812934.");
    assert.deepEqual(fraseDoOmie({ ...saida, omie: { estado: "erro", codigo: null, motivo: "A categoria não existe na Waze." } }, "Waze Energia"), { texto: "Não foi ao OMIE da Waze Energia: A categoria não existe na Waze.", tom: "perigo" });
    assert.equal(fraseDoOmie({ ...saida, omie: { estado: "divergente", codigo: "1", motivo: null } }, "Plugga").tom, "perigo");
  });
});

describe("nova conta a pagar e edição", () => {
  const preenchida = { ...contaAPagarVazia(), empresa: "plugga" as const, fornecedorId: u(2), categoriaId: u(3), contaCorrenteId: u(4), descricao: "  Honorários  ", valor: "1.234,56", vencimento: "2026-12-05", forma: "pix" as const };

  it("aponta cada campo que falta, com o nome do campo da API", () => {
    const { corpo, porCampo } = corpoDaNovaContaAPagar(contaAPagarVazia());
    assert.equal(corpo, undefined);
    assert.deepEqual(Object.keys(porCampo).sort(), ["categoriaId", "contaCorrenteId", "descricao", "empresa", "fornecedorId", "valor", "vencimento"]);
    assert.equal(porCampo.categoriaId, "escolha a empresa primeiro.");
  });

  it("monta o corpo com o valor em decimal e sem observação vazia; recusa o valor acima do teto", () => {
    assert.deepEqual(corpoDaNovaContaAPagar(preenchida).corpo, {
      empresa: "plugga", fornecedorId: u(2), categoriaId: u(3), contaCorrenteId: u(4), descricao: "Honorários", valor: "1234.56", vencimento: "2026-12-05", forma: "pix",
    });
    assert.ok(corpoDaNovaContaAPagar({ ...preenchida, valor: "1.000.000.000.000,00" }).porCampo.valor);
    assert.ok(corpoDaNovaContaAPagar({ ...preenchida, valor: "0" }).porCampo.valor);
  });

  it("o campo de valor guarda só dígitos, ponto e vírgula, na digitação e no colar", () => {
    assert.equal(valorEmDigitacao("abc1.234,56"), "1.234,56");
    assert.equal(valorEmDigitacao("R$ 27.350,00"), "27.350,00");
    assert.equal(valorEmDigitacao("-12e3"), "123");
    assert.equal(valorEmDigitacao(""), "");
  });

  it("a edição manda só o que mudou, sem empresa nem valor", () => {
    const antes = camposDoLancamento(saida);
    assert.equal(antes.valor, "3.800,00");
    assert.deepEqual(corpoDaEdicao(antes, antes).corpo, {});
    assert.deepEqual(corpoDaEdicao(antes, { ...antes, descricao: "Honorários de dez ", vencimento: "2026-12-10", valor: "9,99", empresa: "waze" }).corpo, { descricao: "Honorários de dez", vencimento: "2026-12-10" });
    assert.deepEqual(corpoDaEdicao(antes, { ...antes, observacao: "pagar cedo" }).corpo, { observacao: "pagar cedo" });
  });

  it("na saída aprovada, só a Gerente muda fornecedor, conta, forma e vencimento", () => {
    assert.equal(camposTravadosNaAprovada({ tipo: "saida", etapa: "aprovada" }, false), true);
    assert.equal(camposTravadosNaAprovada({ tipo: "saida", etapa: "aprovada" }, true), false);
    assert.equal(camposTravadosNaAprovada({ tipo: "saida", etapa: "aberta" }, false), false);
  });

  it("os menus mostram só as categorias de despesa ativas da empresa, mais a já escolhida se inativa", () => {
    const cat = (id: number, empresa: "plugga" | "waze", tipo: "despesa" | "receita", ativa: boolean, codigo: string) => ({ id: u(id), empresa, codigo, nome: codigo, tipo, natureza: "outros" as const, grupo: { codigo: codigo.slice(0, 4), nome: "G" }, ativa });
    const opcoes = { categorias: [cat(10, "plugga", "despesa", true, "2.10"), cat(11, "plugga", "despesa", true, "2.9"), cat(12, "plugga", "receita", true, "1.01"), cat(13, "waze", "despesa", true, "2.01"), cat(14, "plugga", "despesa", false, "2.05")] };
    assert.deepEqual(categoriasDaSaida(opcoes, "plugga").map((c) => c.codigo), ["2.9", "2.10"]);
    assert.deepEqual(categoriasDaSaida(opcoes, "plugga", u(14)).map((c) => c.codigo), ["2.05", "2.9", "2.10"]);
    assert.deepEqual(categoriasDaSaida(opcoes, null), []);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acaoDoPedidoSchema,
  acoesDoPedido,
  criarPedidoDeCompraSchema,
  etapasDeCompraComPrazo,
  PRAZO_DA_ETAPA_DE_COMPRA_EM_DIAS_UTEIS,
  registrarCotacaoSchema,
} from "../dist/compras.js";
import { criarFornecedorSchema, editarFornecedorSchema, listarFornecedoresQuerySchema, revelarDadosDePagamentoSchema } from "../dist/fornecedores.js";

// Documentos da faixa sintética do projeto (scripts/dados-sinteticos.mjs), com dígito verificador válido.
const CPF = "99999900100";
const CNPJ = "99999001000159";
const UUID = "00000000-0000-0000-0000-0000000000c1";

describe("criarFornecedorSchema", () => {
  it("aceita CPF ou CNPJ válido e grava só os dígitos", () => {
    assert.equal(criarFornecedorSchema.parse({ nome: "A", categoria: "servico", documento: "999.999.001-00" }).documento, CPF);
    assert.equal(criarFornecedorSchema.parse({ nome: "A", categoria: "kit_solar", documento: "99.999.001/0001-59" }).documento, CNPJ);
  });

  it("recusa documento com dígito errado ou tamanho fora de CPF/CNPJ", () => {
    assert.equal(criarFornecedorSchema.safeParse({ nome: "A", categoria: "servico", documento: "99999900101" }).success, false);
    assert.equal(criarFornecedorSchema.safeParse({ nome: "A", categoria: "servico", documento: "123456789012" }).success, false);
  });

  it("documento em branco vira não informado", () => {
    assert.equal(criarFornecedorSchema.parse({ nome: "A", categoria: "outros", documento: "  " }).documento, null);
  });

  it("exige nome e categoria na criação, mas não na edição", () => {
    assert.equal(criarFornecedorSchema.safeParse({ nome: "A" }).success, false);
    assert.equal(criarFornecedorSchema.safeParse({ categoria: "outros" }).success, false);
    assert.equal(editarFornecedorSchema.safeParse({ chavePix: "x" }).success, true);
  });

  it("recusa forma de pagamento repetida ou desconhecida", () => {
    assert.equal(criarFornecedorSchema.safeParse({ nome: "A", categoria: "outros", formasDePagamento: ["pix", "pix"] }).success, false);
    assert.equal(criarFornecedorSchema.safeParse({ nome: "A", categoria: "outros", formasDePagamento: ["cheque"] }).success, false);
  });

  it("recusa campo fora do contrato, como empresa (o cadastro é das duas)", () => {
    assert.equal(criarFornecedorSchema.safeParse({ nome: "A", categoria: "outros", empresa: "waze" }).success, false);
  });

  it("endereço: CEP só com os 8 dígitos e campos em branco viram não informado", () => {
    const f = criarFornecedorSchema.parse({ nome: "A", categoria: "outros", cep: "69.000-000", logradouro: "Rua X", numero: " ", bairro: "" });
    assert.equal(f.cep, "69000000");
    assert.equal(f.numero, null);
    assert.equal(f.bairro, null);
    assert.equal(criarFornecedorSchema.safeParse({ nome: "A", categoria: "outros", cep: "6900000" }).success, false);
  });

  it("revelar: mostrar e copiar exigem o campo; editar não leva campo", () => {
    assert.equal(revelarDadosDePagamentoSchema.safeParse({ motivo: "mostrar", campo: "pix" }).success, true);
    assert.equal(revelarDadosDePagamentoSchema.safeParse({ motivo: "copiar" }).success, false);
    assert.equal(revelarDadosDePagamentoSchema.safeParse({ motivo: "editar" }).success, true);
    assert.equal(revelarDadosDePagamentoSchema.safeParse({ motivo: "editar", campo: "banco" }).success, false);
  });

  it("lista todos por padrão", () => {
    assert.equal(listarFornecedoresQuerySchema.parse({}).situacao, "todos");
  });
});

describe("criarPedidoDeCompraSchema", () => {
  const base = { empresa: "plugga", titulo: "Cabos", itens: [{ descricao: "Cabo 6mm", quantidade: "100" }], prazoEntregaDesejado: "2026-12-01" };

  it("exige o vínculo do destino e só ele", () => {
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, destino: "interno" }).success, true);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, destino: "obra" }).success, false);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, destino: "obra", obraId: UUID }).success, true);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, destino: "cliente", obraId: UUID }).success, false);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, destino: "interno", clientId: UUID }).success, false);
  });

  it("exige a empresa, Plugga ou Waze", () => {
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, empresa: undefined, destino: "interno" }).success, false);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, empresa: "outra", destino: "interno" }).success, false);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, empresa: "waze", destino: "interno" }).success, true);
  });

  it("exige pelo menos um item com quantidade positiva", () => {
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, destino: "interno", itens: [] }).success, false);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, destino: "interno", itens: [{ descricao: "x", quantidade: "0" }] }).success, false);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, destino: "interno", itens: [{ descricao: "x", quantidade: "0.125" }] }).success, true);
  });
});

describe("registrarCotacaoSchema", () => {
  it("converte os campos de texto do multipart", () => {
    const cotacao = registrarCotacaoSchema.parse({ fornecedorId: UUID, valor: "1500.00", valorFrete: "", prazoEntregaDias: "12" });
    assert.equal(cotacao.valorFrete, null);
    assert.equal(cotacao.prazoEntregaDias, 12);
  });

  it("recusa valor zero", () => {
    assert.equal(registrarCotacaoSchema.safeParse({ fornecedorId: UUID, valor: "0" }).success, false);
  });
});

describe("acaoDoPedidoSchema", () => {
  it("revisar e cancelar exigem motivo", () => {
    assert.equal(acaoDoPedidoSchema.safeParse({ acao: "revisar" }).success, false);
    assert.equal(acaoDoPedidoSchema.safeParse({ acao: "cancelar", motivo: " " }).success, false);
    assert.equal(acaoDoPedidoSchema.safeParse({ acao: "cancelar", motivo: "Cliente desistiu" }).success, true);
  });

  it("recusa ação desconhecida", () => {
    assert.equal(acaoDoPedidoSchema.safeParse({ acao: "concluir" }).success, false);
  });
});

describe("achados da revisão do 00aac54", () => {
  const base = { empresa: "plugga", titulo: "Cabos", destino: "interno", itens: [{ descricao: "Cabo", quantidade: "1" }] };

  it("recusa dia inexistente", () => {
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, prazoEntregaDesejado: "2026-02-31" }).success, false);
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, prazoEntregaDesejado: "2028-02-29" }).success, true);
  });

  it("frete só com espaços vira não informado", () => {
    assert.equal(registrarCotacaoSchema.parse({ fornecedorId: UUID, valor: "10", valorFrete: "  " }).valorFrete, null);
  });

  it("orçado e faturado zero são recusados", () => {
    assert.equal(criarPedidoDeCompraSchema.safeParse({ ...base, prazoEntregaDesejado: "2026-12-01", valorOrcado: "0" }).success, false);
    assert.equal(acaoDoPedidoSchema.safeParse({ acao: "confirmar_recebimento", valorFaturado: "0" }).success, false);
  });

  it("a lista de ações tem todas as ações da união", () => {
    const daUniao = acaoDoPedidoSchema.options.map((opcao) => opcao.shape.acao.value).sort();
    assert.deepEqual([...acoesDoPedido].sort(), daUniao);
  });
});

describe("prazos", () => {
  it("toda etapa com prazo tem prazo e concluido não", () => {
    assert.deepEqual(etapasDeCompraComPrazo, ["pedido_gerado", "analise_estoque", "cotacoes", "aprovacao_compra", "pagamento", "retirada"]);
    assert.equal(Object.values(PRAZO_DA_ETAPA_DE_COMPRA_EM_DIAS_UTEIS).reduce((a, b) => a + b, 0), 18);
  });
});

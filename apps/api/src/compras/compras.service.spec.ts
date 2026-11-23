import type { Acesso } from "@plugga/shared";
import { describe, expect, it, vi } from "vitest";

import { AcessoNegado, EstadoInvalido, RequisicaoInvalida, TipoNaoPermitido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import type { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { ComprasService } from "./compras.service";
import type { PrismaComprasRepository } from "./prisma-compras.repository";

const ID = "00000000-0000-4000-8000-000000000401";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b00000000049454e44ae426082", "hex");

const principal = (acesso: Acesso): AuthPrincipal => ({ id: "00000000-0000-4000-8000-000000000001", kind: "user", acesso });
const compras = principal({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.compras"] }] });
const financeiroMembro = principal({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro" }] });
const financeiroGerente = principal({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente" }] });
const fornecedoresSo = principal({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.fornecedores"] }] });

function montar() {
  const repositorio = {
    executarAcao: vi.fn().mockResolvedValue(undefined),
    criar: vi.fn().mockResolvedValue(ID),
    estado: vi.fn().mockResolvedValue({ etapa: "cotacoes", canceladoEm: null, companyId: "plugga" }),
    registrarCotacao: vi.fn().mockResolvedValue("cotacao"),
    registrarComprovante: vi.fn().mockResolvedValue(undefined),
    buscarClientes: vi.fn().mockResolvedValue([]),
  };
  const armazenamento = { enviar: vi.fn().mockResolvedValue(undefined), excluir: vi.fn().mockResolvedValue(undefined) };
  const servico = new ComprasService(repositorio as unknown as PrismaComprasRepository, armazenamento as unknown as ArmazenamentoDeDocumentos, () => new Date("2026-11-23T14:00:00Z"));
  // O detalhe devolvido depois de cada escrita não é o que estes testes olham.
  vi.spyOn(servico, "obter").mockResolvedValue({} as never);
  return { servico, repositorio, armazenamento };
}

describe("acesso por papel", () => {
  it("quem opera Compras cria; o Financeiro e a tela de Fornecedores não", async () => {
    const { servico } = montar();
    const pedido = {} as never;
    await expect(servico.criar(pedido, compras)).resolves.toBeDefined();
    await expect(servico.criar(pedido, financeiroGerente)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(servico.criar(pedido, fornecedoresSo)).rejects.toBeInstanceOf(AcessoNegado);
  });

  it("aprovar e revisar só com o gerente do Financeiro; pagar com quem é do Financeiro", async () => {
    const { servico, repositorio } = montar();
    await expect(servico.executarAcao(ID, { acao: "aprovar" }, compras)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(servico.executarAcao(ID, { acao: "aprovar" }, financeiroMembro)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(servico.executarAcao(ID, { acao: "revisar", motivo: "x" }, financeiroGerente)).resolves.toBeDefined();
    await expect(servico.executarAcao(ID, { acao: "registrar_pagamento", forma: "pix" }, compras)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(servico.executarAcao(ID, { acao: "registrar_pagamento", forma: "pix" }, financeiroMembro)).resolves.toBeDefined();
    expect(repositorio.executarAcao).toHaveBeenCalledTimes(2);
  });

  it("a recusa de acesso acontece antes de tocar o banco", async () => {
    const { servico, repositorio } = montar();
    await expect(servico.executarAcao(ID, { acao: "iniciar_analise" }, financeiroMembro)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(servico.executarAcao(ID, { acao: "iniciar_analise" }, fornecedoresSo)).rejects.toBeInstanceOf(AcessoNegado);
    expect(repositorio.executarAcao).not.toHaveBeenCalled();
  });

  it("a busca de clientes do destino é de quem opera Compras", async () => {
    const { servico } = montar();
    await expect(servico.buscarClientes({ busca: "ho" }, financeiroGerente)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(servico.buscarClientes({ busca: "ho" }, compras)).resolves.toEqual({ itens: [] });
  });
});

describe("anexos", () => {
  const cotacao = { fornecedorId: ID, valor: "10.00" };

  it("aceita PDF e imagem, conferidos pelo conteúdo, e guarda sob suprimentos/compras", async () => {
    const { servico, armazenamento, repositorio } = montar();
    await servico.registrarCotacao(ID, cotacao, { buffer: PDF, nomeOriginal: "orcamento.pdf" }, compras);
    await servico.registrarCotacao(ID, cotacao, { buffer: PNG, nomeOriginal: "foto.png" }, compras);
    expect(armazenamento.enviar.mock.calls.map((chamada) => chamada[2])).toEqual(["application/pdf", "image/png"]);
    expect(armazenamento.enviar.mock.calls[0]![0]).toMatch(new RegExp(`^suprimentos/compras/${ID}/cotacoes/`));
    expect(repositorio.registrarCotacao.mock.calls[0]![2]).toMatchObject({ nome: "orcamento.pdf", tipo: "application/pdf", tamanho: PDF.length });
  });

  it("recusa anexo ausente, vazio ou de outro tipo, mesmo com extensão de PDF", async () => {
    const { servico, armazenamento } = montar();
    await expect(servico.registrarCotacao(ID, cotacao, undefined, compras)).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(servico.registrarCotacao(ID, cotacao, { buffer: Buffer.alloc(0), nomeOriginal: "a.pdf" }, compras)).rejects.toBeInstanceOf(TipoNaoPermitido);
    await expect(servico.registrarCotacao(ID, cotacao, { buffer: Buffer.from("texto qualquer"), nomeOriginal: "a.pdf" }, compras)).rejects.toBeInstanceOf(TipoNaoPermitido);
    expect(armazenamento.enviar).not.toHaveBeenCalled();
  });

  it("fora da etapa, a cotação e o comprovante são recusados antes de subir o arquivo", async () => {
    const { servico, armazenamento, repositorio } = montar();
    repositorio.estado.mockResolvedValue({ etapa: "aprovacao_compra", canceladoEm: null, companyId: "plugga" });
    await expect(servico.registrarCotacao(ID, cotacao, { buffer: PDF, nomeOriginal: "a.pdf" }, compras)).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(servico.registrarComprovante(ID, { buffer: PDF, nomeOriginal: "a.pdf" }, financeiroMembro)).rejects.toBeInstanceOf(EstadoInvalido);
    expect(armazenamento.enviar).not.toHaveBeenCalled();
  });

  it("se a gravação da cotação falha, o arquivo enviado é apagado", async () => {
    const { servico, armazenamento, repositorio } = montar();
    repositorio.registrarCotacao.mockRejectedValueOnce(new Error("etapa errada"));
    await expect(servico.registrarCotacao(ID, cotacao, { buffer: PDF, nomeOriginal: "a.pdf" }, compras)).rejects.toThrow("etapa errada");
    expect(armazenamento.excluir).toHaveBeenCalledWith(armazenamento.enviar.mock.calls[0]![0]);
  });

  it("o comprovante é de quem paga, e trocar o comprovante não apaga nada do armazenamento", async () => {
    const { servico, armazenamento, repositorio } = montar();
    repositorio.estado.mockResolvedValue({ etapa: "pagamento", canceladoEm: null, companyId: "plugga" });
    await expect(servico.registrarComprovante(ID, { buffer: PDF, nomeOriginal: "pix.pdf" }, compras)).rejects.toBeInstanceOf(AcessoNegado);
    await servico.registrarComprovante(ID, { buffer: PDF, nomeOriginal: "pix.pdf" }, financeiroMembro);
    await servico.registrarComprovante(ID, { buffer: PDF, nomeOriginal: "pix-corrigido.pdf" }, financeiroMembro);
    expect(armazenamento.enviar).toHaveBeenCalledTimes(2);
    expect(armazenamento.excluir).not.toHaveBeenCalled();
  });
});

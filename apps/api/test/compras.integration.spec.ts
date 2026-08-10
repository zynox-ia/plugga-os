import { randomUUID } from "node:crypto";

import type { CriarPedidoRequest } from "@plugga/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaComprasRepository } from "../src/compras/prisma-compras.repository";
import { PrismaService } from "../src/prisma/prisma.service";
import type { AuthPrincipal } from "../src/core/auth/auth.types";

/**
 * Compras contra o Postgres de verdade.
 *
 * O e2e do módulo troca o repositório por um dublê em memória, o que exercita
 * HTTP, papéis e validação — mas deixa **o repositório Prisma inteiro sem
 * cobertura**: transações, o índice único parcial, os CHECK da migração, a
 * numeração por empresa, a escrita no `event_log` e a agregação dos indicadores
 * nunca eram tocados. Um erro de mapeamento coluna→campo no scorecard (trocar
 * faturado por cotado, por exemplo) passaria batido nos dois lugares.
 *
 * Atrás de `RUN_COMPRAS_INTEGRATION_TESTS`, como os demais testes de banco do
 * repositório: a suíte padrão continua hermética e roda sem infraestrutura.
 */

const habilitado = process.env.RUN_COMPRAS_INTEGRATION_TESTS === "true";
const describeBanco = habilitado ? describe : describe.skip;

describeBanco("Compras contra o Postgres", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaComprasRepository(prisma);

  const marca = `it-${randomUUID().slice(0, 8)}`;
  const solicitante: AuthPrincipal = { id: "", kind: "user", roles: ["compras"] };
  const comprador: AuthPrincipal = { id: "", kind: "user", roles: ["compras"] };
  const financeiro: AuthPrincipal = { id: "", kind: "user", roles: ["financeiro"] };
  let obraId = "";
  let fornecedorId = "";
  let fornecedorWazeId = "";

  beforeAll(async () => {
    await prisma.$connect();

    const criarPessoa = async (papel: string): Promise<string> => {
      const user = await prisma.user.create({
        data: { email: `${marca}-${papel}@teste.local`, name: `${marca} ${papel}`, status: "active" },
      });
      return user.id;
    };
    solicitante.id = await criarPessoa("solicitante");
    comprador.id = await criarPessoa("comprador");
    financeiro.id = await criarPessoa("financeiro");

    const obra = await prisma.obra.create({ data: { companyId: "plugga", nome: `${marca} obra` } });
    obraId = obra.id;
    const fornecedor = await prisma.fornecedor.create({
      data: { companyId: "plugga", nome: `${marca} fornecedor` },
    });
    fornecedorId = fornecedor.id;
    const fornecedorWaze = await prisma.fornecedor.create({
      data: { companyId: "waze", nome: `${marca} fornecedor waze` },
    });
    fornecedorWazeId = fornecedorWaze.id;
  });

  afterAll(async () => {
    // Limpa só o que este arquivo criou: a marca aleatória isola de qualquer
    // outra coisa no banco de desenvolvimento.
    //
    // O `event_log` fica. Ele é append-only por regra do próprio banco — a
    // migração inicial impede DELETE — e é assim que deve ser: trilha de
    // auditoria que o teste consegue apagar não é trilha. As linhas apontam
    // para pedidos que deixaram de existir, o que é o comportamento normal de
    // um log de eventos.
    const pedidos = await prisma.pedidoDeCompra.findMany({
      where: { titulo: { startsWith: marca } },
      select: { id: true },
    });
    const ids = pedidos.map((pedido) => pedido.id);
    await prisma.pedidoDeCompra.deleteMany({ where: { id: { in: ids } } });
    await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.obra.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.$disconnect();
  });

  function pedidoValido(extra: Partial<CriarPedidoRequest> = {}): CriarPedidoRequest {
    return {
      companyId: "plugga",
      titulo: `${marca} cabos`,
      itens: [{ descricao: "Cabo 10mm", quantidade: "150.000", unidade: "m" }],
      destino: "obra",
      obraId,
      responsavelId: comprador.id,
      prazoEntregaDesejado: "2026-09-01T12:00:00.000Z",
      valorOrcado: "5000.00",
      cotacoes: [{ fornecedorId, valor: "4800.00", prazoEntregaDias: 12 }],
      ...extra,
    } as CriarPedidoRequest;
  }

  const anexo = [{ arquivoChave: "cotacoes/teste/orc.pdf", arquivoNome: "orc.pdf" }];

  async function criar(extra: Partial<CriarPedidoRequest> = {}) {
    return repositorio.criarPedido(pedidoValido(extra), anexo, solicitante);
  }

  it("cria pedido, itens, cotação e a primeira passagem numa transação só", async () => {
    const pedido = await criar();

    expect(pedido.itens).toHaveLength(1);
    expect(pedido.cotacoes).toHaveLength(1);
    expect(pedido.etapas).toHaveLength(1);
    expect(pedido.etapas[0]?.etapa).toBe("pedido_gerado");
    expect(pedido.etapas[0]?.prazoDiasUteis).toBe(2);

    const eventos = await prisma.eventLog.findMany({ where: { entityId: pedido.id } });
    expect(eventos.map((evento) => evento.eventName)).toContain("compras.pedido_criado");
  });

  it("numera por empresa, não por sequência global", async () => {
    const primeiro = await criar();
    const segundo = await criar();
    expect(segundo.numero).toBe(primeiro.numero + 1);

    const maiorNaWaze = await prisma.pedidoDeCompra.aggregate({
      where: { companyId: "waze" },
      _max: { numero: true },
    });
    // A numeração da Plugga não empurra a da Waze: são contadores distintos.
    expect(maiorNaWaze._max.numero ?? 0).toBeLessThan(primeiro.numero);
  });

  it("recusa cotação de fornecedor de outra empresa", async () => {
    await expect(criar({ cotacoes: [{ fornecedorId: fornecedorWazeId, valor: "10.00" }] })).rejects.toThrow();
  });

  it("o banco recusa destino incoerente, mesmo passando por fora da aplicação", async () => {
    await expect(
      prisma.pedidoDeCompra.create({
        data: {
          companyId: "plugga",
          numero: 999_999,
          titulo: `${marca} incoerente`,
          destino: "interno",
          obraId, // interno não aceita obra: o CHECK da migração barra
          solicitanteId: solicitante.id,
          prazoEntregaDesejado: new Date(),
          valorOrcado: "10.00",
        },
      }),
    ).rejects.toThrow();
  });

  it("o banco recusa orçado zero — o denominador do §4.1", async () => {
    await expect(
      prisma.pedidoDeCompra.create({
        data: {
          companyId: "plugga",
          numero: 999_998,
          titulo: `${marca} sem orcado`,
          destino: "interno",
          solicitanteId: solicitante.id,
          prazoEntregaDesejado: new Date(),
          valorOrcado: "0",
        },
      }),
    ).rejects.toThrow();
  });

  it("o banco recusa uma segunda passagem aberta no mesmo pedido", async () => {
    const pedido = await criar();
    await expect(
      prisma.pedidoDeCompraEtapa.create({
        data: {
          pedidoId: pedido.id,
          etapa: "cotacoes",
          entrouEm: new Date(),
          prazoDiasUteis: 5,
          prazoEm: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("o banco recusa passagem da etapa terminal", async () => {
    const pedido = await criar();
    await prisma.pedidoDeCompraEtapa.updateMany({
      where: { pedidoId: pedido.id, saiuEm: null },
      data: { saiuEm: new Date() },
    });
    await expect(
      prisma.pedidoDeCompraEtapa.create({
        data: {
          pedidoId: pedido.id,
          etapa: "concluido",
          entrouEm: new Date(),
          prazoDiasUteis: 1,
          prazoEm: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("percorre o caminho externo inteiro e conclui", async () => {
    const criado = await criar();
    const id = criado.id;

    await repositorio.triagem(id, "plugga", {}, comprador);
    await repositorio.decidirEstoque(id, "plugga", { possuiEmEstoque: false }, comprador);
    await repositorio.validarNecessidade(id, "plugga", {}, comprador);
    const cotacaoId = criado.cotacoes[0]?.id as string;
    await repositorio.selecionarCotacao(id, "plugga", { cotacaoId }, comprador);
    await repositorio.decidirAprovacao(id, "plugga", { aprovada: true }, financeiro);

    const pago = await repositorio.registrarPagamento(
      id,
      "plugga",
      { valorFaturado: "4800.00" },
      { ...financeiro, id: comprador.id, roles: ["financeiro"] },
    );
    // O prazo da retirada veio do cronograma declarado pelo fornecedor (12).
    const retiradaAberta = pago.etapas.find((etapa) => etapa.etapa === "retirada" && etapa.saiuEm === null);
    expect(retiradaAberta?.prazoDiasUteis).toBe(12);

    const concluido = await repositorio.confirmarRecebimento(id, "plugga", {}, solicitante);
    expect(concluido.etapa).toBe("concluido");
    expect(concluido.concluidoEm).not.toBeNull();
    // Terminal não abre passagem, e nenhuma fica aberta no fim.
    expect(concluido.etapas.some((etapa) => etapa.etapa === "concluido")).toBe(false);
    expect(concluido.etapas.every((etapa) => etapa.saiuEm !== null)).toBe(true);
  });

  it("o REVISAR grava uma segunda passagem por cotações e limpa a seleção", async () => {
    const criado = await criar();
    const id = criado.id;
    const cotacaoId = criado.cotacoes[0]?.id as string;

    await repositorio.triagem(id, "plugga", {}, comprador);
    await repositorio.decidirEstoque(id, "plugga", { possuiEmEstoque: false }, comprador);
    await repositorio.validarNecessidade(id, "plugga", {}, comprador);
    await repositorio.selecionarCotacao(id, "plugga", { cotacaoId }, comprador);

    const revisado = await repositorio.decidirAprovacao(
      id,
      "plugga",
      { aprovada: false, motivo: "renegociar frete com o fornecedor" },
      financeiro,
    );
    expect(revisado.etapa).toBe("cotacoes");
    expect(revisado.cotacaoSelecionadaId).toBeNull();
    expect(revisado.valorCotado).toBeNull();
    expect(revisado.etapas.filter((etapa) => etapa.etapa === "cotacoes")).toHaveLength(2);
  });

  it("a leitura é sempre recortada por empresa", async () => {
    const pedido = await criar();
    await expect(repositorio.pedido(pedido.id, "waze", solicitante)).rejects.toThrow();
    const daWaze = await repositorio.listarPedidos({ companyId: "waze" });
    expect(daWaze.items.some((item) => item.id === pedido.id)).toBe(false);
  });

  it("o scorecard lê os valores certos das colunas certas", async () => {
    const criado = await criar();
    const id = criado.id;
    const cotacaoId = criado.cotacoes[0]?.id as string;

    await repositorio.triagem(id, "plugga", {}, comprador);
    await repositorio.decidirEstoque(id, "plugga", { possuiEmEstoque: false }, comprador);
    await repositorio.validarNecessidade(id, "plugga", {}, comprador);
    await repositorio.selecionarCotacao(id, "plugga", { cotacaoId }, comprador);
    await repositorio.decidirAprovacao(id, "plugga", { aprovada: true }, financeiro);
    // Faturado propositalmente diferente do cotado: se o mapeamento trocar as
    // colunas, a assertividade sai 100% e este teste pega.
    await repositorio.registrarPagamento(
      id,
      "plugga",
      { valorFaturado: "4500.00" },
      { ...financeiro, id: comprador.id, roles: ["financeiro"] },
    );
    await repositorio.confirmarRecebimento(id, "plugga", {}, solicitante);

    const agora = new Date();
    const scorecard = await repositorio.scorecard({
      companyId: "plugga",
      de: new Date(agora.getTime() - 86_400_000).toISOString(),
      ate: new Date(agora.getTime() + 86_400_000).toISOString(),
    });

    const global = scorecard.assertividadeGlobal;
    expect(global.pedidosConsiderados).toBeGreaterThanOrEqual(1);
    expect(Number(global.totalFaturado)).toBeLessThan(Number(global.totalOrcado));
    expect(global.percentual).not.toBe(100);

    const cotacoes = scorecard.cumprimentoSla.find((linha) => linha.etapa === "cotacoes");
    expect(cotacoes?.concluidas).toBeGreaterThanOrEqual(1);
    expect(scorecard.cumprimentoSla.some((linha) => linha.etapa === "concluido")).toBe(false);
  });

  it("o diagnóstico separa orçamentária de execução com os valores do banco", async () => {
    const agora = new Date();
    const diagnostico = await repositorio.diagnostico({
      companyId: "plugga",
      de: new Date(agora.getTime() - 86_400_000).toISOString(),
      ate: new Date(agora.getTime() + 86_400_000).toISOString(),
    });
    // Cotado 4800 sobre orçado 5000, faturado 4500 sobre cotado 4800.
    expect(Number(diagnostico.assertividadeOrcamentaria.totalCotado)).toBeGreaterThan(0);
    expect(Number(diagnostico.assertividadeExecucao.totalFaturado)).toBeGreaterThan(0);
    expect(diagnostico.assertividadeOrcamentaria.percentual).not.toBeNull();
  });

  it("renegociar recalcula o vencimento a partir da entrada na etapa", async () => {
    const pedido = await criar();
    const antes = pedido.etapas[0];

    const depois = await repositorio.renegociarPrazo(
      pedido.id,
      "plugga",
      { prazoDiasUteis: 2, motivo: "aguardando retorno do almoxarifado central" },
      comprador,
    );
    const passagem = depois.etapas.find((etapa) => etapa.saiuEm === null);
    expect(passagem?.prazoDiasUteis).toBe(2);
    expect(passagem?.entrouEm).toBe(antes?.entrouEm);

    const eventos = await prisma.eventLog.findMany({ where: { entityId: pedido.id } });
    expect(eventos.map((evento) => evento.eventName)).toContain("compras.prazo_renegociado");
  });

  it("Compras não estica o prazo além da régua do POP §3", async () => {
    const pedido = await criar();
    await expect(
      repositorio.renegociarPrazo(
        pedido.id,
        "plugga",
        { prazoDiasUteis: 30, motivo: "quero ficar verde no indicador" },
        comprador,
      ),
    ).rejects.toThrow();
  });
});

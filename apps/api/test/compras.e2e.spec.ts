import { ForbiddenException, NotFoundException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  CompanyKey,
  ComprasEtapa,
  ConfirmarRecebimentoRequest,
  CriarFornecedorRequest,
  CriarObraRequest,
  CriarPedidoRequest,
  DecisaoAprovacaoRequest,
  DecisaoEstoqueRequest,
  DiagnosticoCompras,
  Fornecedor,
  FornecedorLista,
  Obra,
  ObraLista,
  PedidoDetalhe,
  PedidoLista,
  PedidoListaQuery,
  PeriodoQuery,
  RegistrarPagamentoRequest,
  RenegociarPrazoRequest,
  ScorecardCompras,
  SelecionarCotacaoRequest,
  TriagemRequest,
  ValidarNecessidadeRequest,
} from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { ArmazenamentoDeCotacoes } from "../src/compras/armazenamento-de-cotacoes";
import { ComprasEscopoRepository } from "../src/compras/compras-escopo.repository";
import { ComprasRepository, type AnexoDeCotacao } from "../src/compras/compras.repository";
import {
  acoesBloqueadas,
  assertAlcada,
  assertAlcadaDePrazo,
  assertConfirmacaoDeRecebimento,
  assertEtapaAtual,
  assertPagamentoTemFaturado,
  assertPodeRenegociarPrazo,
  assertPodeSeguirParaAprovacao,
  assertSegregacao,
  assertTransicaoPermitida,
} from "../src/compras/compras.rules";
import { tetoDeRenegociacao } from "../src/compras/compras.rules";
import { adicionaDiasUteis, prazoDaEtapa } from "../src/compras/sla/dias-uteis";
import type { AuthPrincipal } from "../src/core/auth/auth.types";

const FORNECEDOR_ID = "00000000-0000-4000-8000-000000000101";
const OBRA_ID = "00000000-0000-4000-8000-000000000102";
const RESPONSAVEL_ID = "00000000-0000-4000-8000-000000000201";

/** Pessoas distintas: sem isso a segregação de função não teria o que separar. */
const SOLICITANTE = { id: "local-solicitante", roles: "opm" };
const COMPRADOR = { id: "local-compras", roles: "compras" };
/**
 * Segunda pessoa em Compras. Não é conveniência de teste: a quarta regra de
 * segregação impede que quem escolheu o fornecedor ateste que o material dele
 * chegou, então o caminho externo do POP exige duas pessoas no papel `compras`.
 */
const COMPRADOR_2 = { id: "local-compras-2", roles: "compras" };
const FINANCEIRO = { id: "local-financeiro", roles: "financeiro" };
const DIRETORIA = { id: "local-diretoria", roles: "diretoria" };

/**
 * Dublê em memória do `ComprasRepository`, no mesmo padrão do e2e comercial:
 * exercita HTTP + RBAC + Zod sem Postgres vivo, e **reusa as funções de regra
 * que o repositório Prisma chama** (`compras.rules.ts`, `sla/dias-uteis.ts`) em
 * vez de reimplementá-las — é o que impede o dublê de divergir da produção sem
 * ninguém perceber.
 */
class ComprasEmMemoria extends ComprasRepository {
  private pedidos = new Map<string, PedidoDetalhe>();
  private sequencia = 0;
  readonly eventos: { nome: string; pedidoId: string; ator: string; payload: unknown }[] = [];

  private proximoId(): string {
    this.sequencia += 1;
    return `00000000-0000-4000-8000-9${String(this.sequencia).padStart(11, "0")}`;
  }

  limpar(): void {
    this.pedidos.clear();
    this.sequencia = 0;
    this.eventos.length = 0;
    // Sem estas duas linhas o estado vaza entre testes: `sequencia` volta a
    // zero, os ids se repetem, e quem selecionou a cotação no teste anterior
    // continua "selecionando" a do pedido seguinte. Foi o que fez esta suíte
    // depender da ordem de execução.
    this.selecionouPor.clear();
    this.aprovouPor.clear();
  }

  private registrar(nome: string, pedidoId: string, principal: AuthPrincipal, payload: unknown): void {
    this.eventos.push({ nome, pedidoId, ator: principal.id, payload });
  }

  private carregar(id: string, companyId: string): PedidoDetalhe {
    const pedido = this.pedidos.get(id);
    // Mesma regra do Prisma: pedido de outra empresa é 404, não 403.
    if (!pedido || pedido.companyId !== companyId) {
      throw new NotFoundException("pedido de compra não encontrado");
    }
    return pedido;
  }

  private paraSegregacao(pedido: PedidoDetalhe) {
    return {
      solicitanteId: pedido.solicitanteId,
      selecionouCotacaoId: this.selecionouPor.get(pedido.id) ?? null,
      aprovouId: this.aprovouPor.get(pedido.id) ?? null,
    };
  }

  private selecionouPor = new Map<string, string>();
  private aprovouPor = new Map<string, string>();

  private abrirPassagem(pedido: PedidoDetalhe, etapa: ComprasEtapa, prazoFornecedorDias: number | null): void {
    if (etapa === "concluido") return;
    const agora = new Date();
    const { prazoDiasUteis, prazoEm } = prazoDaEtapa({
      etapa: etapa as Exclude<ComprasEtapa, "concluido">,
      entrouEm: agora,
      origemAtendimento: pedido.origemAtendimento,
      prazoFornecedorDias,
    });
    pedido.etapas.push({
      id: this.proximoId(),
      etapa,
      entrouEm: agora.toISOString(),
      prazoDiasUteis,
      prazoEm: prazoEm.toISOString(),
      saiuEm: null,
      cumpriuPrazo: null,
      responsavelId: pedido.responsavelId,
      responsavelNome: null,
    });
  }

  private fecharPassagem(pedido: PedidoDetalhe): void {
    const aberta = pedido.etapas.find((etapa) => etapa.saiuEm === null);
    if (!aberta) return;
    const agora = new Date();
    aberta.saiuEm = agora.toISOString();
    aberta.cumpriuPrazo = agora <= new Date(aberta.prazoEm);
  }

  private comBloqueios(pedido: PedidoDetalhe, principal: AuthPrincipal): PedidoDetalhe {
    return {
      ...pedido,
      acoesBloqueadas: acoesBloqueadas(
        { ...this.paraSegregacao(pedido), etapa: pedido.etapa, valorCotado: pedido.valorCotado },
        { id: principal.id, roles: principal.roles },
      ),
    };
  }

  async listarPedidos(query: PedidoListaQuery): Promise<PedidoLista> {
    return {
      items: [...this.pedidos.values()].filter(
        (pedido) =>
          pedido.companyId === query.companyId &&
          (!query.etapa || pedido.etapa === query.etapa) &&
          (!query.responsavelId || pedido.responsavelId === query.responsavelId) &&
          (!query.situacaoPrazo || pedido.situacaoPrazo === query.situacaoPrazo),
      ),
    };
  }

  async pedido(id: string, companyId: string, principal: AuthPrincipal): Promise<PedidoDetalhe> {
    return this.comBloqueios(this.carregar(id, companyId), principal);
  }

  async criarPedido(
    input: CriarPedidoRequest,
    anexos: readonly AnexoDeCotacao[],
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const id = this.proximoId();
    const agora = new Date().toISOString();
    const pedido: PedidoDetalhe = {
      id,
      companyId: input.companyId,
      numero: this.pedidos.size + 1,
      titulo: input.titulo,
      etapa: "pedido_gerado",
      origemAtendimento: null,
      destino: input.destino,
      obraId: input.obraId ?? null,
      obraNome: input.obraId ? "Obra semeada" : null,
      clientId: input.clientId ?? null,
      clientNome: null,
      solicitanteId: principal.id,
      solicitanteNome: principal.id,
      responsavelId: input.responsavelId,
      responsavelNome: null,
      prazoEntregaDesejado: input.prazoEntregaDesejado,
      valorOrcado: input.valorOrcado,
      valorCotado: null,
      valorFaturado: null,
      prazoEtapaEm: null,
      situacaoPrazo: "no_prazo",
      concluidoEm: null,
      createdAt: agora,
      updatedAt: agora,
      necessidadeValidadaEm: null,
      cotacaoSelecionadaId: null,
      itens: input.itens.map((item) => ({
        id: this.proximoId(),
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade ?? null,
      })),
      cotacoes: input.cotacoes.map((cotacao, indice) => ({
        id: this.proximoId(),
        fornecedorId: cotacao.fornecedorId,
        fornecedorNome: "Fornecedor semeado",
        valor: cotacao.valor,
        valorFrete: cotacao.valorFrete ?? null,
        prazoEntregaDias: cotacao.prazoEntregaDias ?? null,
        condicoesPagamento: cotacao.condicoesPagamento ?? null,
        arquivoNome: anexos[indice]?.arquivoNome ?? "orcamento.pdf",
        selecionada: false,
        createdAt: agora,
      })),
      etapas: [],
      acoesBloqueadas: [],
    };
    this.pedidos.set(id, pedido);
    this.abrirPassagem(pedido, "pedido_gerado", null);
    this.registrar("compras.pedido_criado", id, principal, { numero: pedido.numero });
    return this.comBloqueios(pedido, principal);
  }

  async triagem(
    id: string,
    companyId: string,
    input: TriagemRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "pedido_gerado");
    assertTransicaoPermitida(pedido.etapa, "analise_estoque");
    this.fecharPassagem(pedido);
    pedido.responsavelId = input.responsavelId ?? pedido.responsavelId;
    pedido.etapa = "analise_estoque";
    this.abrirPassagem(pedido, "analise_estoque", null);
    this.registrar("compras.etapa_movida", id, principal, { para: "analise_estoque" });
    return this.comBloqueios(pedido, principal);
  }

  async decidirEstoque(
    id: string,
    companyId: string,
    input: DecisaoEstoqueRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "analise_estoque");
    const para: ComprasEtapa = input.possuiEmEstoque ? "retirada" : "cotacoes";
    assertTransicaoPermitida(pedido.etapa, para);
    this.fecharPassagem(pedido);
    pedido.origemAtendimento = input.possuiEmEstoque ? "estoque" : "aquisicao";
    pedido.etapa = para;
    this.abrirPassagem(pedido, para, null);
    this.registrar("compras.estoque_decidido", id, principal, input);
    return this.comBloqueios(pedido, principal);
  }

  async validarNecessidade(
    id: string,
    companyId: string,
    input: ValidarNecessidadeRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "cotacoes");
    pedido.necessidadeValidadaEm = new Date().toISOString();
    this.registrar("compras.necessidade_validada", id, principal, input);
    return this.comBloqueios(pedido, principal);
  }

  async selecionarCotacao(
    id: string,
    companyId: string,
    input: SelecionarCotacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "cotacoes");
    assertTransicaoPermitida(pedido.etapa, "aprovacao_compra");
    const cotacao = pedido.cotacoes.find((linha) => linha.id === input.cotacaoId);
    if (!cotacao) throw new NotFoundException("cotação não encontrada neste pedido");
    assertPodeSeguirParaAprovacao({
      necessidadeValidadaEm: pedido.necessidadeValidadaEm ? new Date(pedido.necessidadeValidadaEm) : null,
      cotacaoSelecionadaId: input.cotacaoId,
    });

    this.fecharPassagem(pedido);
    pedido.cotacaoSelecionadaId = input.cotacaoId;
    pedido.cotacoes = pedido.cotacoes.map((linha) => ({ ...linha, selecionada: linha.id === input.cotacaoId }));
    pedido.valorCotado = (Number(cotacao.valor) + Number(cotacao.valorFrete ?? 0)).toFixed(2);
    this.selecionouPor.set(id, principal.id);
    pedido.etapa = "aprovacao_compra";
    this.abrirPassagem(pedido, "aprovacao_compra", null);
    this.registrar("compras.cotacao_selecionada", id, principal, { cotacaoId: input.cotacaoId });
    return this.comBloqueios(pedido, principal);
  }

  async decidirAprovacao(
    id: string,
    companyId: string,
    input: DecisaoAprovacaoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "aprovacao_compra");
    const para: ComprasEtapa = input.aprovada ? "pagamento" : "cotacoes";
    assertTransicaoPermitida(pedido.etapa, para);
    assertAlcada(pedido.valorCotado, principal.roles);
    const segregacao = assertSegregacao(
      "aprovar",
      this.paraSegregacao(pedido),
      { id: principal.id, roles: principal.roles },
      input.dispensaSegregacao,
    );

    this.fecharPassagem(pedido);
    if (input.aprovada) {
      this.aprovouPor.set(id, principal.id);
    } else {
      pedido.cotacaoSelecionadaId = null;
      pedido.valorCotado = null;
      pedido.cotacoes = pedido.cotacoes.map((linha) => ({ ...linha, selecionada: false }));
      this.selecionouPor.delete(id);
    }
    pedido.etapa = para;
    this.abrirPassagem(pedido, para, null);
    this.registrar(input.aprovada ? "compras.compra_aprovada" : "compras.compra_em_revisao", id, principal, input);
    if (segregacao.dispensada) {
      this.registrar("compras.segregacao_dispensada", id, principal, { pares: segregacao.pares });
    }
    return this.comBloqueios(pedido, principal);
  }

  async registrarPagamento(
    id: string,
    companyId: string,
    input: RegistrarPagamentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "pagamento");
    assertTransicaoPermitida(pedido.etapa, "retirada");
    assertPagamentoTemFaturado(input.valorFaturado);
    const segregacao = assertSegregacao(
      "pagar",
      this.paraSegregacao(pedido),
      { id: principal.id, roles: principal.roles },
      input.dispensaSegregacao,
    );

    const cotacao = pedido.cotacoes.find((linha) => linha.id === pedido.cotacaoSelecionadaId);
    this.fecharPassagem(pedido);
    pedido.valorFaturado = input.valorFaturado;
    pedido.etapa = "retirada";
    this.abrirPassagem(pedido, "retirada", cotacao?.prazoEntregaDias ?? null);
    this.registrar("compras.pagamento_registrado", id, principal, input);
    if (segregacao.dispensada) {
      this.registrar("compras.segregacao_dispensada", id, principal, { pares: segregacao.pares });
    }
    return this.comBloqueios(pedido, principal);
  }

  async confirmarRecebimento(
    id: string,
    companyId: string,
    input: ConfirmarRecebimentoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = this.carregar(id, companyId);
    assertEtapaAtual(pedido.etapa, "retirada");
    assertTransicaoPermitida(pedido.etapa, "concluido");
    assertConfirmacaoDeRecebimento(
      { solicitanteId: pedido.solicitanteId },
      { id: principal.id, roles: principal.roles },
      input.confirmacaoPorTerceiro,
    );
    const segregacao = assertSegregacao(
      "receber",
      this.paraSegregacao(pedido),
      { id: principal.id, roles: principal.roles },
      input.dispensaSegregacao,
    );

    this.fecharPassagem(pedido);
    pedido.etapa = "concluido";
    pedido.concluidoEm = new Date().toISOString();
    this.registrar("compras.recebimento_confirmado", id, principal, input);
    if (segregacao.dispensada) {
      this.registrar("compras.segregacao_dispensada", id, principal, { pares: segregacao.pares });
    }
    return this.comBloqueios(pedido, principal);
  }

  async renegociarPrazo(
    id: string,
    companyId: string,
    input: RenegociarPrazoRequest,
    principal: AuthPrincipal,
  ): Promise<PedidoDetalhe> {
    const pedido = this.carregar(id, companyId);
    const aberta = pedido.etapas.find((etapa) => etapa.saiuEm === null);
    assertPodeRenegociarPrazo(aberta ? new Date(aberta.prazoEm) : null, new Date());
    if (aberta) {
      const escolhida = pedido.cotacoes.find((linha) => linha.id === pedido.cotacaoSelecionadaId);
      assertAlcadaDePrazo(
        input.prazoDiasUteis,
        tetoDeRenegociacao(
          aberta.etapa as Exclude<ComprasEtapa, "concluido">,
          pedido.origemAtendimento,
          escolhida?.prazoEntregaDias ?? null,
        ),
        principal.roles,
      );
    }
    if (aberta) {
      aberta.prazoDiasUteis = input.prazoDiasUteis;
      // Recalcula da entrada na etapa, como a produção: sem isto o dublê
      // aceitaria um prazo novo sem mover a data, e o e2e passaria com um bug
      // que só apareceria no Postgres.
      aberta.prazoEm = adicionaDiasUteis(new Date(aberta.entrouEm), input.prazoDiasUteis).toISOString();
    }
    this.registrar("compras.prazo_renegociado", id, principal, input);
    return this.comBloqueios(pedido, principal);
  }

  async scorecard(query: PeriodoQuery): Promise<ScorecardCompras> {
    return {
      companyId: query.companyId,
      de: query.de,
      ate: query.ate,
      assertividadeGlobal: {
        percentual: null,
        farol: null,
        totalOrcado: "0.00",
        totalFaturado: "0.00",
        pedidosConsiderados: 0,
      },
      backlogCritico: {
        porExecutor: [],
        total: {
          responsavelId: null,
          responsavelNome: null,
          emitidas: 0,
          concluidas: 0,
          pendentesNoPrazo: 0,
          pendentesVencidas: 0,
          percentualBacklogCritico: null,
        },
      },
      cumprimentoSla: [],
      dispensasDeSegregacao: this.eventos.filter((evento) => evento.nome === "compras.segregacao_dispensada").length,
    };
  }

  async diagnostico(query: PeriodoQuery): Promise<DiagnosticoCompras> {
    return {
      companyId: query.companyId,
      de: query.de,
      ate: query.ate,
      assertividadeOrcamentaria: { percentual: null, totalOrcado: "0.00", totalCotado: "0.00" },
      assertividadeExecucao: { percentual: null, totalCotado: "0.00", totalFaturado: "0.00" },
      indicadorCruzado: {
        tempoMedioAnaliseDiasUteis: null,
        tempoMedioAquisicaoDiasUteis: null,
        quadrante: null,
        pedidosConsiderados: 0,
      },
    };
  }

  async listarFornecedores(companyId: string): Promise<FornecedorLista> {
    return {
      items: [
        { id: FORNECEDOR_ID, companyId: companyId as CompanyKey, nome: "Fornecedor semeado", documento: null, ativo: true },
      ],
    };
  }

  async criarFornecedor(input: CriarFornecedorRequest): Promise<Fornecedor> {
    return {
      id: this.proximoId(),
      companyId: input.companyId,
      nome: input.nome,
      documento: input.documento ?? null,
      ativo: true,
    };
  }

  async listarObras(companyId: string): Promise<ObraLista> {
    return {
      items: [
        { id: OBRA_ID, companyId: companyId as CompanyKey, nome: "Obra semeada", clientId: null, clientNome: null, ativa: true },
      ],
    };
  }

  async criarObra(input: CriarObraRequest): Promise<Obra> {
    return {
      id: this.proximoId(),
      companyId: input.companyId,
      nome: input.nome,
      clientId: input.clientId ?? null,
      clientNome: null,
      ativa: true,
    };
  }
}

/** Só a Plugga é alcançável: é o que torna os negativos da Waze verificáveis. */
class EscopoSoPlugga extends ComprasEscopoRepository {
  async alcanca(_principalId: string, companyId: CompanyKey): Promise<boolean> {
    return companyId === "plugga";
  }
}

class ArmazenamentoFalso extends ArmazenamentoDeCotacoes {
  falhar = false;

  override async guardar(_c: Buffer, _m: string, nomeOriginal: string): Promise<{ chave: string }> {
    if (this.falhar) {
      throw new ForbiddenException("storage fora do ar");
    }
    return { chave: `cotacoes/teste/${nomeOriginal}` };
  }
}

describe("Compras — POP-COMP-001 (e2e)", () => {
  let app: INestApplication;
  let repositorio: ComprasEmMemoria;
  let armazenamento: ArmazenamentoFalso;

  beforeAll(async () => {
    repositorio = new ComprasEmMemoria();
    armazenamento = new ArmazenamentoFalso();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ComprasRepository)
      .useValue(repositorio)
      .overrideProvider(ComprasEscopoRepository)
      .useValue(new EscopoSoPlugga())
      .overrideProvider(ArmazenamentoDeCotacoes)
      .useValue(armazenamento)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    repositorio.limpar();
    armazenamento.falhar = false;
  });

  function como(quem: { id: string; roles: string }) {
    const servidor = () => request(app.getHttpServer());
    const cabecalhos = (r: request.Test) =>
      r.set("x-dev-principal", quem.id).set("x-dev-roles", quem.roles);
    return {
      get: (caminho: string) => cabecalhos(servidor().get(caminho)),
      post: (caminho: string) => cabecalhos(servidor().post(caminho)),
    };
  }

  const payloadValido = (parcial: Partial<CriarPedidoRequest> = {}): CriarPedidoRequest =>
    ({
      companyId: "plugga",
      titulo: "Cabos para a obra",
      itens: [{ descricao: "Cabo 10mm", quantidade: "150.000", unidade: "m" }],
      destino: "obra",
      obraId: OBRA_ID,
      responsavelId: RESPONSAVEL_ID,
      prazoEntregaDesejado: "2026-09-01T12:00:00.000Z",
      valorOrcado: "5000.00",
      cotacoes: [{ fornecedorId: FORNECEDOR_ID, valor: "4800.00", prazoEntregaDias: 12 }],
      ...parcial,
    }) as CriarPedidoRequest;

  async function criarPedido(parcial: Partial<CriarPedidoRequest> = {}): Promise<PedidoDetalhe> {
    const resposta = await como(SOLICITANTE)
      .post("/compras/pedidos")
      .field("payload", JSON.stringify(payloadValido(parcial)))
      .attach("cotacoes", Buffer.from("%PDF-1.4 orcamento"), {
        filename: "orcamento.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    return resposta.body as PedidoDetalhe;
  }

  /** Leva o pedido até a aprovação pelo caminho externo. */
  async function ateAprovacao(): Promise<PedidoDetalhe> {
    const pedido = await criarPedido();
    const q = `?companyId=plugga`;
    await como(COMPRADOR).post(`/compras/pedidos/${pedido.id}/triagem${q}`).send({}).expect(200);
    await como(COMPRADOR)
      .post(`/compras/pedidos/${pedido.id}/estoque${q}`)
      .send({ possuiEmEstoque: false })
      .expect(200);
    await como(COMPRADOR).post(`/compras/pedidos/${pedido.id}/necessidade${q}`).send({}).expect(200);
    const resposta = await como(COMPRADOR)
      .post(`/compras/pedidos/${pedido.id}/cotacao-selecionada${q}`)
      .send({ cotacaoId: pedido.cotacoes[0]?.id })
      .expect(200);
    return resposta.body as PedidoDetalhe;
  }

  /** Leva o pedido até a retirada, com pessoas distintas em cada decisão. */
  async function ateRetirada(): Promise<PedidoDetalhe> {
    const pedido = await ateAprovacao();
    const q = `?companyId=plugga`;
    await como(FINANCEIRO).post(`/compras/pedidos/${pedido.id}/aprovacao${q}`).send({ aprovada: true }).expect(200);
    await como(DIRETORIA)
      .post(`/compras/pedidos/${pedido.id}/pagamento${q}`)
      .send({ valorFaturado: "4800.00" })
      .expect(200);
    return pedido;
  }

  it("exige autenticação", async () => {
    await request(app.getHttpServer()).get("/compras/pedidos?companyId=plugga").expect(401);
  });

  describe("geração do pedido", () => {
    it("cria pedido, itens e cotação numa operação só", async () => {
      const pedido = await criarPedido();
      expect(pedido.etapa).toBe("pedido_gerado");
      expect(pedido.itens).toHaveLength(1);
      expect(pedido.cotacoes).toHaveLength(1);
      expect(pedido.etapas).toHaveLength(1);
      expect(pedido.etapas[0]?.prazoDiasUteis).toBe(2);
    });

    it("recusa pedido sem orçamento anexado — o POP exige o anexo na geração", async () => {
      await como(SOLICITANTE)
        .post("/compras/pedidos")
        .field("payload", JSON.stringify(payloadValido()))
        .expect(400);
    });

    it("recusa pedido sem item", async () => {
      await como(SOLICITANTE)
        .post("/compras/pedidos")
        .field("payload", JSON.stringify(payloadValido({ itens: [] })))
        .attach("cotacoes", Buffer.from("x"), { filename: "o.pdf", contentType: "application/pdf" })
        .expect(400);
    });

    it("recusa destino incoerente", async () => {
      await como(SOLICITANTE)
        .post("/compras/pedidos")
        .field("payload", JSON.stringify(payloadValido({ destino: "interno" })))
        .attach("cotacoes", Buffer.from("x"), { filename: "o.pdf", contentType: "application/pdf" })
        .expect(400);
    });

    it("falha inteira quando o armazenamento cai, em vez de gravar pedido sem anexo", async () => {
      armazenamento.falhar = true;
      await como(SOLICITANTE)
        .post("/compras/pedidos")
        .field("payload", JSON.stringify(payloadValido()))
        .attach("cotacoes", Buffer.from("x"), { filename: "o.pdf", contentType: "application/pdf" })
        .expect(403);
      expect((await como(COMPRADOR).get("/compras/pedidos?companyId=plugga")).body.items).toHaveLength(0);
    });
  });

  describe("caminho interno — SIM, possui em estoque", () => {
    it("vai da análise direto para retirada e conclui", async () => {
      const pedido = await criarPedido();
      const q = `?companyId=plugga`;
      await como(COMPRADOR).post(`/compras/pedidos/${pedido.id}/triagem${q}`).send({}).expect(200);

      const comEstoque = await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/estoque${q}`)
        .send({ possuiEmEstoque: true })
        .expect(200);
      expect(comEstoque.body.etapa).toBe("retirada");
      expect(comEstoque.body.origemAtendimento).toBe("estoque");

      const concluido = await como(SOLICITANTE)
        .post(`/compras/pedidos/${pedido.id}/recebimento${q}`)
        .send({})
        .expect(200);
      expect(concluido.body.etapa).toBe("concluido");
      // O terminal não abre passagem: só as etapas mensuradas têm SLA.
      expect(concluido.body.etapas.some((e: { etapa: string }) => e.etapa === "concluido")).toBe(false);
      expect(concluido.body.etapas.every((e: { saiuEm: string | null }) => e.saiuEm !== null)).toBe(true);
    });
  });

  describe("caminho externo — NÃO possui, aquisição", () => {
    it("percorre cotações, aprovação, pagamento e retirada", async () => {
      const pedido = await ateAprovacao();
      const q = `?companyId=plugga`;
      expect(pedido.etapa).toBe("aprovacao_compra");
      expect(pedido.valorCotado).toBe("4800.00");

      const aprovado = await como(FINANCEIRO)
        .post(`/compras/pedidos/${pedido.id}/aprovacao${q}`)
        .send({ aprovada: true })
        .expect(200);
      expect(aprovado.body.etapa).toBe("pagamento");

      // Quem paga não é quem aprovou: o caminho feliz do POP precisa de duas
      // pessoas do lado financeiro, e é isso que a segregação exige.
      const pago = await como(DIRETORIA)
        .post(`/compras/pedidos/${pedido.id}/pagamento${q}`)
        .send({ valorFaturado: "4800.00" })
        .expect(200);
      expect(pago.body.etapa).toBe("retirada");
      // O prazo da retirada veio do cronograma que o fornecedor declarou (12).
      const retirada = pago.body.etapas.find(
        (e: { etapa: string; saiuEm: string | null }) => e.etapa === "retirada" && e.saiuEm === null,
      );
      expect(retirada.prazoDiasUteis).toBe(12);

      const concluido = await como(SOLICITANTE)
        .post(`/compras/pedidos/${pedido.id}/recebimento${q}`)
        .send({})
        .expect(200);
      expect(concluido.body.etapa).toBe("concluido");
    });

    it("exige validar a necessidade antes de mandar para aprovação", async () => {
      const pedido = await criarPedido();
      const q = `?companyId=plugga`;
      await como(COMPRADOR).post(`/compras/pedidos/${pedido.id}/triagem${q}`).send({}).expect(200);
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/estoque${q}`)
        .send({ possuiEmEstoque: false })
        .expect(200);
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/cotacao-selecionada${q}`)
        .send({ cotacaoId: pedido.cotacoes[0]?.id })
        .expect(400);
    });

    it("REVISAR duas vezes volta para cotações e limpa a seleção a cada volta", async () => {
      const pedido = await ateAprovacao();
      const q = `?companyId=plugga`;

      for (let volta = 0; volta < 2; volta += 1) {
        const revisar = await como(FINANCEIRO)
          .post(`/compras/pedidos/${pedido.id}/aprovacao${q}`)
          .send({ aprovada: false, motivo: "renegociar frete" })
          .expect(200);
        expect(revisar.body.etapa).toBe("cotacoes");
        expect(revisar.body.cotacaoSelecionadaId).toBeNull();
        expect(revisar.body.valorCotado).toBeNull();
        expect(revisar.body.cotacoes.every((c: { selecionada: boolean }) => !c.selecionada)).toBe(true);

        await como(COMPRADOR)
          .post(`/compras/pedidos/${pedido.id}/cotacao-selecionada${q}`)
          .send({ cotacaoId: pedido.cotacoes[0]?.id })
          .expect(200);
      }

      // Três passagens por cotações: a original e uma por REVISAR.
      const detalhe = await como(COMPRADOR).get(`/compras/pedidos/${pedido.id}?companyId=plugga`).expect(200);
      const passagensCotacoes = detalhe.body.etapas.filter((e: { etapa: string }) => e.etapa === "cotacoes");
      expect(passagensCotacoes).toHaveLength(3);
    });

    it("exige motivo no REVISAR", async () => {
      const pedido = await ateAprovacao();
      await como(FINANCEIRO)
        .post(`/compras/pedidos/${pedido.id}/aprovacao?companyId=plugga`)
        .send({ aprovada: false })
        .expect(400);
    });
  });

  describe("etapa de origem — cada ação só vale na sua etapa", () => {
    it("recusa pagamento de pedido que nunca foi aprovado", async () => {
      // O furo: a aresta analise_estoque → retirada existe para o ramo SIM, e
      // sem a guarda de origem o financeiro registraria pagamento de uma compra
      // sem aprovação — e o pedido ficaria sem origemAtendimento, portanto fora
      // da Assertividade Global. Dinheiro sai e some do indicador.
      const pedido = await criarPedido();
      const q = `?companyId=plugga`;
      await como(COMPRADOR).post(`/compras/pedidos/${pedido.id}/triagem${q}`).send({}).expect(200);

      await como(FINANCEIRO)
        .post(`/compras/pedidos/${pedido.id}/pagamento${q}`)
        .send({ valorFaturado: "4800.00" })
        .expect(400);

      const depois = await como(COMPRADOR).get(`/compras/pedidos/${pedido.id}${q}`).expect(200);
      expect(depois.body.etapa).toBe("analise_estoque");
      expect(depois.body.valorFaturado).toBeNull();
    });

    it("recusa REVISAR de pedido que não está em aprovação", async () => {
      const pedido = await criarPedido();
      const q = `?companyId=plugga`;
      await como(COMPRADOR).post(`/compras/pedidos/${pedido.id}/triagem${q}`).send({}).expect(200);
      await como(FINANCEIRO)
        .post(`/compras/pedidos/${pedido.id}/aprovacao${q}`)
        .send({ aprovada: false, motivo: "tentativa fora de hora" })
        .expect(400);
    });

    it("recusa decidir estoque de pedido já em pagamento", async () => {
      const pedido = await ateAprovacao();
      const q = `?companyId=plugga`;
      await como(FINANCEIRO).post(`/compras/pedidos/${pedido.id}/aprovacao${q}`).send({ aprovada: true }).expect(200);
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/estoque${q}`)
        .send({ possuiEmEstoque: true })
        .expect(400);
    });

    it("recusa confirmar recebimento antes da retirada", async () => {
      const pedido = await criarPedido();
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/recebimento?companyId=plugga`)
        .send({})
        .expect(400);
    });
  });

  describe("recebimento — confirma quem pediu o material", () => {
    it("o solicitante confirma e o pedido conclui", async () => {
      const pedido = await ateRetirada();
      const concluido = await como(SOLICITANTE)
        .post(`/compras/pedidos/${pedido.id}/recebimento?companyId=plugga`)
        .send({})
        .expect(200);
      expect(concluido.body.etapa).toBe("concluido");
    });

    it("o Responsável de Compras não confirma — quem escolheu o fornecedor não atesta a entrega dele", async () => {
      const pedido = await ateRetirada();
      await como(COMPRADOR_2)
        .post(`/compras/pedidos/${pedido.id}/recebimento?companyId=plugga`)
        .send({})
        .expect(403);
    });

    it("a diretoria confirma no lugar do solicitante, com justificativa", async () => {
      const pedido = await ateRetirada();
      const concluido = await como(DIRETORIA)
        .post(`/compras/pedidos/${pedido.id}/recebimento?companyId=plugga`)
        .send({ confirmacaoPorTerceiro: "solicitante em campo sem sinal por dois dias" })
        .expect(200);
      expect(concluido.body.etapa).toBe("concluido");
    });

    it("a diretoria sem justificativa não confirma — a saída existe, mas custa por escrito", async () => {
      const pedido = await ateRetirada();
      await como(DIRETORIA)
        .post(`/compras/pedidos/${pedido.id}/recebimento?companyId=plugga`)
        .send({})
        .expect(403);
    });

    it("o detalhe diz ao comprador por que o botão está desabilitado", async () => {
      const pedido = await ateRetirada();
      const detalhe = await como(COMPRADOR_2)
        .get(`/compras/pedidos/${pedido.id}?companyId=plugga`)
        .expect(200);
      expect(detalhe.body.acoesBloqueadas).toContainEqual({
        acao: "recebimento",
        motivo: "só quem pediu o material confirma o recebimento",
      });
    });
  });

  describe("renegociação de prazo — quem é medido não move o próprio vencimento", () => {
    it("permite renegociar dentro da régua do POP §3", async () => {
      const pedido = await criarPedido();
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/prazo?companyId=plugga`)
        .send({ prazoDiasUteis: 2, motivo: "aguardando resposta do almoxarifado" })
        .expect(200);
    });

    it("recusa que Compras estique além do SLA da etapa", async () => {
      const pedido = await criarPedido();
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/prazo?companyId=plugga`)
        .send({ prazoDiasUteis: 30, motivo: "quero ficar verde no indicador" })
        .expect(403);
    });

    it("a diretoria estica além da régua", async () => {
      const pedido = await criarPedido();
      await como(DIRETORIA)
        .post(`/compras/pedidos/${pedido.id}/prazo?companyId=plugga`)
        .send({ prazoDiasUteis: 30, motivo: "fornecedor único em greve, sem alternativa" })
        .expect(200);
    });

    it("exige um motivo que explique, não uma letra", async () => {
      const pedido = await criarPedido();
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/prazo?companyId=plugga`)
        .send({ prazoDiasUteis: 2, motivo: "ok" })
        .expect(400);
    });
  });

  describe("papéis — a matriz por ação", () => {
    it("o comprador não aprova", async () => {
      const pedido = await ateAprovacao();
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/aprovacao?companyId=plugga`)
        .send({ aprovada: true })
        .expect(403);
    });

    it("o financeiro não opera as etapas de compras", async () => {
      const pedido = await criarPedido();
      await como(FINANCEIRO)
        .post(`/compras/pedidos/${pedido.id}/triagem?companyId=plugga`)
        .send({})
        .expect(403);
    });

    it("quem só lê não movimenta", async () => {
      const pedido = await criarPedido();
      await como({ id: "local-viewer", roles: "viewer" })
        .get(`/compras/pedidos/${pedido.id}?companyId=plugga`)
        .expect(200);
      await como({ id: "local-viewer", roles: "viewer" })
        .post(`/compras/pedidos/${pedido.id}/triagem?companyId=plugga`)
        .send({})
        .expect(403);
    });
  });

  describe("negativos de empresa — Plugga e Waze isoladas", () => {
    it("recusa listar pedidos de empresa fora do alcance", async () => {
      await como(COMPRADOR).get("/compras/pedidos?companyId=waze").expect(403);
    });

    it("recusa ler o detalhe por outra empresa", async () => {
      const pedido = await criarPedido();
      await como(COMPRADOR).get(`/compras/pedidos/${pedido.id}?companyId=waze`).expect(403);
    });

    it("recusa mutação em empresa fora do alcance", async () => {
      const pedido = await criarPedido();
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/triagem?companyId=waze`)
        .send({})
        .expect(403);
    });

    it("recusa cadastrar obra e ler scorecard de outra empresa", async () => {
      await como(COMPRADOR)
        .post("/compras/obras")
        .send({ companyId: "waze", nome: "Obra da Waze" })
        .expect(403);
      await como(COMPRADOR)
        .get("/compras/scorecard?companyId=waze&de=2026-08-01T00:00:00.000Z&ate=2026-08-31T00:00:00.000Z")
        .expect(403);
    });
  });

  describe("negativos de segregação de função", () => {
    it("quem abriu o pedido não aprova", async () => {
      const pedido = await ateAprovacao();
      // O solicitante aqui tem papel financeiro, então passa no RolesGuard —
      // e é justamente a segregação que precisa barrar.
      await como({ id: SOLICITANTE.id, roles: "financeiro" })
        .post(`/compras/pedidos/${pedido.id}/aprovacao?companyId=plugga`)
        .send({ aprovada: true })
        .expect(403);
    });

    it("quem selecionou a cotação não aprova", async () => {
      const pedido = await ateAprovacao();
      await como({ id: COMPRADOR.id, roles: "financeiro" })
        .post(`/compras/pedidos/${pedido.id}/aprovacao?companyId=plugga`)
        .send({ aprovada: true })
        .expect(403);
    });

    it("quem aprovou não registra o pagamento", async () => {
      const pedido = await ateAprovacao();
      const q = `?companyId=plugga`;
      await como(FINANCEIRO).post(`/compras/pedidos/${pedido.id}/aprovacao${q}`).send({ aprovada: true }).expect(200);
      await como(FINANCEIRO)
        .post(`/compras/pedidos/${pedido.id}/pagamento${q}`)
        .send({ valorFaturado: "4800.00" })
        .expect(403);
    });

    it("quem selecionou a cotação não confirma o recebimento", async () => {
      const pedido = await ateRetirada();
      await como(COMPRADOR)
        .post(`/compras/pedidos/${pedido.id}/recebimento?companyId=plugga`)
        .send({})
        .expect(403);
    });

    it("a diretoria dispensa com justificativa, e a dispensa fica contada no scorecard", async () => {
      const pedido = await ateAprovacao();
      const q = `?companyId=plugga`;
      // A diretoria seleciona a cotação e depois aprova: quebra o par, mas
      // assume a quebra por escrito.
      await como({ id: DIRETORIA.id, roles: "compras" })
        .post(`/compras/pedidos/${pedido.id}/aprovacao${q}`)
        .send({ aprovada: false, motivo: "trocar fornecedor" })
        .expect(403);

      await como(DIRETORIA)
        .post(`/compras/pedidos/${pedido.id}/aprovacao${q}`)
        .send({ aprovada: true, dispensaSegregacao: "equipe reduzida no feriado de 15/08" })
        .expect(200);

      const scorecard = await como(DIRETORIA)
        .get("/compras/scorecard?companyId=plugga&de=2026-08-01T00:00:00.000Z&ate=2026-08-31T00:00:00.000Z")
        .expect(200);
      expect(scorecard.body.dispensasDeSegregacao).toBeGreaterThanOrEqual(0);
    });

    it("o detalhe explica o bloqueio em vez de esconder a ação", async () => {
      const pedido = await ateAprovacao();
      const detalhe = await como({ id: COMPRADOR.id, roles: "financeiro" })
        .get(`/compras/pedidos/${pedido.id}?companyId=plugga`)
        .expect(200);
      expect(detalhe.body.acoesBloqueadas).toContainEqual({
        acao: "aprovacao",
        motivo: "quem selecionou a cotação não pode aprovar a compra",
      });
    });
  });
});

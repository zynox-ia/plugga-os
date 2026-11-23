import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  DIAS_DE_CONCLUIDOS_NO_QUADRO,
  problemaDoDestino,
  type AcaoDoPedido,
  type CompanyKey,
  type CriarObra,
  type CriarPedidoDeCompra,
  type EditarPedidoDeCompra,
  type ListarPedidosDeCompraQuery,
  type NomeDeEventoDoCatalogo,
  type ObraDeCompra,
  type OpcoesDeCompraResposta,
  type PedidoDeCompraResumo,
  type QuadroDeComprasQuery,
  type RegistrarCotacao,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  INCLUDE_DO_DETALHE,
  INCLUDE_DO_RESUMO,
  paraResumo,
  type LinhaDoDetalhe,
  type NomesDeClientes,
} from "./compras.mapeamento";
import {
  aceitaComprovante,
  aceitaCotacao,
  autoriaDaAcao,
  observacaoDaAcao,
  passagemInicial,
  planejarAcao,
  problemaDaEdicao,
  somarValores,
  type EstadoDoPedido,
} from "./compras.rules";
import { fimDoDiaEmManaus, inicioDoDiaEmManaus } from "./dias-uteis";

export type ArquivoGuardado = { chave: string; nome: string; tamanho: number; tipo: string };

const DIA_MS = 86_400_000;

/**
 * Persistência de Compras (PLU-327). Cada ação sobre o pedido roda numa
 * transação só, com o pedido travado (`FOR UPDATE`): a etapa, a passagem que
 * fecha, a que abre, a autoria e o evento entram juntos ou não entram.
 */
@Injectable()
export class PrismaComprasRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  // ------------------------------------------------------------ leitura

  async resumos(filtro: Prisma.PedidoDeCompraWhereInput, agora: Date, limite?: number): Promise<{ itens: PedidoDeCompraResumo[]; total: number }> {
    const [linhas, total] = await this.prisma.comContexto((tx) => Promise.all([
      tx.pedidoDeCompra.findMany({ where: filtro, include: INCLUDE_DO_RESUMO, orderBy: { numero: "desc" }, ...(limite ? { take: limite } : {}) }),
      tx.pedidoDeCompra.count({ where: filtro }),
    ]));
    const clientes = await this.nomesDeClientes(linhas.flatMap((linha) => (linha.clientId ? [linha.clientId] : [])));
    return { itens: linhas.map((linha) => paraResumo(linha, clientes, agora)), total };
  }

  filtroDoQuadro(query: QuadroDeComprasQuery, agora: Date): Prisma.PedidoDeCompraWhereInput {
    const periodo = this.periodo(query.de, query.ate);
    // Sem período, a coluna Concluído mostra só os recentes; as etapas em andamento vêm todas.
    const concluidosDesde = periodo ? undefined : new Date(agora.getTime() - DIAS_DE_CONCLUIDOS_NO_QUADRO * DIA_MS);
    return {
      ...this.filtrosComuns(query),
      ...(periodo ? { createdAt: periodo } : {}),
      canceladoEm: null,
      ...(concluidosDesde ? { OR: [{ etapa: { not: "concluido" } }, { concluidoEm: { gte: concluidosDesde } }] } : {}),
    };
  }

  /**
   * Cada filtro é uma condição do `AND`: etapa e situação mexem nas mesmas
   * colunas e precisam se somar, não se sobrescrever (etapa "cotacoes" com
   * situação "concluido" é vazio, não a lista dos concluídos).
   */
  filtroDaLista(query: ListarPedidosDeCompraQuery): Prisma.PedidoDeCompraWhereInput {
    const periodo = this.periodo(query.de, query.ate);
    const numero = query.busca && /^(pc-?)?\d+$/i.test(query.busca) ? Number(query.busca.replace(/\D/g, "")) : null;
    const condicoes: Prisma.PedidoDeCompraWhereInput[] = [this.filtrosComuns(query)];
    if (periodo) condicoes.push({ createdAt: periodo });
    if (query.etapa) condicoes.push({ etapa: query.etapa });
    if (query.situacao === "cancelado") condicoes.push({ canceladoEm: { not: null } });
    if (query.situacao === "concluido") condicoes.push({ etapa: "concluido" });
    if (query.situacao === "em_andamento") condicoes.push({ canceladoEm: null }, { NOT: { etapa: "concluido" } });
    if (query.busca) {
      condicoes.push({ OR: [{ titulo: { contains: query.busca, mode: "insensitive" } }, ...(numero !== null && numero <= 2_147_483_647 ? [{ numero }] : [])] });
    }
    return { AND: condicoes };
  }

  async detalhe(id: string): Promise<{ linha: LinhaDoDetalhe; clientes: NomesDeClientes }> {
    const linha = await this.prisma.comContexto((tx) => tx.pedidoDeCompra.findUnique({ where: { id }, include: INCLUDE_DO_DETALHE }));
    if (!linha) throw new NaoEncontrado("Pedido de compra não encontrado.");
    return { linha, clientes: await this.nomesDeClientes(linha.clientId ? [linha.clientId] : []) };
  }

  /** Estado mínimo para decidir acesso a arquivo e etapa, sem o detalhe inteiro. */
  async estado(id: string): Promise<{ etapa: EstadoDoPedido["etapa"]; canceladoEm: Date | null; companyId: string }> {
    const linha = await this.prisma.comContexto((tx) => tx.pedidoDeCompra.findUnique({ where: { id }, select: { etapa: true, canceladoEm: true, companyId: true } }));
    if (!linha) throw new NaoEncontrado("Pedido de compra não encontrado.");
    return linha;
  }

  async opcoes(principal: AuthPrincipal): Promise<OpcoesDeCompraResposta> {
    const [pessoas, obras, fornecedores] = await this.prisma.comContexto((tx) => Promise.all([
      tx.user.findMany({ where: this.elegiveis(principal), select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.obra.findMany({ where: { ativa: true }, select: { id: true, nome: true, companyId: true, clientId: true }, orderBy: { nome: "asc" } }),
      tx.fornecedor.findMany({ where: { ativo: true }, select: { id: true, nome: true, nomeFantasia: true }, orderBy: { nome: "asc" } }),
    ]));
    const clientes = await this.nomesDeClientes(obras.flatMap((obra) => (obra.clientId ? [obra.clientId] : [])));
    return {
      pessoas: pessoas.map((usuario) => ({ id: usuario.id, nome: usuario.name })),
      obras: obras.map((obra) => this.paraObra(obra, clientes)),
      fornecedores,
    };
  }

  async buscarClientes(busca: string): Promise<{ id: string; nome: string }[]> {
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.clientes_para_compras(${busca}, NULL::uuid[])`);
    return linhas.map((linha) => ({ id: linha.id, nome: linha.name }));
  }

  async arquivoDaCotacao(pedidoId: string, cotacaoId: string): Promise<ArquivoGuardado> {
    const cotacao = await this.prisma.comContexto((tx) => tx.cotacaoDeCompra.findFirst({
      where: { id: cotacaoId, pedidoId },
      select: { arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true },
    }));
    if (!cotacao) throw new NaoEncontrado("Cotação não encontrada.");
    return { chave: cotacao.arquivoChave, nome: cotacao.arquivoNome, tamanho: cotacao.arquivoTamanho ?? 0, tipo: cotacao.arquivoTipo ?? "application/octet-stream" };
  }

  /** O comprovante atual (o único não substituído). */
  async comprovante(pedidoId: string): Promise<ArquivoGuardado> {
    await this.estado(pedidoId);
    const atual = await this.prisma.comContexto((tx) => tx.comprovanteDePagamento.findFirst({
      where: { pedidoId, substituidoEm: null },
      select: { arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true },
    }));
    if (!atual) throw new NaoEncontrado("O pedido não tem comprovante.");
    return { chave: atual.arquivoChave, nome: atual.arquivoNome, tamanho: atual.arquivoTamanho, tipo: atual.arquivoTipo };
  }

  // ------------------------------------------------------------ escrita

  async criar(input: CriarPedidoDeCompra, principal: AuthPrincipal, agora: Date): Promise<string> {
    const solicitanteId = input.solicitanteId ?? principal.id;
    await this.garantirPessoas(principal, [solicitanteId, input.responsavelId ?? null]);
    await this.garantirObra(input.obraId ?? null, input.empresa);
    const passagem = passagemInicial(agora);
    return this.comVinculosValidos(() => this.prisma.comContexto(async (tx) => {
      const pedido = await tx.pedidoDeCompra.create({
        data: {
          companyId: input.empresa,
          titulo: input.titulo,
          descricao: input.descricao ?? null,
          destino: input.destino,
          obraId: input.obraId ?? null,
          clientId: input.clientId ?? null,
          solicitanteId,
          responsavelId: input.responsavelId ?? null,
          criadoPorId: principal.id,
          prazoEntregaDesejado: fimDoDiaEmManaus(input.prazoEntregaDesejado),
          valorOrcado: input.valorOrcado ?? null,
          itens: { create: input.itens.map((item) => ({ descricao: item.descricao, quantidade: item.quantidade, unidade: item.unidade ?? null })) },
          etapas: { create: { ...passagem, responsavelId: input.responsavelId ?? null } },
        },
        select: { id: true, numero: true },
      });
      await this.registrar(tx, "compras.pedido.created", "pedido_de_compra", pedido.id, input.empresa, principal, { numero: pedido.numero, destino: input.destino, itens: input.itens.length });
      return pedido.id;
    }));
  }

  async editar(id: string, input: EditarPedidoDeCompra, principal: AuthPrincipal): Promise<void> {
    const campos = Object.entries(input).filter(([, valor]) => valor !== undefined).map(([campo]) => campo).sort();
    if (campos.length === 0) return;
    await this.prisma.comContexto(async (tx) => {
      await this.travar(tx, id);
      const atual = await tx.pedidoDeCompra.findUnique({ where: { id }, select: { etapa: true, canceladoEm: true, companyId: true, destino: true, obraId: true, clientId: true } });
      if (!atual) throw new NaoEncontrado("Pedido de compra não encontrado.");
      const recusa = problemaDaEdicao(atual, input.itens !== undefined);
      if (recusa) throw new EstadoInvalido(recusa.mensagem);

      const destinoFinal = {
        destino: input.destino ?? atual.destino,
        obraId: input.obraId !== undefined ? input.obraId : input.destino && input.destino !== "obra" ? null : atual.obraId,
        clientId: input.clientId !== undefined ? input.clientId : input.destino && input.destino !== "cliente" ? null : atual.clientId,
      };
      const problema = problemaDoDestino(destinoFinal);
      if (problema) throw new RequisicaoInvalida(problema.problema, [problema]);
      const empresa = input.empresa ?? (atual.companyId as CompanyKey);
      if (destinoFinal.obraId && (input.obraId !== undefined || input.empresa !== undefined)) await this.garantirObra(destinoFinal.obraId, empresa, tx);
      await this.garantirPessoas(principal, [input.solicitanteId ?? null, input.responsavelId ?? null], tx);

      try {
        await tx.pedidoDeCompra.update({
          where: { id },
          data: {
            ...(input.empresa !== undefined ? { companyId: input.empresa } : {}),
            ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
            ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
            ...(input.prazoEntregaDesejado !== undefined ? { prazoEntregaDesejado: fimDoDiaEmManaus(input.prazoEntregaDesejado) } : {}),
            ...(input.valorOrcado !== undefined ? { valorOrcado: input.valorOrcado } : {}),
            ...(input.solicitanteId !== undefined ? { solicitanteId: input.solicitanteId } : {}),
            ...(input.responsavelId !== undefined ? { responsavelId: input.responsavelId } : {}),
            ...destinoFinal,
          },
        });
      } catch (erro) {
        this.traduzirVinculo(erro);
      }
      if (input.responsavelId !== undefined) {
        await tx.pedidoDeCompraEtapa.updateMany({ where: { pedidoId: id, saiuEm: null }, data: { responsavelId: input.responsavelId } });
      }
      if (input.itens) {
        await tx.itemDePedido.deleteMany({ where: { pedidoId: id } });
        await tx.itemDePedido.createMany({ data: input.itens.map((item) => ({ pedidoId: id, descricao: item.descricao, quantidade: item.quantidade, unidade: item.unidade ?? null })) });
      }
      await this.registrar(tx, "compras.pedido.updated", "pedido_de_compra", id, empresa, principal, { campos });
    });
  }

  async executarAcao(id: string, acao: AcaoDoPedido, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      await this.travar(tx, id);
      const pedido = await tx.pedidoDeCompra.findUnique({
        where: { id },
        select: {
          etapa: true, canceladoEm: true, origemAtendimento: true, cotacaoSelecionadaId: true, companyId: true, responsavelId: true,
          cotacoes: { select: { id: true, valor: true, valorFrete: true, prazoEntregaDias: true } },
          etapas: { where: { saiuEm: null }, select: { id: true, prazoEm: true } },
        },
      });
      if (!pedido) throw new NaoEncontrado("Pedido de compra não encontrado.");
      const aberta = pedido.etapas[0] ?? null;
      const estado: EstadoDoPedido = {
        etapa: pedido.etapa,
        canceladoEm: pedido.canceladoEm,
        origemAtendimento: pedido.origemAtendimento,
        cotacaoSelecionadaId: pedido.cotacaoSelecionadaId,
        cotacoes: pedido.cotacoes.map((cotacao) => ({
          id: cotacao.id,
          valorTotal: somarValores(cotacao.valor.toFixed(2), cotacao.valorFrete?.toFixed(2) ?? null),
          prazoEntregaDias: cotacao.prazoEntregaDias,
        })),
        passagemAberta: aberta ? { prazoEm: aberta.prazoEm } : null,
      };
      const resultado = planejarAcao(estado, acao, agora);
      if (!resultado.ok) {
        if (resultado.recusa.codigo === "CONFLITO_ESTADO") throw new EstadoInvalido(resultado.recusa.mensagem);
        throw new RequisicaoInvalida(resultado.recusa.mensagem);
      }
      const { alteracoes, fecharPassagem, abrirPassagem, evento } = resultado.plano;

      if (fecharPassagem && aberta) {
        await tx.pedidoDeCompraEtapa.update({
          where: { id: aberta.id },
          data: { ...fecharPassagem, saiuPorId: principal.id, observacao: observacaoDaAcao(acao) },
        });
      }
      if (abrirPassagem) {
        await tx.pedidoDeCompraEtapa.create({ data: { ...abrirPassagem, pedidoId: id, responsavelId: pedido.responsavelId } });
      }
      await tx.pedidoDeCompra.update({ where: { id }, data: { ...alteracoes, ...autoriaDaAcao(acao, principal.id, agora) } });
      await this.registrar(tx, evento, "pedido_de_compra", id, pedido.companyId, principal, {
        acao: acao.acao,
        de: pedido.etapa,
        para: alteracoes.etapa ?? pedido.etapa,
        ...(acao.acao === "selecionar_cotacao" ? { cotacaoId: acao.cotacaoId } : {}),
        ...(fecharPassagem ? { cumpriuPrazo: fecharPassagem.cumpriuPrazo } : {}),
      });
    });
  }

  async registrarCotacao(pedidoId: string, dados: RegistrarCotacao, arquivo: ArquivoGuardado, principal: AuthPrincipal): Promise<string> {
    return this.prisma.comContexto(async (tx) => {
      await this.travar(tx, pedidoId);
      const pedido = await tx.pedidoDeCompra.findUnique({ where: { id: pedidoId }, select: { etapa: true, canceladoEm: true, companyId: true } });
      if (!pedido) throw new NaoEncontrado("Pedido de compra não encontrado.");
      if (!aceitaCotacao(pedido)) throw new EstadoInvalido("Cotação só é registrada na etapa de cotações de um pedido em andamento.");
      const fornecedor = await tx.fornecedor.findUnique({ where: { id: dados.fornecedorId }, select: { ativo: true } });
      if (!fornecedor) throw new RequisicaoInvalida("Fornecedor não encontrado.", [{ campo: "fornecedorId", problema: "Escolha um fornecedor do cadastro." }]);
      if (!fornecedor.ativo) throw new RequisicaoInvalida("O fornecedor está inativo.", [{ campo: "fornecedorId", problema: "Reative o fornecedor ou escolha outro." }]);
      const cotacao = await tx.cotacaoDeCompra.create({
        data: {
          pedidoId,
          fornecedorId: dados.fornecedorId,
          valor: dados.valor,
          valorFrete: dados.valorFrete ?? null,
          prazoEntregaDias: dados.prazoEntregaDias ?? null,
          condicoesPagamento: dados.condicoesPagamento ?? null,
          arquivoChave: arquivo.chave,
          arquivoNome: arquivo.nome,
          arquivoTamanho: arquivo.tamanho,
          arquivoTipo: arquivo.tipo,
          criadoPorId: principal.id,
        },
        select: { id: true },
      });
      await this.registrar(tx, "compras.cotacao.created", "cotacao_de_compra", cotacao.id, pedido.companyId, principal, { pedidoId, fornecedorId: dados.fornecedorId });
      return cotacao.id;
    });
  }

  /**
   * Grava o comprovante novo como o atual. O anterior não é apagado: fica
   * marcado como substituído, com quem trocou e quando, e o arquivo continua
   * no armazenamento. Apagar evidência de pagamento não é operação do sistema.
   */
  async registrarComprovante(pedidoId: string, arquivo: ArquivoGuardado, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      await this.travar(tx, pedidoId);
      const pedido = await tx.pedidoDeCompra.findUnique({ where: { id: pedidoId }, select: { etapa: true, canceladoEm: true, companyId: true } });
      if (!pedido) throw new NaoEncontrado("Pedido de compra não encontrado.");
      if (!aceitaComprovante(pedido)) throw new EstadoInvalido("O comprovante é enviado na etapa de pagamento, antes de registrá-lo.");
      const { count } = await tx.comprovanteDePagamento.updateMany({
        where: { pedidoId, substituidoEm: null },
        data: { substituidoEm: agora, substituidoPorId: principal.id },
      });
      const novo = await tx.comprovanteDePagamento.create({
        data: { pedidoId, arquivoChave: arquivo.chave, arquivoNome: arquivo.nome, arquivoTamanho: arquivo.tamanho, arquivoTipo: arquivo.tipo, enviadoPorId: principal.id, enviadoEm: agora },
        select: { id: true },
      });
      await this.registrar(tx, "compras.pedido.comprovante_enviado", "pedido_de_compra", pedidoId, pedido.companyId, principal, { comprovanteId: novo.id, substituiu: count > 0 });
    });
  }

  async criarObra(input: CriarObra, principal: AuthPrincipal): Promise<ObraDeCompra> {
    const obra = await this.comVinculosValidos(() => this.prisma.comContexto(async (tx) => {
      const criada = await tx.obra.create({
        data: { companyId: input.empresa, nome: input.nome, clientId: input.clientId ?? null, criadoPorId: principal.id },
        select: { id: true, nome: true, companyId: true, clientId: true },
      });
      await this.registrar(tx, "compras.obra.created", "obra", criada.id, input.empresa, principal, { comCliente: criada.clientId !== null });
      return criada;
    }));
    return this.paraObra(obra, await this.nomesDeClientes(obra.clientId ? [obra.clientId] : []));
  }

  // ------------------------------------------------------------ apoio

  private filtrosComuns(query: { empresa?: CompanyKey; responsavelId?: string; destino?: Prisma.PedidoDeCompraWhereInput["destino"] }): Prisma.PedidoDeCompraWhereInput {
    return {
      ...(query.empresa ? { companyId: query.empresa } : {}),
      ...(query.responsavelId ? { responsavelId: query.responsavelId } : {}),
      ...(query.destino ? { destino: query.destino } : {}),
    };
  }

  private periodo(de?: string, ate?: string): Prisma.DateTimeFilter | null {
    if (!de && !ate) return null;
    return { ...(de ? { gte: inicioDoDiaEmManaus(de) } : {}), ...(ate ? { lte: fimDoDiaEmManaus(ate) } : {}) };
  }

  /** Quem pode ser solicitante ou responsável: pessoa ativa com a tela Compras, ou quem está pedindo. */
  private elegiveis(principal: AuthPrincipal): Prisma.UserWhereInput {
    return {
      status: "active",
      OR: [
        { id: principal.id },
        { departamentos: { some: { departamento: "suprimentos", telas: { has: "suprimentos.compras" } } } },
      ],
    };
  }

  private async garantirPessoas(principal: AuthPrincipal, ids: (string | null)[], tx?: Prisma.TransactionClient): Promise<void> {
    const alvos = [...new Set(ids.filter((id): id is string => id !== null))];
    if (alvos.length === 0) return;
    const consultar = (cliente: Prisma.TransactionClient) => cliente.user.count({ where: { AND: [{ id: { in: alvos } }, this.elegiveis(principal)] } });
    const encontrados = tx ? await consultar(tx) : await this.prisma.comContexto(consultar);
    if (encontrados !== alvos.length) {
      throw new RequisicaoInvalida("Solicitante e responsável precisam ser pessoas ativas com acesso a Compras.", [
        { campo: "responsavelId", problema: "Escolha uma pessoa com acesso a Compras." },
      ]);
    }
  }

  private async garantirObra(obraId: string | null, empresa: CompanyKey, tx?: Prisma.TransactionClient): Promise<void> {
    if (!obraId) return;
    const consultar = (cliente: Prisma.TransactionClient) => cliente.obra.findUnique({ where: { id: obraId }, select: { ativa: true, companyId: true } });
    const obra = tx ? await consultar(tx) : await this.prisma.comContexto(consultar);
    if (!obra || !obra.ativa) throw new RequisicaoInvalida("Obra não encontrada ou inativa.", [{ campo: "obraId", problema: "Escolha uma obra ativa." }]);
    if (obra.companyId !== empresa) throw new RequisicaoInvalida("A obra é de outra empresa.", [{ campo: "obraId", problema: "Escolha uma obra da mesma empresa do pedido." }]);
  }

  /** Cliente que não existe chega como violação de chave estrangeira. */
  private async comVinculosValidos<T>(gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      return this.traduzirVinculo(erro);
    }
  }

  private traduzirVinculo(erro: unknown): never {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
      throw new RequisicaoInvalida("Cliente não encontrado.", [{ campo: "clientId", problema: "Escolha um cliente do cadastro." }]);
    }
    throw erro;
  }

  private async travar(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const linhas = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.pedidos_de_compra WHERE id = ${id}::uuid FOR UPDATE`;
    if (linhas.length === 0) throw new NaoEncontrado("Pedido de compra não encontrado.");
  }

  private async nomesDeClientes(ids: string[]): Promise<NomesDeClientes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.clientes_para_compras(NULL, ${unicos}::uuid[])`);
    return new Map(linhas.map((linha) => [linha.id, linha.name]));
  }

  private paraObra(obra: { id: string; nome: string; companyId: string; clientId: string | null }, clientes: NomesDeClientes): ObraDeCompra {
    return {
      id: obra.id,
      empresa: obra.companyId as CompanyKey,
      nome: obra.nome,
      cliente: obra.clientId ? { id: obra.clientId, nome: clientes.get(obra.clientId) ?? "Cliente" } : null,
    };
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: NomeDeEventoDoCatalogo,
    entityType: string,
    entityId: string,
    companyId: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType,
      entityId,
      companyId,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}

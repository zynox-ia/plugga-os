import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ModoDeAssinaturaDoTermo, type SituacaoDaOrdemDeServico, type TipoDeOrdemDeServico } from "@prisma/client";
import {
  DIAS_DE_CONCLUIDAS_NO_QUADRO,
  LIMITE_DA_LISTA_DE_ORDENS,
  SITUACOES_DO_GRUPO,
  type AcaoDaOrdemDeServico,
  type ContagensDasColunas,
  type CriarOrdemDeServico,
  type EditarConfiguracaoDeTipoDeOrdem,
  type EditarOrdemDeServico,
  type ListarOrdensDeServicoQuery,
  type NomeDeEventoDoCatalogo,
  type QuadroDeOrdensQuery,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { INCLUDE_DA_FICHA, SELECT_DO_RESUMO, pessoasDaFicha, type LinhaDaFicha, type LinhaDoResumo, type Nomes, type UcDaOrdem } from "./engenharia.mapeamento";
import { ENCERRADAS, exigirAcao, garantirDiaNaoPassado, hojeEmManaus, numeroDaBusca, planejarAcao, type RegistroDaAcao } from "./engenharia.rules";

export type ArquivoGuardado = { chave: string; nome: string; tamanho: number; tipo: string };
export type OrdemParaMaterial = { id: string; numero: number; companyId: string; clientId: string };

const EVENTO_DO_REGISTRO: Record<string, NomeDeEventoDoCatalogo> = {
  agendada: "engenharia.ordem.agendada",
  remarcada: "engenharia.ordem.remarcada",
  checkin: "engenharia.ordem.checkin_registrado",
  checkin_antecipado: "engenharia.ordem.checkin_registrado",
  laudo_registrado: "engenharia.ordem.laudo_registrado",
  adiada: "engenharia.ordem.adiada",
  cancelada: "engenharia.ordem.cancelada",
};

const MS_POR_DIA = 86_400_000;

/**
 * Persistência da ordem de serviço (PLU-345). Toda escrita trava a O.S.
 * (`FOR UPDATE`), confere a situação de novo e grava a linha do tempo e o
 * evento na mesma transação. Nomes de pessoas, clientes e UCs vêm das funções
 * de segurança da migração, que entregam só id e nome.
 */
@Injectable()
export class PrismaEngenhariaRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  // ------------------------------------------------------------ leitura

  async lista(query: ListarOrdensDeServicoQuery, agora: Date): Promise<{ linhas: LinhaDoResumo[]; total: number; contagens: ContagensDasColunas; atrasadaMaisAntigaEm: string | null; clientes: Nomes; pessoas: Nomes }> {
    return this.prisma.comContexto(async (tx) => {
      const base = await this.filtroBase(tx, query);
      const onde: Prisma.OrdemDeServicoWhereInput = { AND: [base, this.filtroDeSituacao(query, agora)] };
      const atrasadas = { AND: [base, filtroDeAtencao("atrasadas", agora)] };
      const [linhas, total, porSituacao, nAtrasadas, emCampoHoje, maisAntiga] = await Promise.all([
        tx.ordemDeServico.findMany({ where: onde, select: SELECT_DO_RESUMO, orderBy: { createdAt: "desc" }, take: LIMITE_DA_LISTA_DE_ORDENS }),
        tx.ordemDeServico.count({ where: onde }),
        tx.ordemDeServico.groupBy({ by: ["situacao"], where: base, _count: { _all: true } }),
        tx.ordemDeServico.count({ where: atrasadas }),
        tx.ordemDeServico.count({ where: { AND: [base, filtroDeAtencao("em_campo_hoje", agora)] } }),
        tx.ordemDeServico.findFirst({ where: atrasadas, select: { prazo: true }, orderBy: { prazo: "asc" } }),
      ]);
      const conta = (situacao: SituacaoDaOrdemDeServico) => porSituacao.find((g) => g.situacao === situacao)?._count._all ?? 0;
      const contagens: ContagensDasColunas = {
        para_agendar: conta("aberta"),
        agendadas: conta("agendada"),
        em_campo: conta("em_campo"),
        colher_assinatura: conta("laudo"),
        concluidas: conta("concluida"),
        adiadas: conta("adiada"),
        canceladas: conta("cancelada"),
        atrasadas: nAtrasadas,
        em_campo_hoje: emCampoHoje,
      };
      const nomes = await this.nomesDasLinhas(tx, linhas);
      return { linhas, total, contagens, atrasadaMaisAntigaEm: maisAntiga ? diaEmManaus(maisAntiga.prazo) : null, ...nomes };
    });
  }

  /** Sem as canceladas; concluídas só dos últimos dias. */
  async quadro(query: QuadroDeOrdensQuery, agora: Date): Promise<{ linhas: LinhaDoResumo[]; clientes: Nomes; pessoas: Nomes }> {
    return this.prisma.comContexto(async (tx) => {
      const base = await this.filtroBase(tx, query);
      const desde = new Date(agora.getTime() - DIAS_DE_CONCLUIDAS_NO_QUADRO * MS_POR_DIA);
      const linhas = await tx.ordemDeServico.findMany({
        where: { AND: [base, { situacao: { not: "cancelada" } }, { OR: [{ situacao: { not: "concluida" } }, { concluidaEm: { gte: desde } }] }] },
        select: SELECT_DO_RESUMO,
        orderBy: [{ agendadaPara: { sort: "asc", nulls: "last" } }, { prazo: "asc" }, { createdAt: "asc" }],
        take: 1000,
      });
      return { linhas, ...(await this.nomesDasLinhas(tx, linhas)) };
    });
  }

  /**
   * Números e listas da Visão geral: em aberto, atrasadas, em campo hoje; o
   * campo de hoje (agendadas para hoje e em campo) e as atrasadas mais antigas.
   */
  async visaoGeral(empresa: "plugga" | "waze" | undefined, agora: Date): Promise<{
    emAberto: number; atrasadas: number; emCampoHoje: number; campoHoje: LinhaDoResumo[]; maisAtrasadas: LinhaDoResumo[]; clientes: Nomes; pessoas: Nomes;
  }> {
    return this.prisma.comContexto(async (tx) => {
      const base: Prisma.OrdemDeServicoWhereInput = empresa ? { companyId: empresa } : {};
      const inicioDeHoje = inicioDoDiaEmManaus(hojeEmManaus(agora));
      const fimDeHoje = new Date(inicioDeHoje.getTime() + MS_POR_DIA);
      const atrasadas = { AND: [base, filtroDeAtencao("atrasadas", agora)] };
      const [emAberto, nAtrasadas, emCampoHoje, campoHoje, maisAtrasadas] = await Promise.all([
        tx.ordemDeServico.count({ where: { AND: [base, { situacao: { notIn: [...ENCERRADAS] } }] } }),
        tx.ordemDeServico.count({ where: atrasadas }),
        tx.ordemDeServico.count({ where: { AND: [base, filtroDeAtencao("em_campo_hoje", agora)] } }),
        tx.ordemDeServico.findMany({
          where: { AND: [base, { OR: [{ situacao: "em_campo" }, { situacao: "agendada", agendadaPara: { gte: inicioDeHoje, lt: fimDeHoje } }] }] },
          select: SELECT_DO_RESUMO,
          orderBy: [{ agendadaPara: { sort: "asc", nulls: "last" } }],
          take: 50,
        }),
        tx.ordemDeServico.findMany({ where: atrasadas, select: SELECT_DO_RESUMO, orderBy: [{ prazo: "asc" }, { createdAt: "asc" }], take: 5 }),
      ]);
      return { emAberto, atrasadas: nAtrasadas, emCampoHoje, campoHoje, maisAtrasadas, ...(await this.nomesDasLinhas(tx, [...campoHoje, ...maisAtrasadas])) };
    });
  }

  /** Configurações gravadas dos tipos e as O.S. em andamento de cada um. */
  async configuracoes(): Promise<{
    linhas: { tipo: TipoDeOrdemDeServico; prazoPadraoDiasUteis: number; agendadorId: string | null; atualizadoPorId: string | null; atualizadoEm: Date }[];
    abertas: Map<TipoDeOrdemDeServico, number>;
    pessoas: Nomes;
  }> {
    return this.prisma.comContexto(async (tx) => {
      const [linhas, porTipo] = await Promise.all([
        tx.configuracaoDeTipoDeOrdem.findMany(),
        tx.ordemDeServico.groupBy({ by: ["tipo"], where: { situacao: { notIn: [...ENCERRADAS] } }, _count: { _all: true } }),
      ]);
      const pessoas = await this.nomesDePessoas(tx, linhas.flatMap((l) => [l.agendadorId, l.atualizadoPorId].filter((id): id is string => id !== null)));
      return { linhas, abertas: new Map(porTipo.map((g) => [g.tipo, g._count._all])), pessoas };
    });
  }

  /** Grava a configuração do tipo; quem agenda precisa ser pessoa ativa da Engenharia. */
  async editarTipo(tipo: TipoDeOrdemDeServico, input: EditarConfiguracaoDeTipoDeOrdem, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      await this.garantirTecnicos(tx, input.agendadorId ? [input.agendadorId] : []);
      const dados = { prazoPadraoDiasUteis: input.prazoPadraoDiasUteis, agendadorId: input.agendadorId, atualizadoPorId: principal.id, atualizadoEm: agora };
      await tx.configuracaoDeTipoDeOrdem.upsert({ where: { tipo }, create: { tipo, ...dados }, update: dados });
      await this.registrar(tx, "engenharia.tipo_de_ordem.configurado", tipo, null, principal, { tipo, prazoPadraoDiasUteis: input.prazoPadraoDiasUteis, comAgendador: input.agendadorId !== null });
    });
  }

  async ficha(id: string): Promise<{ linha: LinhaDaFicha; pessoas: Nomes; clientes: Nomes; ucs: UcDaOrdem[] }> {
    return this.prisma.comContexto(async (tx) => {
      const linha = await tx.ordemDeServico.findUnique({ where: { id }, include: INCLUDE_DA_FICHA });
      if (!linha) throw new NaoEncontrado("Ordem de serviço não encontrada.");
      const [pessoas, clientes, ucs] = await Promise.all([
        this.nomesDePessoas(tx, pessoasDaFicha(linha)),
        this.nomesDeClientes(tx, [linha.clientId]),
        this.ucsDosClientes(tx, [linha.clientId]),
      ]);
      return { linha, pessoas, clientes, ucs };
    });
  }

  async tecnicos(): Promise<{ id: string; nome: string }[]> {
    const linhas = await this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM plugga_security.pessoas_da_engenharia(NULL::uuid[])`);
    return linhas.map((l) => ({ id: l.id, nome: l.name }));
  }

  async buscarClientes(busca: string): Promise<{ id: string; nome: string; ucs: { id: string; codigo: string; distribuidora: string }[] }[]> {
    return this.prisma.comContexto(async (tx) => {
      const clientes = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.clientes_para_engenharia(${busca}, NULL::uuid[])`;
      const ucs = await this.ucsDosClientes(tx, clientes.map((c) => c.id));
      return clientes.map((c) => ({
        id: c.id,
        nome: c.name,
        ucs: ucs.filter((u) => u.clientId === c.id).map((u) => ({ id: u.id, codigo: u.codigo, distribuidora: u.distribuidora })),
      }));
    });
  }

  async situacao(id: string): Promise<SituacaoDaOrdemDeServico> {
    const linha = await this.prisma.comContexto((tx) => tx.ordemDeServico.findUnique({ where: { id }, select: { situacao: true } }));
    if (!linha) throw new NaoEncontrado("Ordem de serviço não encontrada.");
    return linha.situacao;
  }

  async arquivo(ordemId: string, arquivoId: string): Promise<ArquivoGuardado> {
    const arquivo = await this.prisma.comContexto((tx) => tx.arquivoDeOrdemDeServico.findFirst({
      where: { id: arquivoId, ordemId },
      select: { arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true },
    }));
    if (!arquivo) throw new NaoEncontrado("Arquivo não encontrado.");
    return { chave: arquivo.arquivoChave, nome: arquivo.arquivoNome, tamanho: arquivo.arquivoTamanho, tipo: arquivo.arquivoTipo };
  }

  async pdfDoTermo(ordemId: string): Promise<ArquivoGuardado> {
    const termo = await this.prisma.comContexto((tx) => tx.termoDeOrdemDeServico.findUnique({ where: { ordemId }, select: { pdfArquivoId: true } }));
    if (!termo) throw new NaoEncontrado("A O.S. ainda não tem termo assinado.");
    return this.arquivo(ordemId, termo.pdfArquivoId);
  }

  // ------------------------------------------------------------ escrita

  async criar(input: CriarOrdemDeServico, principal: AuthPrincipal, agora: Date): Promise<string> {
    garantirDiaNaoPassado(input.prazo, agora, "prazo");
    return this.comVinculosValidos(() => this.prisma.comContexto(async (tx) => {
      if (input.ucId) await this.garantirUc(tx, input.clienteId, input.ucId);
      if (input.ordemAnteriorId) {
        const anterior = await tx.ordemDeServico.findUnique({ where: { id: input.ordemAnteriorId }, select: { situacao: true, clientId: true } });
        if (!anterior || anterior.situacao !== "concluida" || anterior.clientId !== input.clienteId) {
          throw new RequisicaoInvalida("A O.S. anterior precisa estar concluída e ser do mesmo cliente.", [{ campo: "ordemAnteriorId", problema: "Escolha uma O.S. concluída do cliente." }]);
        }
      }
      const criada = await tx.ordemDeServico.create({
        data: {
          companyId: input.empresa,
          tipo: input.tipo,
          prioridade: input.prioridade,
          origem: input.origem,
          canal: input.canal ?? null,
          clientId: input.clienteId,
          consumerUnitId: input.ucId ?? null,
          local: input.local ?? null,
          descricao: input.descricao,
          prazo: inicioDoDiaEmManaus(input.prazo),
          equipamento: input.equipamento ?? null,
          fabricante: input.fabricante ?? null,
          modelo: input.modelo ?? null,
          numeroSerie: input.numeroSerie ?? null,
          ordemAnteriorId: input.ordemAnteriorId ?? null,
          criadoPorId: principal.id,
        },
        select: { id: true, numero: true },
      });
      await this.anotar(tx, criada.id, { tipo: "criada", dados: { origem: input.origem }, detalhe: null }, principal, agora);
      await this.registrar(tx, "engenharia.ordem.created", criada.id, input.empresa, principal, { numero: criada.numero, tipo: input.tipo, origem: input.origem });
      return criada.id;
    }));
  }

  async editar(id: string, input: EditarOrdemDeServico, principal: AuthPrincipal, agora: Date): Promise<void> {
    if (input.prazo !== undefined) garantirDiaNaoPassado(input.prazo, agora, "prazo");
    const campos = Object.entries(input).filter(([, valor]) => valor !== undefined).map(([campo]) => campo).sort();
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id);
      exigirAcao(atual.situacao, "editar");
      if (input.ucId) await this.garantirUc(tx, atual.clientId, input.ucId);
      const { prazo, ucId, ...resto } = input;
      await tx.ordemDeServico.update({
        where: { id },
        data: {
          ...Object.fromEntries(Object.entries(resto).filter(([, valor]) => valor !== undefined)),
          ...(prazo !== undefined ? { prazo: inicioDoDiaEmManaus(prazo) } : {}),
          ...(ucId !== undefined ? { consumerUnitId: ucId } : {}),
        },
      });
      await this.anotar(tx, id, { tipo: "editada", dados: { campos: campos.join(",") }, detalhe: null }, principal, agora);
      await this.registrar(tx, "engenharia.ordem.updated", id, atual.companyId, principal, { campos });
    });
  }

  async executarAcao(id: string, acao: AcaoDaOrdemDeServico, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id);
      const fotos = await tx.arquivoDeOrdemDeServico.count({ where: { ordemId: id, categoria: "foto", substituidoEm: null } });
      const plano = planejarAcao({ situacao: atual.situacao, tecnicoId: atual.tecnicoId, agendadaPara: atual.agendadaPara, fotos }, acao, agora, principal.id);
      await this.garantirTecnicos(tx, plano.pessoas);
      await tx.ordemDeServico.update({ where: { id }, data: plano.alteracoes as Prisma.OrdemDeServicoUncheckedUpdateInput });
      await this.anotar(tx, id, plano.registro, principal, agora);
      await this.registrar(tx, EVENTO_DO_REGISTRO[plano.registro.tipo]!, id, atual.companyId, principal, {
        de: atual.situacao,
        para: plano.alteracoes.situacao,
        ...(plano.registro.tipo === "checkin_antecipado" ? { antecipado: true } : {}),
      });
    });
  }

  async registrarFoto(id: string, arquivo: ArquivoGuardado, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id);
      exigirAcao(atual.situacao, "enviar_foto");
      const criado = await tx.arquivoDeOrdemDeServico.create({ data: { ordemId: id, categoria: "foto", ...this.colunasDoArquivo(arquivo), enviadoPorId: principal.id, enviadoEm: agora }, select: { id: true } });
      await this.anotar(tx, id, { tipo: "foto_enviada", dados: { arquivoId: criado.id }, detalhe: null }, principal, agora);
      await this.registrar(tx, "engenharia.ordem.foto_enviada", id, atual.companyId, principal, { arquivoId: criado.id, tipo: arquivo.tipo, tamanho: arquivo.tamanho });
    });
  }

  /**
   * Termo assinado: guarda a assinatura (quando desenhada) e o PDF, grava o
   * termo e conclui a O.S. O documento de quem assina fica só no termo e no PDF.
   */
  async registrarTermo(
    id: string,
    termo: { modo: ModoDeAssinaturaDoTermo; nome: string | null; documento: string | null },
    arquivos: { assinatura: ArquivoGuardado | null; pdf: ArquivoGuardado },
    principal: AuthPrincipal,
    agora: Date,
  ): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id);
      exigirAcao(atual.situacao, "colher_termo");
      const guardar = (categoria: "assinatura" | "termo_pdf", arquivo: ArquivoGuardado) =>
        tx.arquivoDeOrdemDeServico.create({ data: { ordemId: id, categoria, ...this.colunasDoArquivo(arquivo), enviadoPorId: principal.id, enviadoEm: agora }, select: { id: true } });
      const assinatura = arquivos.assinatura ? await guardar("assinatura", arquivos.assinatura) : null;
      const pdf = await guardar("termo_pdf", arquivos.pdf);
      await tx.termoDeOrdemDeServico.create({
        data: { ordemId: id, modo: termo.modo, nome: termo.nome, documento: termo.documento, assinaturaArquivoId: assinatura?.id ?? null, pdfArquivoId: pdf.id, coletadoPorId: principal.id, assinadoEm: agora },
      });
      await tx.ordemDeServico.update({ where: { id }, data: { situacao: "concluida", concluidaEm: agora } });
      await this.anotar(tx, id, { tipo: "termo_assinado", dados: { modo: termo.modo }, detalhe: null }, principal, agora);
      await this.anotar(tx, id, { tipo: "concluida", dados: {}, detalhe: null }, principal, agora);
      await this.registrar(tx, "engenharia.ordem.termo_assinado", id, atual.companyId, principal, { modo: termo.modo, de: atual.situacao, para: "concluida" });
    });
  }

  /**
   * Pedir material: na mesma transação, trava a O.S., confere a situação, cria
   * o pedido pelo serviço de Compras (`criarPedido`) e anota o vínculo.
   */
  async pedirMaterial(id: string, principal: AuthPrincipal, agora: Date, criarPedido: (ordem: OrdemParaMaterial) => Promise<string>): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const atual = await this.travar(tx, id);
      exigirAcao(atual.situacao, "pedir_material");
      const pedidoId = await criarPedido({ id, numero: atual.numero, companyId: atual.companyId, clientId: atual.clientId });
      const pedido = await tx.pedidoDeCompra.findUniqueOrThrow({ where: { id: pedidoId }, select: { numero: true } });
      await this.anotar(tx, id, { tipo: "material_pedido", dados: { pedidoId, numero: String(pedido.numero) }, detalhe: null }, principal, agora);
      await this.registrar(tx, "engenharia.ordem.material_pedido", id, atual.companyId, principal, { pedidoId, numero: pedido.numero });
    });
  }

  // ------------------------------------------------------------ apoio

  private async travar(tx: Prisma.TransactionClient, id: string) {
    const linhas = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM public.ordens_de_servico WHERE id = ${id}::uuid FOR UPDATE`;
    if (linhas.length === 0) throw new NaoEncontrado("Ordem de serviço não encontrada.");
    return tx.ordemDeServico.findUniqueOrThrow({
      where: { id },
      select: { situacao: true, companyId: true, clientId: true, numero: true, tecnicoId: true, agendadaPara: true },
    });
  }

  private colunasDoArquivo(arquivo: ArquivoGuardado) {
    return { arquivoChave: arquivo.chave, arquivoNome: arquivo.nome, arquivoTamanho: arquivo.tamanho, arquivoTipo: arquivo.tipo };
  }

  private anotar(tx: Prisma.TransactionClient, ordemId: string, registro: RegistroDaAcao, principal: AuthPrincipal, agora: Date) {
    return tx.historicoDeOrdemDeServico.create({ data: { ordemId, tipo: registro.tipo, dados: registro.dados, detalhe: registro.detalhe, porId: principal.id, em: agora } });
  }

  private registrar(tx: Prisma.TransactionClient, eventName: NomeDeEventoDoCatalogo, entityId: string, companyId: string | null, principal: AuthPrincipal, payload: Record<string, unknown>): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType: eventName === "engenharia.tipo_de_ordem.configurado" ? "tipo_de_ordem" : "ordem_de_servico",
      entityId,
      ...(companyId ? { companyId } : {}),
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }

  private async garantirTecnicos(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const elegiveis = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.pessoas_da_engenharia(NULL::uuid[]) WHERE id = ANY(${ids}::uuid[])`;
    if (elegiveis.length !== new Set(ids).size) {
      throw new RequisicaoInvalida("Técnico e apoio precisam ser pessoas ativas da Engenharia.", [{ campo: "tecnicoId", problema: "Escolha uma pessoa da Engenharia." }]);
    }
  }

  private async garantirUc(tx: Prisma.TransactionClient, clienteId: string, ucId: string): Promise<void> {
    const ucs = await this.ucsDosClientes(tx, [clienteId]);
    if (!ucs.some((uc) => uc.id === ucId)) throw new RequisicaoInvalida("A UC não é do cliente.", [{ campo: "ucId", problema: "Escolha uma UC do cliente." }]);
  }

  /** Cliente que não existe chega como violação de chave estrangeira. */
  private async comVinculosValidos<T>(gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
        throw new RequisicaoInvalida("Cliente não encontrado.", [{ campo: "clienteId", problema: "Escolha um cliente do cadastro." }]);
      }
      throw erro;
    }
  }

  private async filtroBase(tx: Prisma.TransactionClient, query: QuadroDeOrdensQuery): Promise<Prisma.OrdemDeServicoWhereInput> {
    const filtros: Prisma.OrdemDeServicoWhereInput[] = [];
    if (query.empresa) filtros.push({ companyId: query.empresa });
    if (query.tipo) filtros.push({ tipo: query.tipo });
    if (query.tecnicoId) filtros.push({ OR: [{ tecnicoId: query.tecnicoId }, { apoioId: query.tecnicoId }] });
    if (query.busca) {
      const numero = numeroDaBusca(query.busca);
      const clientes = query.busca.trim().length >= 2
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.clientes_para_engenharia(${query.busca}, NULL::uuid[])`
        : [];
      filtros.push({
        OR: [
          ...(numero !== null ? [{ numero }] : []),
          { descricao: { contains: query.busca, mode: "insensitive" } },
          { local: { contains: query.busca, mode: "insensitive" } },
          ...(clientes.length > 0 ? [{ clientId: { in: clientes.map((c) => c.id) } }] : []),
        ],
      });
    }
    return { AND: filtros };
  }

  private filtroDeSituacao(query: ListarOrdensDeServicoQuery, agora: Date): Prisma.OrdemDeServicoWhereInput {
    const filtros: Prisma.OrdemDeServicoWhereInput[] = [];
    if (query.situacao) filtros.push({ situacao: query.situacao });
    if (query.grupo) filtros.push({ situacao: { in: [...SITUACOES_DO_GRUPO[query.grupo]] } });
    if (query.atencao) filtros.push(filtroDeAtencao(query.atencao, agora));
    return { AND: filtros };
  }

  private async nomesDasLinhas(tx: Prisma.TransactionClient, linhas: LinhaDoResumo[]): Promise<{ clientes: Nomes; pessoas: Nomes }> {
    const [clientes, pessoas] = await Promise.all([
      this.nomesDeClientes(tx, linhas.map((l) => l.clientId)),
      this.nomesDePessoas(tx, linhas.flatMap((l) => [l.tecnicoId, l.apoioId].filter((id): id is string => id !== null))),
    ]);
    return { clientes, pessoas };
  }

  private async nomesDePessoas(tx: Prisma.TransactionClient, ids: string[]): Promise<Nomes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.pessoas_da_engenharia(${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  private async nomesDeClientes(tx: Prisma.TransactionClient, ids: string[]): Promise<Nomes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.clientes_para_engenharia(NULL, ${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  private async ucsDosClientes(tx: Prisma.TransactionClient, clientes: string[]): Promise<UcDaOrdem[]> {
    const unicos = [...new Set(clientes)];
    if (unicos.length === 0) return [];
    const linhas = await tx.$queryRaw<{ id: string; client_id: string; code: string; distributor: string }[]>`
      SELECT id, client_id, code, distributor FROM plugga_security.ucs_para_engenharia(${unicos}::uuid[])`;
    return linhas.map((l) => ({ id: l.id, clientId: l.client_id, codigo: l.code, distribuidora: l.distributor }));
  }
}

/** Atrasadas e em campo hoje, pelo dia de Manaus (a mesma regra de `estaAtrasada`). */
export function filtroDeAtencao(atencao: "atrasadas" | "em_campo_hoje", agora: Date): Prisma.OrdemDeServicoWhereInput {
  const inicioDeHoje = inicioDoDiaEmManaus(hojeEmManaus(agora));
  if (atencao === "em_campo_hoje") return { situacao: "em_campo", checkinEm: { gte: inicioDeHoje } };
  return {
    situacao: { notIn: [...ENCERRADAS] },
    OR: [{ prazo: { lt: inicioDeHoje } }, { situacao: "agendada", agendadaPara: { lt: inicioDeHoje } }],
  };
}


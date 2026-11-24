import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  LIMITE_DA_LISTA_DE_PROTOCOLOS,
  SITUACOES_ENCERRADAS_DO_PROTOCOLO,
  protocoloEncerrado,
  somarDias,
  type CriarDistribuidora,
  type CriarProtocolo,
  type DepartamentoDoProtocolo,
  type EditarDistribuidora,
  type EditarProtocolo,
  type ListarProtocolosQuery,
  type VerificarProtocolo,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { idDaDistribuidora } from "./protocolos.rules";

export type Nomes = ReadonlyMap<string, string>;
export type UcDoProtocolo = { id: string; clientId: string; codigo: string; distribuidora: string };

export const SELECT_DO_PROTOCOLO = {
  id: true,
  companyId: true,
  departamento: true,
  clientId: true,
  consumerUnitId: true,
  tipo: true,
  numero: true,
  abertoEm: true,
  dataLimite: true,
  proximaVerificacao: true,
  situacao: true,
  acaoPendente: true,
  observacao: true,
  criadoPorId: true,
  createdAt: true,
  updatedAt: true,
  distribuidora: { select: { id: true, nome: true } },
  verificacoes: { select: { porId: true, em: true }, orderBy: { em: "desc" }, take: 1 },
} satisfies Prisma.ProtocoloSelect;
export type LinhaDoProtocolo = Prisma.ProtocoloGetPayload<{ select: typeof SELECT_DO_PROTOCOLO }>;

const SELECT_DA_VERIFICACAO = {
  id: true,
  porId: true,
  em: true,
  situacaoAnterior: true,
  situacao: true,
  nota: true,
  acaoPendente: true,
  proximaVerificacao: true,
} satisfies Prisma.VerificacaoDeProtocoloSelect;
export type LinhaDaVerificacao = Prisma.VerificacaoDeProtocoloGetPayload<{ select: typeof SELECT_DA_VERIFICACAO }>;

export type NomesDosProtocolos = { clientes: Nomes; ucs: ReadonlyMap<string, UcDoProtocolo>; pessoas: Nomes };

const ENCERRADAS = [...SITUACOES_ENCERRADAS_DO_PROTOCOLO];
const HISTORICO_NA_FICHA = 200;

/**
 * Persistência dos protocolos na distribuidora (PLU-348). O RLS decide o que se
 * lê e grava (a tela de protocolos do departamento do protocolo); nomes de
 * clientes, UCs e pessoas vêm das funções de segurança dos protocolos.
 */
@Injectable()
export class PrismaProtocolosRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  // ------------------------------------------------------------ distribuidoras

  distribuidoras(): Promise<{ id: string; nome: string; sigla: string | null; uf: string | null; ativa: boolean }[]> {
    return this.prisma.comContexto((tx) => tx.distribuidora.findMany({ select: { id: true, nome: true, sigla: true, uf: true, ativa: true }, orderBy: [{ ativa: "desc" }, { nome: "asc" }] }));
  }

  async criarDistribuidora(input: CriarDistribuidora, principal: AuthPrincipal): Promise<void> {
    const id = idDaDistribuidora(input.nome);
    if (!id) throw new RequisicaoInvalida("Nome de distribuidora inválido.", [{ campo: "nome", problema: "Use letras ou números." }]);
    await this.comUnicidade("Já existe uma distribuidora com esse nome.", () => this.prisma.comContexto(async (tx) => {
      await tx.distribuidora.create({ data: { id, nome: input.nome, sigla: input.sigla ?? null, uf: input.uf ?? null } });
      await this.registrar(tx, "protocolos.distribuidora.configurada", "distribuidora", id, null, principal, { acao: "criada" });
    }));
  }

  async editarDistribuidora(id: string, input: EditarDistribuidora, principal: AuthPrincipal): Promise<void> {
    await this.comUnicidade("Já existe uma distribuidora com esse nome.", () => this.prisma.comContexto(async (tx) => {
      const atual = await tx.distribuidora.findUnique({ where: { id }, select: { id: true } });
      if (!atual) throw new NaoEncontrado("Distribuidora não encontrada.");
      await tx.distribuidora.update({ where: { id }, data: Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) });
      await this.registrar(tx, "protocolos.distribuidora.configurada", "distribuidora", id, null, principal, { acao: "alterada", campos: Object.keys(input).sort() });
    }));
  }

  // ------------------------------------------------------------ protocolos

  /**
   * A lista com os filtros e as contagens (com os filtros, sem o de situação e o
   * de "verificar hoje"). `departamentos` são os que a pessoa alcança: o RLS já
   * filtra, e o filtro explícito mantém o plano de consulta simples.
   */
  async listar(query: ListarProtocolosQuery, departamentos: DepartamentoDoProtocolo[], hoje: string): Promise<{
    linhas: LinhaDoProtocolo[]; total: number; contagens: { emAndamento: number; verificarHoje: number; vencemEm7Dias: number; vencidos: number }; nomes: NomesDosProtocolos;
  }> {
    return this.prisma.comContexto(async (tx) => {
      const inicioDeHoje = inicioDoDiaEmManaus(hoje);
      const base: Prisma.ProtocoloWhereInput[] = [{ departamento: { in: query.departamento ? [query.departamento] : departamentos } }];
      if (query.empresa) base.push({ companyId: query.empresa });
      if (query.distribuidoraId) base.push({ distribuidoraId: query.distribuidoraId });
      if (query.ucId) base.push({ consumerUnitId: query.ucId });
      if (query.busca) base.push({ OR: await this.condicoesDaBusca(tx, query.busca) });

      const emAndamento: Prisma.ProtocoloWhereInput = { situacao: { notIn: ENCERRADAS } };
      const paraHoje: Prisma.ProtocoloWhereInput = { ...emAndamento, proximaVerificacao: { lte: inicioDeHoje } };
      const filtros = [...base];
      if (query.situacao) filtros.push({ situacao: query.situacao });
      if (query.grupo === "em_andamento") filtros.push(emAndamento);
      if (query.grupo === "encerrados") filtros.push({ situacao: { in: ENCERRADAS } });
      if (query.verificarHoje === "sim") filtros.push(paraHoje);

      const [linhas, total, andamento, verificar, vencem, vencidos] = await Promise.all([
        tx.protocolo.findMany({
          where: { AND: filtros },
          select: SELECT_DO_PROTOCOLO,
          // Em andamento primeiro pela próxima verificação; os encerrados, pelos mais recentes.
          orderBy: [{ encerradoEm: { sort: "desc", nulls: "first" } }, { proximaVerificacao: { sort: "asc", nulls: "last" } }, { dataLimite: "asc" }, { numero: "asc" }],
          take: LIMITE_DA_LISTA_DE_PROTOCOLOS,
        }),
        tx.protocolo.count({ where: { AND: filtros } }),
        tx.protocolo.count({ where: { AND: [...base, emAndamento] } }),
        tx.protocolo.count({ where: { AND: [...base, paraHoje] } }),
        tx.protocolo.count({ where: { AND: [...base, emAndamento, { dataLimite: { gte: inicioDeHoje, lte: inicioDoDiaEmManaus(somarDias(hoje, 7)) } }] } }),
        tx.protocolo.count({ where: { AND: [...base, emAndamento, { dataLimite: { lt: inicioDeHoje } }] } }),
      ]);
      return { linhas, total, contagens: { emAndamento: andamento, verificarHoje: verificar, vencemEm7Dias: vencem, vencidos }, nomes: await this.nomes(tx, linhas) };
    });
  }

  async ficha(id: string): Promise<{ linha: LinhaDoProtocolo; historico: LinhaDaVerificacao[]; nomes: NomesDosProtocolos }> {
    return this.prisma.comContexto(async (tx) => {
      const linha = await tx.protocolo.findUnique({ where: { id }, select: SELECT_DO_PROTOCOLO });
      if (!linha) throw new NaoEncontrado("Protocolo não encontrado.");
      const historico = await tx.verificacaoDeProtocolo.findMany({ where: { protocoloId: id }, select: SELECT_DA_VERIFICACAO, orderBy: { em: "desc" }, take: HISTORICO_NA_FICHA });
      return { linha, historico, nomes: await this.nomes(tx, [linha], historico.flatMap((h) => (h.porId ? [h.porId] : []))) };
    });
  }

  /** Os protocolos da UC em andamento, para a ficha da usina (o RLS deixa só os dos departamentos da pessoa). */
  daUc(ucId: string): Promise<LinhaDoProtocolo[]> {
    return this.prisma.comContexto((tx) => tx.protocolo.findMany({
      where: { consumerUnitId: ucId, situacao: { notIn: ENCERRADAS } },
      select: SELECT_DO_PROTOCOLO,
      orderBy: [{ proximaVerificacao: { sort: "asc", nulls: "last" } }, { dataLimite: "asc" }],
      take: 50,
    }));
  }

  /** Quantos protocolos do departamento ainda pedem verificação hoje (para a tarefa automática). */
  pendentesHoje(departamento: DepartamentoDoProtocolo, hoje: string): Promise<number> {
    return this.prisma.comContexto((tx) => tx.protocolo.count({ where: { departamento, situacao: { notIn: ENCERRADAS }, proximaVerificacao: { lte: inicioDoDiaEmManaus(hoje) } } }));
  }

  async criar(input: CriarProtocolo, principal: AuthPrincipal): Promise<string> {
    return this.comUnicidade("Essa distribuidora já tem um protocolo com esse número.", () => this.prisma.comContexto(async (tx) => {
      await this.garantirUcDoCliente(tx, input.clienteId, input.ucId);
      await this.garantirDistribuidoraAtiva(tx, input.distribuidoraId);
      const criado = await tx.protocolo.create({
        data: {
          companyId: input.empresa,
          departamento: input.departamento,
          clientId: input.clienteId,
          consumerUnitId: input.ucId,
          distribuidoraId: input.distribuidoraId,
          tipo: input.tipo,
          numero: input.numero,
          abertoEm: inicioDoDiaEmManaus(input.abertoEm),
          dataLimite: inicioDoDiaEmManaus(input.dataLimite),
          // Sem a primeira verificação, o lembrete é a própria data-limite.
          proximaVerificacao: inicioDoDiaEmManaus(input.proximaVerificacao ?? input.dataLimite),
          observacao: input.observacao ?? null,
          criadoPorId: principal.id,
        },
        select: { id: true },
      });
      await this.registrar(tx, "protocolos.protocolo.created", "protocolo", criado.id, input.empresa, principal, { departamento: input.departamento, tipo: input.tipo, distribuidoraId: input.distribuidoraId });
      return criado.id;
    }));
  }

  async editar(id: string, input: EditarProtocolo, principal: AuthPrincipal): Promise<void> {
    await this.comUnicidade("Essa distribuidora já tem um protocolo com esse número.", () => this.prisma.comContexto(async (tx) => {
      const atual = await tx.protocolo.findUnique({ where: { id }, select: { companyId: true, departamento: true, situacao: true, abertoEm: true, dataLimite: true, proximaVerificacao: true } });
      if (!atual) throw new NaoEncontrado("Protocolo não encontrado.");
      if (protocoloEncerrado(atual.situacao)) throw new EstadoInvalido("Protocolo encerrado não se edita.");
      if (input.distribuidoraId) await this.garantirDistribuidoraAtiva(tx, input.distribuidoraId);
      const dataLimite = input.dataLimite !== undefined ? inicioDoDiaEmManaus(input.dataLimite) : undefined;
      if (dataLimite && dataLimite < atual.abertoEm) throw new RequisicaoInvalida("A data-limite vem depois da abertura.", [{ campo: "dataLimite", problema: "Use uma data depois da abertura." }]);
      // O lembrete acompanha o prazo: se era a própria data-limite, ou cairia depois da nova, vai para a nova.
      const moverLembrete = dataLimite !== undefined && atual.proximaVerificacao !== null
        && (atual.proximaVerificacao.getTime() === atual.dataLimite.getTime() || atual.proximaVerificacao > dataLimite);
      await tx.protocolo.update({
        where: { id },
        data: {
          ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
          ...(input.numero !== undefined ? { numero: input.numero } : {}),
          ...(input.distribuidoraId !== undefined ? { distribuidoraId: input.distribuidoraId } : {}),
          ...(dataLimite ? { dataLimite } : {}),
          ...(moverLembrete ? { proximaVerificacao: dataLimite } : {}),
          ...(input.observacao !== undefined ? { observacao: input.observacao } : {}),
        },
      });
      await this.registrar(tx, "protocolos.protocolo.updated", "protocolo", id, atual.companyId, principal, { departamento: atual.departamento, campos: Object.keys(input).sort() });
    }));
  }

  /**
   * Registra a verificação e muda o protocolo na mesma transação. A troca é
   * condicional à situação lida: duas verificações ao mesmo tempo, a segunda
   * recebe 409 em vez de sobrescrever a primeira.
   */
  async verificar(id: string, input: VerificarProtocolo, principal: AuthPrincipal, agora: Date): Promise<{ departamento: DepartamentoDoProtocolo }> {
    return this.prisma.comContexto(async (tx) => {
      const atual = await tx.protocolo.findUnique({ where: { id }, select: { companyId: true, departamento: true, situacao: true, updatedAt: true } });
      if (!atual) throw new NaoEncontrado("Protocolo não encontrado.");
      if (protocoloEncerrado(atual.situacao)) throw new EstadoInvalido("Protocolo encerrado não recebe verificação.");
      const encerra = protocoloEncerrado(input.situacao);
      const proxima = !encerra && input.proximaVerificacao ? inicioDoDiaEmManaus(input.proximaVerificacao) : null;
      const acao = input.situacao === "com_pendencia" ? (input.acaoPendente ?? null) : null;
      const trocou = await tx.protocolo.updateMany({
        where: { id, situacao: atual.situacao, updatedAt: atual.updatedAt },
        data: { situacao: input.situacao, acaoPendente: acao, proximaVerificacao: proxima, encerradoEm: encerra ? agora : null },
      });
      if (trocou.count === 0) throw new Conflito("O protocolo mudou enquanto você verificava. Abra de novo e confira.");
      await tx.verificacaoDeProtocolo.create({
        data: { protocoloId: id, porId: principal.id, em: agora, situacaoAnterior: atual.situacao, situacao: input.situacao, nota: input.nota ?? null, acaoPendente: acao, proximaVerificacao: proxima },
      });
      // Sem a nota nem a ação: podem citar dados do cliente.
      await this.registrar(tx, "protocolos.protocolo.verificado", "protocolo", id, atual.companyId, principal, { departamento: atual.departamento, situacaoAnterior: atual.situacao, situacao: input.situacao });
      return { departamento: atual.departamento as DepartamentoDoProtocolo };
    });
  }

  /** Clientes ativos pelo nome, com as UCs, para abrir o protocolo. */
  clientesComUcs(busca: string): Promise<{ id: string; nome: string; ucs: { id: string; codigo: string; distribuidora: string }[] }[]> {
    return this.prisma.comContexto(async (tx) => {
      const clientes = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.clientes_para_protocolos(${busca}, NULL::uuid[]) LIMIT 20`;
      const ucs = await this.ucs(tx, clientes.map((c) => c.id), []);
      return clientes.map((c) => ({ id: c.id, nome: c.name, ucs: [...ucs.values()].filter((u) => u.clientId === c.id).map((u) => ({ id: u.id, codigo: u.codigo, distribuidora: u.distribuidora })) }));
    });
  }

  // ------------------------------------------------------------ apoio

  /** Número do protocolo, nome do cliente ou código da UC (entre as UCs com protocolo). */
  private async condicoesDaBusca(tx: Prisma.TransactionClient, busca: string): Promise<Prisma.ProtocoloWhereInput[]> {
    const condicoes: Prisma.ProtocoloWhereInput[] = [{ numero: { contains: busca, mode: "insensitive" } }];
    if (busca.trim().length >= 2) {
      const clientes = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.clientes_para_protocolos(${busca}, NULL::uuid[])`;
      if (clientes.length > 0) condicoes.push({ clientId: { in: clientes.map((c) => c.id) } });
    }
    const digitos = busca.replace(/\D/g, "");
    if (digitos.length >= 3) {
      const comProtocolo = await tx.protocolo.findMany({ select: { consumerUnitId: true }, distinct: ["consumerUnitId"], take: 5000 });
      const ucs = await this.ucs(tx, [], comProtocolo.map((p) => p.consumerUnitId));
      const casam = [...ucs.values()].filter((u) => u.codigo.replace(/\D/g, "").includes(digitos)).map((u) => u.id);
      if (casam.length > 0) condicoes.push({ consumerUnitId: { in: casam } });
    }
    return condicoes;
  }

  private async nomes(tx: Prisma.TransactionClient, linhas: LinhaDoProtocolo[], outrasPessoas: string[] = []): Promise<NomesDosProtocolos> {
    const pessoas = [...linhas.flatMap((l) => [l.criadoPorId, l.verificacoes[0]?.porId ?? null]), ...outrasPessoas].filter((p): p is string => p !== null);
    const [clientes, ucs, nomesDePessoas] = await Promise.all([
      this.nomesDeClientes(tx, linhas.map((l) => l.clientId)),
      this.ucs(tx, [], linhas.map((l) => l.consumerUnitId)),
      this.nomesDePessoas(tx, pessoas),
    ]);
    return { clientes, ucs, pessoas: nomesDePessoas };
  }

  private async garantirUcDoCliente(tx: Prisma.TransactionClient, clienteId: string, ucId: string): Promise<void> {
    const ucs = await this.ucs(tx, [], [ucId]);
    if (ucs.get(ucId)?.clientId !== clienteId) throw new RequisicaoInvalida("A UC não é do cliente.", [{ campo: "ucId", problema: "Escolha uma UC do cliente." }]);
  }

  private async garantirDistribuidoraAtiva(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const distribuidora = await tx.distribuidora.findUnique({ where: { id }, select: { ativa: true } });
    if (!distribuidora || !distribuidora.ativa) throw new RequisicaoInvalida("Distribuidora não encontrada ou inativa.", [{ campo: "distribuidoraId", problema: "Escolha uma distribuidora do catálogo." }]);
  }

  private async ucs(tx: Prisma.TransactionClient, clientes: string[], ucs: string[]): Promise<Map<string, UcDoProtocolo>> {
    const porCliente = [...new Set(clientes)];
    const porUc = [...new Set(ucs)];
    if (porCliente.length === 0 && porUc.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; client_id: string; code: string; distributor: string }[]>`
      SELECT id, client_id, code, distributor FROM plugga_security.ucs_para_protocolos(${porCliente}::uuid[], ${porUc}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, { id: l.id, clientId: l.client_id, codigo: l.code, distribuidora: l.distributor }]));
  }

  private async nomesDeClientes(tx: Prisma.TransactionClient, ids: string[]): Promise<Nomes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.clientes_para_protocolos(NULL, ${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  private async nomesDePessoas(tx: Prisma.TransactionClient, ids: string[]): Promise<Nomes> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM plugga_security.pessoas_dos_protocolos(${unicos}::uuid[])`;
    return new Map(linhas.map((l) => [l.id, l.name]));
  }

  /** Número repetido na distribuidora vira 409; cliente, UC ou distribuidora inexistentes, 400. */
  private async comUnicidade<T>(mensagem: string, gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") throw new Conflito(mensagem);
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") throw new RequisicaoInvalida("Cliente, UC ou distribuidora não encontrados.", [{ campo: "clienteId", problema: "Escolha do cadastro." }]);
      throw erro;
    }
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: "protocolos.protocolo.created" | "protocolos.protocolo.updated" | "protocolos.protocolo.verificado" | "protocolos.distribuidora.configurada",
    entityType: string,
    entityId: string,
    companyId: string | null,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType,
      entityId,
      ...(companyId ? { companyId } : {}),
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}

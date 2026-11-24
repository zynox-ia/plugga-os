import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CadastrarObra, CategoriaDeDocumentoDeObra, EditarObra, ListarObrasQuery } from "@plugga/shared";
import { LIMITE_DA_LISTA_DE_OBRAS } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { ENCERRADAS } from "./engenharia.rules";
import { conferirPeriodo, distribuirMarcos, proximoMarco } from "./obras.rules";

export type Nomes = ReadonlyMap<string, string>;
/** "2026-11-25" → "25/11/2026", como as outras mensagens de data. */
const diaBr = (dia: string): string => dia.split("-").reverse().join("/");
export type ArquivoDaObra = { chave: string; nome: string; tamanho: number; tipo: string };

const SELECT_DO_MARCO = { id: true, ordem: true, nome: true, previstoEm: true, feitoEm: true, feitoPorId: true } satisfies Prisma.MarcoDeObraSelect;
export type LinhaDoMarco = Prisma.MarcoDeObraGetPayload<{ select: typeof SELECT_DO_MARCO }>;

export const SELECT_DA_OBRA = {
  id: true,
  nome: true,
  companyId: true,
  tipo: true,
  clientId: true,
  potenciaKwp: true,
  responsavelId: true,
  inicioEm: true,
  entregaPrevistaEm: true,
  orcamento: true,
  ativa: true,
  criadoPorId: true,
  createdAt: true,
  marcos: { select: SELECT_DO_MARCO, orderBy: { ordem: "asc" } },
  _count: { select: { documentos: { where: { substituidoEm: null } }, ordensDeServico: { where: { situacao: { notIn: [...ENCERRADAS] } } } } },
} satisfies Prisma.ObraSelect;
export type LinhaDaObra = Prisma.ObraGetPayload<{ select: typeof SELECT_DA_OBRA }>;

const SELECT_DO_DOCUMENTO = {
  id: true, serieId: true, versao: true, categoria: true, protocoloId: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true,
  enviadoPorId: true, enviadoEm: true, substituidoEm: true,
} satisfies Prisma.DocumentoDeObraSelect;
export type LinhaDoDocumento = Prisma.DocumentoDeObraGetPayload<{ select: typeof SELECT_DO_DOCUMENTO }>;

/**
 * Persistência das obras (PLU-350). O RLS decide quem lê (Compras, Estoque,
 * Financeiro e Engenharia) e quem grava (a tela de Obras); o orçamento é do
 * gerente também no banco. Nomes de clientes e pessoas vêm de
 * `nomes_das_obras`, só id e nome.
 */
@Injectable()
export class PrismaObrasRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  async listar(query: ListarObrasQuery): Promise<{ linhas: LinhaDaObra[]; clientes: Nomes; pessoas: Nomes }> {
    return this.prisma.comContexto(async (tx) => {
      const filtros: Prisma.ObraWhereInput[] = [];
      if (query.inativas !== "incluir") filtros.push({ ativa: true });
      if (query.empresa) filtros.push({ companyId: query.empresa });
      if (query.clienteId) filtros.push({ clientId: query.clienteId });
      if (query.busca) {
        const clientes = query.busca.trim().length >= 2
          ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.clientes_para_engenharia(${query.busca}, NULL::uuid[])`
          : [];
        filtros.push({ OR: [{ nome: { contains: query.busca, mode: "insensitive" } }, ...(clientes.length > 0 ? [{ clientId: { in: clientes.map((c) => c.id) } }] : [])] });
      }
      const linhas = await tx.obra.findMany({ where: { AND: filtros }, select: SELECT_DA_OBRA, orderBy: [{ entregaPrevistaEm: { sort: "asc", nulls: "last" } }, { nome: "asc" }], take: LIMITE_DA_LISTA_DE_OBRAS });
      return { linhas, ...(await this.nomes(tx, linhas, [])) };
    });
  }

  async ficha(id: string): Promise<{
    linha: LinhaDaObra; documentos: LinhaDoDocumento[]; protocolos: Map<string, string>;
    ordens: { id: string; numero: number; tipo: string; situacao: string; descricao: string; prazo: Date }[];
    clientes: Nomes; pessoas: Nomes;
  }> {
    return this.prisma.comContexto(async (tx) => {
      const linha = await tx.obra.findUnique({ where: { id }, select: SELECT_DA_OBRA });
      if (!linha) throw new NaoEncontrado("Obra não encontrada.");
      const [documentos, ordens] = await Promise.all([
        tx.documentoDeObra.findMany({ where: { obraId: id }, select: SELECT_DO_DOCUMENTO, orderBy: [{ serieId: "asc" }, { versao: "desc" }] }),
        // As O.S. que a pessoa alcança (o RLS das O.S. pede as telas de O.S.).
        tx.ordemDeServico.findMany({ where: { obraId: id }, select: { id: true, numero: true, tipo: true, situacao: true, descricao: true, prazo: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      ]);
      const idsDeProtocolo = [...new Set(documentos.flatMap((d) => (d.protocoloId ? [d.protocoloId] : [])))];
      const protocolos = idsDeProtocolo.length > 0
        ? new Map((await tx.protocolo.findMany({ where: { id: { in: idsDeProtocolo } }, select: { id: true, numero: true } })).map((p) => [p.id, p.numero]))
        : new Map<string, string>();
      const pessoas = [...linha.marcos.flatMap((m) => (m.feitoPorId ? [m.feitoPorId] : [])), ...documentos.flatMap((d) => (d.enviadoPorId ? [d.enviadoPorId] : []))];
      return { linha, documentos, protocolos, ordens, ...(await this.nomes(tx, [linha], pessoas)) };
    });
  }

  /** A obra com os 6 marcos padrão, na mesma transação. */
  async cadastrar(input: CadastrarObra, principal: AuthPrincipal): Promise<string> {
    return this.prisma.comContexto(async (tx) => {
      await this.garantirResponsavel(tx, input.responsavelId ?? null);
      const criada = await tx.obra.create({
        data: {
          companyId: input.empresa,
          clientId: input.clienteId,
          nome: input.nome,
          tipo: input.tipo,
          potenciaKwp: input.potenciaKwp,
          responsavelId: input.responsavelId ?? null,
          inicioEm: inicioDoDiaEmManaus(input.inicioEm),
          entregaPrevistaEm: inicioDoDiaEmManaus(input.entregaPrevistaEm),
          criadoPorId: principal.id,
        },
        select: { id: true },
      }).catch((erro: unknown) => this.vinculo(erro));
      await tx.marcoDeObra.createMany({ data: distribuirMarcos(input.inicioEm, input.entregaPrevistaEm).map((m) => ({ obraId: criada.id, ordem: m.ordem, nome: m.nome, previstoEm: inicioDoDiaEmManaus(m.previstoEm) })) });
      await this.registrar(tx, "engenharia.obra.created", criada.id, input.empresa, principal, { tipo: input.tipo, marcos: 6 });
      return criada.id;
    });
  }

  /**
   * Edita a obra. Na obra sem período (as do Compras), informar início e entrega
   * cria os marcos. A entrega nova puxa os marcos pendentes que passariam dela e
   * o Termo de entrega pendente.
   */
  async editar(id: string, input: EditarObra, principal: AuthPrincipal, hoje: string): Promise<void> {
    return this.prisma.comContexto(async (tx) => {
      const atual = await tx.obra.findUnique({ where: { id }, select: { companyId: true, inicioEm: true, entregaPrevistaEm: true, marcos: { select: { id: true, ordem: true, previstoEm: true, feitoEm: true } } } });
      if (!atual) throw new NaoEncontrado("Obra não encontrada.");
      if (input.responsavelId) await this.garantirResponsavel(tx, input.responsavelId);
      if (input.inicioEm !== undefined && atual.inicioEm) throw new RequisicaoInvalida("O início da obra não muda.", [{ campo: "inicioEm", problema: "O início já foi informado." }]);
      const inicio = input.inicioEm ?? (atual.inicioEm ? diaEmManaus(atual.inicioEm) : null);
      const entrega = input.entregaPrevistaEm ?? (atual.entregaPrevistaEm ? diaEmManaus(atual.entregaPrevistaEm) : null);
      if ((inicio === null) !== (entrega === null)) throw new RequisicaoInvalida("Informe o início e a entrega prevista.", [{ campo: inicio ? "entregaPrevistaEm" : "inicioEm", problema: "A obra precisa das duas datas." }]);
      // A data que muda agora segue as regras: entrega depois do início e a partir de amanhã.
      if ((input.inicioEm !== undefined || input.entregaPrevistaEm !== undefined) && inicio && entrega) conferirPeriodo(inicio, entrega, hoje);
      const { orcamento, inicioEm, entregaPrevistaEm, ...resto } = input;
      await tx.obra.update({
        where: { id },
        data: {
          ...Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)),
          ...(orcamento !== undefined ? { orcamento } : {}),
          ...(inicioEm !== undefined ? { inicioEm: inicioDoDiaEmManaus(inicioEm) } : {}),
          ...(entregaPrevistaEm !== undefined ? { entregaPrevistaEm: inicioDoDiaEmManaus(entregaPrevistaEm) } : {}),
        },
      });
      if (inicio && entrega && atual.marcos.length === 0) {
        await tx.marcoDeObra.createMany({ data: distribuirMarcos(inicio, entrega).map((m) => ({ obraId: id, ordem: m.ordem, nome: m.nome, previstoEm: inicioDoDiaEmManaus(m.previstoEm) })) });
      } else if (entregaPrevistaEm !== undefined && entrega) {
        const limite = inicioDoDiaEmManaus(entrega);
        const ultimo = Math.max(...atual.marcos.map((m) => m.ordem));
        for (const m of atual.marcos.filter((x) => !x.feitoEm && (x.previstoEm > limite || x.ordem === ultimo))) {
          await tx.marcoDeObra.update({ where: { id: m.id }, data: { previstoEm: limite } });
        }
      }
      await this.registrar(tx, "engenharia.obra.updated", id, atual.companyId, principal, { campos: Object.keys(input).sort() });
    });
  }

  /** Marca o próximo marco como feito. A troca é condicional: na corrida, o segundo recebe 409. */
  async marcarFeito(obraId: string, marcoId: string, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const obra = await tx.obra.findUnique({ where: { id: obraId }, select: { companyId: true, inicioEm: true, marcos: { select: { id: true, ordem: true, feitoEm: true } } } });
      if (!obra) throw new NaoEncontrado("Obra não encontrada.");
      if (!obra.inicioEm) throw new EstadoInvalido("A obra ainda não tem início e entrega.");
      if (obra.inicioEm > agora) throw new EstadoInvalido(`A obra começa em ${diaBr(diaEmManaus(obra.inicioEm))}: o marco só pode ser feito a partir do início.`);
      const marco = obra.marcos.find((m) => m.id === marcoId);
      if (!marco) throw new NaoEncontrado("Marco não encontrado.");
      if (marco.feitoEm) throw new EstadoInvalido("Este marco já foi feito.");
      const proximo = proximoMarco(obra.marcos.map((m) => ({ ...m, feito: m.feitoEm !== null })));
      if (proximo?.id !== marcoId) throw new EstadoInvalido("Os marcos são feitos em ordem: faça primeiro o próximo.");
      const trocou = await tx.marcoDeObra.updateMany({ where: { id: marcoId, feitoEm: null }, data: { feitoEm: agora, feitoPorId: principal.id } });
      if (trocou.count === 0) throw new Conflito("O marco mudou enquanto você marcava. Abra de novo e confira.");
      await this.registrar(tx, "engenharia.obra.marco_feito", obraId, obra.companyId, principal, { ordem: marco.ordem });
    });
  }

  /** Reprograma um marco pendente dentro do período da obra. */
  async reprogramar(obraId: string, marcoId: string, previstoEm: string, principal: AuthPrincipal, hoje: string): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const obra = await tx.obra.findUnique({ where: { id: obraId }, select: { companyId: true, inicioEm: true, entregaPrevistaEm: true } });
      if (!obra?.inicioEm || !obra.entregaPrevistaEm) throw new NaoEncontrado("Obra não encontrada ou sem período.");
      const marco = await tx.marcoDeObra.findFirst({ where: { id: marcoId, obraId }, select: { ordem: true, feitoEm: true } });
      if (!marco) throw new NaoEncontrado("Marco não encontrado.");
      if (marco.feitoEm) throw new EstadoInvalido("Marco feito não é reprogramado.");
      const inicio = diaEmManaus(obra.inicioEm);
      const entrega = diaEmManaus(obra.entregaPrevistaEm);
      if (previstoEm < inicio || previstoEm > entrega || previstoEm < hoje) {
        throw new RequisicaoInvalida("A data do marco fica entre o início e a entrega, e não no passado.", [{ campo: "previstoEm", problema: `Use uma data de ${diaBr(hoje > inicio ? hoje : inicio)} a ${diaBr(entrega)}.` }]);
      }
      await tx.marcoDeObra.update({ where: { id: marcoId }, data: { previstoEm: inicioDoDiaEmManaus(previstoEm) } });
      await this.registrar(tx, "engenharia.obra.marco_reprogramado", obraId, obra.companyId, principal, { ordem: marco.ordem });
    });
  }

  /** A empresa da obra (para a chave do arquivo) e o protocolo: visível e do mesmo cliente da obra, quando ela tem cliente. */
  async paraAnexar(obraId: string, protocoloId: string | undefined): Promise<{ empresa: string }> {
    return this.prisma.comContexto(async (tx) => {
      const obra = await tx.obra.findUnique({ where: { id: obraId }, select: { companyId: true, clientId: true } });
      if (!obra) throw new NaoEncontrado("Obra não encontrada.");
      if (protocoloId) {
        const protocolo = await tx.protocolo.findUnique({ where: { id: protocoloId }, select: { clientId: true } });
        if (!protocolo) throw new RequisicaoInvalida("Protocolo não encontrado.", [{ campo: "protocoloId", problema: "Escolha um protocolo da distribuidora." }]);
        if (obra.clientId && protocolo.clientId !== obra.clientId) {
          throw new RequisicaoInvalida("O protocolo é de outro cliente.", [{ campo: "protocoloId", problema: "Escolha um protocolo do cliente da obra." }]);
        }
      }
      return { empresa: obra.companyId };
    });
  }

  /**
   * Grava a versão. Com `substitui`, é a versão seguinte daquele documento; no
   * cronograma, sem `substitui`, o atual (se houver) vira a versão anterior.
   * O atual é marcado como substituído antes da inserção (um atual por série).
   */
  async anexar(obraId: string, categoria: CategoriaDeDocumentoDeObra, substitui: string | undefined, protocoloId: string | undefined, arquivo: ArquivoDaObra, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const obra = await tx.obra.findUnique({ where: { id: obraId }, select: { companyId: true } });
      if (!obra) throw new NaoEncontrado("Obra não encontrada.");
      const anterior = substitui
        ? await tx.documentoDeObra.findFirst({ where: { id: substitui, obraId }, select: { id: true, serieId: true, versao: true, categoria: true, substituidoEm: true } })
        : categoria === "cronograma"
          ? await tx.documentoDeObra.findFirst({ where: { obraId, categoria: "cronograma", substituidoEm: null }, select: { id: true, serieId: true, versao: true, categoria: true, substituidoEm: true } })
          : null;
      if (substitui && !anterior) throw new NaoEncontrado("Documento não encontrado.");
      if (anterior?.substituidoEm) throw new EstadoInvalido("Esta versão já foi substituída; envie sobre a atual.");
      if (anterior && anterior.categoria !== categoria) throw new RequisicaoInvalida("A nova versão é da mesma categoria.", [{ campo: "categoria", problema: "Use a categoria do documento." }]);
      if (anterior) {
        const trocou = await tx.documentoDeObra.updateMany({ where: { id: anterior.id, substituidoEm: null }, data: { substituidoEm: agora, substituidoPorId: principal.id } });
        if (trocou.count === 0) throw new Conflito("O documento mudou enquanto você enviava. Abra de novo e confira.");
      }
      const id = randomUUID();
      await tx.documentoDeObra.create({
        data: {
          id, obraId, serieId: anterior?.serieId ?? id, versao: (anterior?.versao ?? 0) + 1, categoria, protocoloId: protocoloId ?? null,
          arquivoChave: arquivo.chave, arquivoNome: arquivo.nome, arquivoTamanho: arquivo.tamanho, arquivoTipo: arquivo.tipo, enviadoPorId: principal.id, enviadoEm: agora,
        },
      });
      await this.registrar(tx, "engenharia.obra.documento_enviado", obraId, obra.companyId, principal, { categoria, versao: (anterior?.versao ?? 0) + 1 });
    });
  }

  async documento(obraId: string, documentoId: string): Promise<ArquivoDaObra> {
    const d = await this.prisma.comContexto((tx) => tx.documentoDeObra.findFirst({ where: { id: documentoId, obraId }, select: { arquivoChave: true, arquivoNome: true, arquivoTamanho: true, arquivoTipo: true } }));
    if (!d) throw new NaoEncontrado("Documento não encontrado.");
    return { chave: d.arquivoChave, nome: d.arquivoNome, tamanho: d.arquivoTamanho, tipo: d.arquivoTipo };
  }

  responsaveis(): Promise<{ id: string; nome: string }[]> {
    return this.prisma.comContexto((tx) => tx.$queryRaw<{ id: string; nome: string }[]>`SELECT id, nome FROM plugga_security.responsaveis_de_obra()`);
  }

  // ------------------------------------------------------------ apoio

  private async garantirResponsavel(tx: Prisma.TransactionClient, id: string | null): Promise<void> {
    if (!id) return;
    const linhas = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plugga_security.responsaveis_de_obra() WHERE id = ${id}::uuid`;
    if (linhas.length === 0) throw new RequisicaoInvalida("O responsável precisa ser uma pessoa ativa da Engenharia.", [{ campo: "responsavelId", problema: "Escolha alguém da Engenharia." }]);
  }

  private async nomes(tx: Prisma.TransactionClient, linhas: LinhaDaObra[], outrasPessoas: string[]): Promise<{ clientes: Nomes; pessoas: Nomes }> {
    const clientes = [...new Set(linhas.flatMap((l) => (l.clientId ? [l.clientId] : [])))];
    const pessoas = [...new Set([...linhas.flatMap((l) => [l.responsavelId, l.criadoPorId].filter((p): p is string => p !== null)), ...outrasPessoas])];
    if (clientes.length === 0 && pessoas.length === 0) return { clientes: new Map(), pessoas: new Map() };
    const r = await tx.$queryRaw<{ tipo: string; id: string; nome: string }[]>`SELECT tipo, id, nome FROM plugga_security.nomes_das_obras(${clientes}::uuid[], ${pessoas}::uuid[])`;
    return {
      clientes: new Map(r.filter((x) => x.tipo === "cliente").map((x) => [x.id, x.nome])),
      pessoas: new Map(r.filter((x) => x.tipo === "pessoa").map((x) => [x.id, x.nome])),
    };
  }

  /** Cliente ou responsável inexistente vira 400, não 500. */
  private vinculo(erro: unknown): never {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
      throw new RequisicaoInvalida("Cliente ou responsável não encontrados.", [{ campo: "clienteId", problema: "Escolha do cadastro." }]);
    }
    throw erro;
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: "engenharia.obra.created" | "engenharia.obra.updated" | "engenharia.obra.marco_feito" | "engenharia.obra.marco_reprogramado" | "engenharia.obra.documento_enviado",
    entityId: string,
    companyId: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType: "obra",
      entityId,
      companyId,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}

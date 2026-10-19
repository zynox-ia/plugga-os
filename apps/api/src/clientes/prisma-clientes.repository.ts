import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ActorType } from "@prisma/client";
import {
  clientDetailSchema,
  clientDuplicateCandidatesResponseSchema,
  clientOwnersResponseSchema,
  createClientResponseSchema,
  listClientsResponseSchema,
  somenteDigitos,
  telefoneNacional,
  type ClientContactInput,
  type ClientDetail,
  type ClientDuplicateCandidate,
  type ClientDuplicateCandidatesResponse,
  type ClientOwnersResponse,
  type ClientPersonType,
  type CreateClientRequest,
  type CreateClientResponse,
  type DuplicateCandidatesQuery,
  type InactivateClientRequest,
  type ListClientsQuery,
  type ListClientsResponse,
  type NomeDeEventoAuditavel,
  type UpdateClientContactRequest,
  type UpdateClientRequest,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { ClientesRepository } from "./clientes.repository";
import { camposInformados, paraDetalhe, paraItemDeLista, problemasDaEdicao } from "./clientes.rules";

/** Digits-only comparison: formatting (spaces, dashes, DDI) must not hide a match. */
export function onlyDigits(value: string): string {
  return somenteDigitos(value);
}

/** Diacritic/case/punctuation-insensitive comparison so "José" matches "jose". */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COM_DONO_E_CONTATOS = {
  owner: { select: { id: true, name: true } },
  contacts: true,
} satisfies Prisma.ClientInclude;

/** Papéis de empresa que podem ser responsáveis por um cliente; o admin de plataforma também pode. */
const PAPEIS_RESPONSAVEIS = ["comercial", "diretoria"];

const PODE_SER_RESPONSAVEL: Prisma.UserWhereInput = {
  status: "active",
  OR: [
    { platformRoles: { some: { role: { key: "admin" } } } },
    { memberships: { some: { roles: { some: { role: { key: { in: PAPEIS_RESPONSAVEIS } } } } } } },
  ],
};

function mensagemDeDocumentoRepetido(personType: ClientPersonType): string {
  return personType === "pf" ? "Já existe um cliente com este CPF." : "Já existe um cliente com este CNPJ.";
}

@Injectable()
export class PrismaClientesRepository extends ClientesRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {
    super();
  }

  async list(query: ListClientsQuery): Promise<ListClientsResponse> {
    const where: Prisma.ClientWhereInput = {};
    if (query.active !== undefined) where.active = query.active === "true";
    if (query.q) {
      const termo = query.q.trim();
      const texto = { contains: termo, mode: "insensitive" as const };
      const ou: Prisma.ClientWhereInput[] = [
        { name: texto },
        { legalName: texto },
        { email: texto },
        { contacts: { some: { OR: [{ name: texto }, { email: texto }] } } },
      ];
      // Documento e telefone são guardados só com dígitos: "11.222.333" e "(92) 9999" também acham.
      const digitos = somenteDigitos(termo);
      if (digitos.length >= 4) {
        ou.push(
          { document: { contains: digitos } },
          { phone: { contains: digitos } },
          { contacts: { some: { phone: { contains: digitos } } } },
        );
      }
      where.OR = ou;
    }

    const linhas = await this.prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      take: 100,
      include: {
        owner: { select: { id: true, name: true } },
        contacts: { select: { name: true, isPrimary: true, createdAt: true } },
      },
    });
    return listClientsResponseSchema.parse({ items: linhas.map(paraItemDeLista) });
  }

  async get(id: string): Promise<ClientDetail> {
    const linha = await this.prisma.client.findUnique({ where: { id }, include: COM_DONO_E_CONTATOS });
    if (!linha) throw new NaoEncontrado("Cliente não encontrado.");
    return clientDetailSchema.parse(paraDetalhe(linha));
  }

  async create(input: CreateClientRequest, principal: AuthPrincipal): Promise<CreateClientResponse> {
    const { primaryContact, ownerId, ...campos } = input;

    // Sem responsável escolhido, o responsável é quem cadastra.
    const responsavel = ownerId ?? (principal.kind === "user" ? principal.id : undefined);
    if (!responsavel) throw new RequisicaoInvalida("Informe o responsável pelo cliente.");
    await this.garantirResponsavel(responsavel);
    if (campos.document) await this.garantirDocumentoLivre(campos.document, input.personType);

    const avisos = await this.candidatosADuplicata({
      name: input.name,
      phone: campos.phone ?? undefined,
      email: campos.email ?? undefined,
    });

    const criado = await this.comUnicidadeDeDocumento(input.personType, () =>
      this.prisma.$transaction(async (tx) => {
        const cliente = await tx.client.create({
          data: {
            ...campos,
            ownerId: responsavel,
            ...(primaryContact ? { contacts: { create: { ...primaryContact, isPrimary: true } } } : {}),
          },
          include: COM_DONO_E_CONTATOS,
        });
        await this.registrar(tx, "clientes.client_created", "client", cliente.id, principal, {
          campos: camposInformados(input),
          duplicateCandidateIds: avisos.map((candidato) => candidato.id),
        });
        return cliente;
      }),
    );

    return createClientResponseSchema.parse({ client: paraDetalhe(criado), duplicateCandidates: avisos });
  }

  async update(id: string, input: UpdateClientRequest, principal: AuthPrincipal): Promise<ClientDetail> {
    const atual = await this.prisma.client.findUnique({ where: { id }, include: COM_DONO_E_CONTATOS });
    if (!atual) throw new NaoEncontrado("Cliente não encontrado.");

    const problemas = problemasDaEdicao(atual, input, atual.contacts.length > 0);
    if (problemas[0]) throw new RequisicaoInvalida(problemas[0].problema, problemas);

    const tipoFinal = input.personType ?? atual.personType;
    if (input.ownerId) await this.garantirResponsavel(input.ownerId);
    if (input.document) await this.garantirDocumentoLivre(input.document, tipoFinal, id);

    const atualizado = await this.comUnicidadeDeDocumento(tipoFinal, () =>
      this.prisma.$transaction(async (tx) => {
        const cliente = await tx.client.update({
          where: { id },
          data: input,
          include: COM_DONO_E_CONTATOS,
        });
        await this.registrar(tx, "clientes.client_updated", "client", id, principal, { campos: camposInformados(input) });
        return cliente;
      }),
    );

    return clientDetailSchema.parse(paraDetalhe(atualizado));
  }

  async activate(id: string, principal: AuthPrincipal): Promise<ClientDetail> {
    return this.mudarSituacao(id, true, "clientes.client_activated", principal, {});
  }

  async inactivate(id: string, input: InactivateClientRequest, principal: AuthPrincipal): Promise<ClientDetail> {
    return this.mudarSituacao(id, false, "clientes.client_inactivated", principal, { campos: input.reason ? ["reason"] : [] });
  }

  async duplicateCandidates(query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse> {
    if (!query.name && !query.document && !query.phone && !query.email) {
      throw new RequisicaoInvalida("Informe nome, documento, telefone ou e-mail.");
    }
    const candidatos = await this.candidatosADuplicata(query);
    return clientDuplicateCandidatesResponseSchema.parse({ candidates: candidatos });
  }

  async owners(): Promise<ClientOwnersResponse> {
    const usuarios = await this.prisma.user.findMany({
      where: PODE_SER_RESPONSAVEL,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return clientOwnersResponseSchema.parse({ items: usuarios });
  }

  async addContact(clientId: string, input: ClientContactInput, principal: AuthPrincipal): Promise<ClientDetail> {
    const cliente = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { personType: true, _count: { select: { contacts: true } } },
    });
    if (!cliente) throw new NaoEncontrado("Cliente não encontrado.");
    if (cliente.personType !== "pj") throw new RequisicaoInvalida("Contatos são só de cliente pessoa jurídica.");

    // O primeiro contato é o principal; marcar outro como principal desmarca o anterior.
    const seraPrincipal = input.isPrimary === true || cliente._count.contacts === 0;
    await this.prisma.$transaction(async (tx) => {
      if (seraPrincipal) await tx.clientContact.updateMany({ where: { clientId, isPrimary: true }, data: { isPrimary: false } });
      const contato = await tx.clientContact.create({ data: { ...input, clientId, isPrimary: seraPrincipal } });
      await this.registrar(tx, "clientes.contact.added", "client_contact", contato.id, principal, {
        clientId,
        campos: camposInformados(input),
      });
    });
    return this.get(clientId);
  }

  async updateContact(clientId: string, contactId: string, input: UpdateClientContactRequest, principal: AuthPrincipal): Promise<ClientDetail> {
    const contato = await this.prisma.clientContact.findFirst({ where: { id: contactId, clientId }, select: { id: true } });
    if (!contato) throw new NaoEncontrado("Contato não encontrado.");

    await this.prisma.$transaction(async (tx) => {
      if (input.isPrimary === true) {
        await tx.clientContact.updateMany({ where: { clientId, isPrimary: true, NOT: { id: contactId } }, data: { isPrimary: false } });
      }
      await tx.clientContact.update({ where: { id: contactId }, data: input });
      await this.registrar(tx, "clientes.contact.updated", "client_contact", contactId, principal, {
        clientId,
        campos: camposInformados(input),
      });
    });
    return this.get(clientId);
  }

  async removeContact(clientId: string, contactId: string, principal: AuthPrincipal): Promise<ClientDetail> {
    const contato = await this.prisma.clientContact.findFirst({ where: { id: contactId, clientId }, select: { isPrimary: true } });
    if (!contato) throw new NaoEncontrado("Contato não encontrado.");

    await this.prisma.$transaction(async (tx) => {
      await tx.clientContact.delete({ where: { id: contactId } });
      // Sem o principal, o contato mais antigo assume, para o cliente não ficar sem referência.
      if (contato.isPrimary) {
        const proximo = await tx.clientContact.findFirst({ where: { clientId }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (proximo) await tx.clientContact.update({ where: { id: proximo.id }, data: { isPrimary: true } });
      }
      await this.registrar(tx, "clientes.contact.removed", "client_contact", contactId, principal, { clientId });
    });
    return this.get(clientId);
  }

  private async mudarSituacao(
    id: string,
    ativo: boolean,
    evento: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<ClientDetail> {
    const existente = await this.prisma.client.findUnique({ where: { id }, select: { active: true } });
    if (!existente) throw new NaoEncontrado("Cliente não encontrado.");
    if (existente.active !== ativo) {
      await this.prisma.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data: { active: ativo } });
        await this.registrar(tx, evento, "client", id, principal, payload);
      });
    }
    return this.get(id);
  }

  private async garantirResponsavel(userId: string): Promise<void> {
    const usuario = await this.prisma.user.findFirst({ where: { ...PODE_SER_RESPONSAVEL, id: userId }, select: { id: true } });
    if (!usuario) throw new RequisicaoInvalida("O responsável precisa ter papel comercial ou de diretoria.");
  }

  private async garantirDocumentoLivre(document: string, personType: ClientPersonType, excetoId?: string): Promise<void> {
    const existente = await this.prisma.client.findUnique({ where: { document }, select: { id: true } });
    if (existente && existente.id !== excetoId) throw new Conflito(mensagemDeDocumentoRepetido(personType));
  }

  /** Duas gravações simultâneas do mesmo documento: o índice único decide e a segunda vira 409. */
  private async comUnicidadeDeDocumento<T>(personType: ClientPersonType, gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new Conflito(mensagemDeDocumentoRepetido(personType));
      }
      throw erro;
    }
  }

  /**
   * Prefiltro largo no SQL e comparação exata em memória, como antes: documento
   * igual bloqueia (quem chama decide); telefone, e-mail ou nome parecido avisam.
   * Telefone e e-mail também casam com os contatos de outros clientes.
   */
  private async candidatosADuplicata(entrada: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidate[]> {
    const documento = entrada.document ? somenteDigitos(entrada.document) : null;
    const telefone = entrada.phone ? telefoneNacional(entrada.phone) : null;
    const email = entrada.email?.trim().toLowerCase() || null;
    const nome = entrada.name ? normalizeName(entrada.name) : null;
    const primeiraPalavra = nome?.split(" ")[0] ?? null;

    const ou: Prisma.ClientWhereInput[] = [];
    if (documento && documento.length >= 11) ou.push({ document: documento });
    if (email) {
      ou.push({ email: { equals: email, mode: "insensitive" } }, { contacts: { some: { email: { equals: email, mode: "insensitive" } } } });
    }
    // Só os 4 finais: são contíguos em qualquer formatação; a comparação exata vem depois.
    if (telefone && telefone.length >= 8) {
      ou.push({ phone: { contains: telefone.slice(-4) } }, { contacts: { some: { phone: { contains: telefone.slice(-4) } } } });
    }
    if (primeiraPalavra && primeiraPalavra.length >= 3) ou.push({ name: { contains: primeiraPalavra, mode: "insensitive" } });
    if (ou.length === 0) return [];

    const linhas = await this.prisma.client.findMany({
      where: { OR: ou, ...(entrada.excludeId ? { id: { not: entrada.excludeId } } : {}) },
      take: 50,
      select: { id: true, name: true, personType: true, document: true, phone: true, email: true, contacts: { select: { phone: true, email: true } } },
    });

    const candidatos: ClientDuplicateCandidate[] = [];
    for (const linha of linhas) {
      const telefones = [linha.phone, ...linha.contacts.map((c) => c.phone)].filter((t): t is string => !!t);
      const emails = [linha.email, ...linha.contacts.map((c) => c.email)].filter((e): e is string => !!e).map((e) => e.toLowerCase());
      const motivos: ClientDuplicateCandidate["matchedOn"] = [];
      if (documento && linha.document === documento) motivos.push("document");
      if (telefone && telefones.some((t) => telefoneNacional(t) === telefone)) motivos.push("phone");
      if (email && emails.includes(email)) motivos.push("email");
      if (nome) {
        const nomeDaLinha = normalizeName(linha.name);
        if (nomeDaLinha === nome || nomeDaLinha.includes(nome) || nome.includes(nomeDaLinha)) motivos.push("name");
      }
      if (motivos.length > 0) candidatos.push({ id: linha.id, name: linha.name, personType: linha.personType, matchedOn: motivos });
    }
    return candidatos.sort((a, b) => Number(b.matchedOn.includes("document")) - Number(a.matchedOn.includes("document")));
  }

  private registrar(
    tx: Prisma.TransactionClient,
    evento: string,
    entityType: string,
    entityId: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName: evento as NomeDeEventoAuditavel,
      entityType,
      entityId,
      actorType: this.actorType(principal),
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }

  private actorType(principal: AuthPrincipal): ActorType {
    return principal.kind === "user" ? "user" : "system";
  }
}

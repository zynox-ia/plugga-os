import { randomBytes, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, EstadoInvalido } from "../src/common/errors/dominio.js";
import { PrismaCommercialRepository } from "../src/commercial/prisma-commercial.repository.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { contextoBanco } from "../src/prisma/contexto-banco.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Ganhar uma oportunidade com cliente novo, contra o Postgres de verdade.
 *
 * Exige banco no ar, então fica atrás de variável:
 *
 *     RUN_ATOMICIDADE_INTEGRATION_TESTS=true pnpm --filter @plugga/api vitest run test/atomicidade-comercial.integration.spec.ts
 *
 * O que se prova: o cliente novo e a marcação "ganha" saem na mesma transação.
 * Se a marcação falha, não sobra cliente órfão (nem o evento dele).
 */
const HABILITADO = process.env.RUN_ATOMICIDADE_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

/**
 * A primeira leitura transacional mostra a oportunidade aberta. A escrita
 * seguinte usa seu status real, e a criacao real do cliente e observada.
 */
function iludirPrimeiraLeitura(real: PrismaService, clienteCriado: (id: string) => void): PrismaService {
  let iludir = true;
  const ligar = (alvo: object, chave: string | symbol) => {
    const valor = Reflect.get(alvo, chave) as unknown;
    return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(alvo) : valor;
  };
  return new Proxy(real, {
    get(alvo, chave) {
      if (chave !== "comContexto") return ligar(alvo, chave);
      return <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, opcoes?: Parameters<PrismaService["comContexto"]>[1]) =>
        alvo.comContexto((tx) => fn(new Proxy(tx, {
          get(cliente, delegate) {
            if (delegate === "opportunity") return new Proxy(cliente.opportunity, {
              get(d, metodo) {
                if (metodo === "findUnique") return async (args: Parameters<typeof d.findUnique>[0]) => {
                  const linha = await d.findUnique(args);
                  if (!iludir) return linha;
                  iludir = false;
                  return linha ? { ...linha, status: "aberta" } : linha;
                };
                return ligar(d, metodo);
              },
            });
            if (delegate === "client") return new Proxy(cliente.client, {
              get(d, metodo) {
                if (metodo === "create") return async (args: Parameters<typeof d.create>[0]) => {
                  const criado = await d.create(args);
                  clienteCriado(criado.id);
                  return criado;
                };
                return ligar(d, metodo);
              },
            });
            return ligar(cliente, delegate);
          },
        })), opcoes);
    },
  });
}

describe.skipIf(!HABILITADO)("comercial: ganhar oportunidade é atômico", () => {
  const prisma = new PrismaService();
  const sessoes = new Map<string, string>();
  const repositorio = comSessaoDoAtor(new PrismaCommercialRepository(prisma, new AuditAppender()));
  const marca = `atom-com-${randomUUID().slice(0, 8)}`;
  const principal: AuthPrincipal = { id: randomUUID(), kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines", "crm.clientes", "crm.contratos"] }] } };
  const oportunidades: string[] = [];

  async function autenticar(ator: AuthPrincipal): Promise<void> {
    const sessionHash = randomBytes(32).toString("hex");
    await prisma.session.create({ data: {
      userId: ator.id, tokenHash: sessionHash,
      expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000),
    } });
    sessoes.set(ator.id, sessionHash);
  }

  function comSessaoDoAtor(repository: PrismaCommercialRepository): PrismaCommercialRepository {
    return new Proxy(repository, {
      get(alvo, chave) {
        const metodo = Reflect.get(alvo, chave) as unknown;
        if (typeof metodo !== "function") return metodo;
        return (...args: unknown[]) => {
          const ator = args.at(-1) as AuthPrincipal;
          const sessionHash = sessoes.get(ator.id);
          if (!sessionHash) throw new Error("Ator de fixture sem sessao persistida.");
          return contextoBanco.run({ sessionHash }, () => Reflect.apply(metodo, alvo, args));
        };
      },
    });
  }

  async function novaOportunidade(extra: { status?: "aberta" | "perdida"; ownerId?: string } = {}): Promise<string> {
    const linha = await prisma.opportunity.create({
      data: {
        title: `${marca} oportunidade`,
        product: "teste",
        ownerId: extra.ownerId ?? principal.id,
        status: extra.status ?? "aberta",
        nextActionAt: new Date(Date.now() + 86_400_000),
      },
    });
    oportunidades.push(linha.id);
    return linha.id;
  }

  const clientesDaMarca = (email: string) => prisma.client.findMany({ where: { email } });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: {
      id: principal.id, name: marca, email: `${marca}@teste.local`,
      departamentos: { create: { departamento: "crm", nivel: "membro", telas: ["crm.pipelines", "crm.clientes", "crm.contratos"] } },
    } });
    await autenticar(principal);
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.contract.deleteMany({ where: { client: { name: { startsWith: marca } } } });
    await prisma.opportunity.deleteMany({ where: { title: { startsWith: marca } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.session.deleteMany({ where: { userId: { in: [...sessoes.keys()] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    sessoes.clear();
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "cria o cliente e marca como ganha juntos, com os dois eventos",
    async () => {
      const id = await novaOportunidade();
      const email = `${marca}-ok@teste.local`;

      const detalhe = await repositorio.winOpportunity(
        id,
        { newClient: { name: `${marca} cliente ok`, email } },
        principal,
      );

      expect(detalhe.status).toBe("ganha");
      const clientes = await clientesDaMarca(email);
      expect(clientes).toHaveLength(1);
      expect(detalhe.clientId).toBe(clientes[0]?.id);

      const ganha = await prisma.eventLog.findMany({
        where: { eventName: "commercial.opportunity.won", entityId: id },
      });
      expect(ganha).toHaveLength(1);
      expect(ganha[0]?.payload).toEqual({ clientId: clientes[0]?.id });
      const criado = await prisma.eventLog.findMany({
        where: { eventName: "clientes.client.created", entityId: clientes[0]!.id },
      });
      expect(criado).toHaveLength(1);
      expect(JSON.stringify(criado[0]?.payload)).not.toContain(email);
    },
    PRAZO_MS,
  );

  it(
    "falha ao marcar como ganha não deixa cliente criado nem evento",
    async () => {
      // A oportunidade já foi decidida por outra pessoa, mas a leitura inicial
      // ainda a vê aberta: é exatamente a janela da corrida.
      const id = await novaOportunidade({ status: "perdida" });
      const email = `${marca}-orfao@teste.local`;
      const clientesInseridos: string[] = [];
      const contratosAntes = await prisma.contract.count({ where: { opportunityId: id } });
      const repositorioIludido = comSessaoDoAtor(new PrismaCommercialRepository(iludirPrimeiraLeitura(prisma, (clienteId) => clientesInseridos.push(clienteId)), new AuditAppender()));

      await expect(
        repositorioIludido.winOpportunity(id, { newClient: { name: `${marca} cliente órfão`, email } }, principal),
      ).rejects.toBeInstanceOf(EstadoInvalido);

      // O INSERT aconteceu de verdade antes da falha de transicao, e foi revertido.
      expect(clientesInseridos).toHaveLength(1);
      const clienteId = clientesInseridos[0];
      if (!clienteId) throw new Error("A fixture precisa executar client.create antes da reversao.");
      expect(await prisma.client.findUnique({ where: { id: clienteId } })).toBeNull();
      expect(await clientesDaMarca(email)).toHaveLength(0);
      const linha = await prisma.opportunity.findUnique({ where: { id } });
      expect(linha?.status).toBe("perdida");
      expect(linha?.clientId).toBeNull();
      expect(
        await prisma.eventLog.count({
          where: { eventName: { in: ["commercial.opportunity.won", "clientes.client.created"] }, entityId: { in: [id, clienteId] } },
        }),
      ).toBe(0);
      expect(await prisma.contract.count({ where: { opportunityId: id } })).toBe(contratosAntes);
    },
    PRAZO_MS,
  );

  it(
    "duas decisões simultâneas: uma vence e só o cliente dela existe",
    async () => {
      const id = await novaOportunidade();
      const emailA = `${marca}-a@teste.local`;
      const emailB = `${marca}-b@teste.local`;

      const resultados = await Promise.allSettled([
        repositorio.winOpportunity(id, { newClient: { name: `${marca} A`, email: emailA } }, principal),
        repositorio.winOpportunity(id, { newClient: { name: `${marca} B`, email: emailB } }, principal),
      ]);

      expect(resultados.filter((r) => r.status === "fulfilled"), JSON.stringify(resultados.map((r) => (r.status === "rejected" ? String(r.reason) : "ok")))).toHaveLength(1);
      const total = (await clientesDaMarca(emailA)).length + (await clientesDaMarca(emailB)).length;
      expect(total).toBe(1);
      const linha = await prisma.opportunity.findUnique({ where: { id } });
      expect(linha?.status).toBe("ganha");
      expect(linha?.clientId).not.toBeNull();
    },
    PRAZO_MS,
  );
  it("as telas concedidas permitem trabalhar registros de todos; atribuicao e tela ausente continuam bloqueadas", async () => {
    const outro = await prisma.user.create({ data: {
      name: `${marca} Outro`, email: `${marca}-outro@teste.local`,
      departamentos: { create: { departamento: "crm", nivel: "membro", telas: ["crm.pipelines", "crm.clientes", "crm.contratos"] } },
    } });
    const cliente = await prisma.client.create({ data: { name: `${marca} Cliente compartilhado`, ownerId: outro.id, email: `${marca}-cliente@teste.local` } });
    const oportunidade = await prisma.opportunity.create({ data: { title: `${marca} Compartilhada`, product: "teste", ownerId: outro.id, clientId: cliente.id, nextActionAt: new Date() } });
    const contrato = await prisma.contract.create({ data: { ownerId: outro.id, clientId: cliente.id, nextActionAt: new Date(Date.now() + 86_400_000) } });
    const proprioId = await novaOportunidade();

    expect((await repositorio.listOpportunities({ ownerId: outro.id }, principal)).items.map((item) => item.id)).toEqual([oportunidade.id]);
    expect((await repositorio.listContracts({ ownerId: outro.id }, principal)).items.map((item) => item.id)).toEqual([contrato.id]);
    expect((await repositorio.listOpportunities({}, principal)).items.map((item) => item.id)).toEqual(expect.arrayContaining([proprioId, oportunidade.id]));
    expect((await repositorio.opportunity(oportunidade.id, principal)).clientId).toBe(cliente.id);
    expect((await repositorio.contract(contrato.id, principal)).clientName).toBe(cliente.name);
    expect((await repositorio.updateOpportunityStage(oportunidade.id, { stage: "decisao" }, principal)).ownerId).toBe(outro.id);
    expect((await repositorio.registerOpportunityContact(oportunidade.id, { channel: "phone", outcome: "connected" }, principal)).contacts).toHaveLength(1);
    expect((await repositorio.updateContractStatus(contrato.id, { status: "revisao_interna" }, principal)).ownerId).toBe(outro.id);
    expect((await repositorio.winOpportunity(oportunidade.id, { clientId: cliente.id }, principal)).status).toBe("ganha");
    const paraPerder = await novaOportunidade({ ownerId: outro.id });
    expect((await repositorio.loseOpportunity(paraPerder, { lossReason: "Teste" }, principal)).status).toBe("perdida");
    const paraRevisitar = await novaOportunidade({ ownerId: outro.id });
    expect((await repositorio.revisitOpportunity(paraRevisitar, { nextActionAt: new Date().toISOString(), nextActionNote: "Teste" }, principal)).status).toBe("revisitar");
    expect((await repositorio.createOpportunity({ title: `${marca} vinculo`, product: "teste", ownerId: principal.id, clientId: cliente.id, nextActionAt: new Date().toISOString() }, principal)).clientId).toBe(cliente.id);
    expect((await repositorio.createContract({ clientId: cliente.id }, principal)).ownerId).toBe(principal.id);
    expect((await repositorio.createContract({ opportunityId: oportunidade.id }, principal)).clientId).toBe(cliente.id);
    expect((await repositorio.winOpportunity(proprioId, { clientId: cliente.id }, principal)).clientId).toBe(cliente.id);

    const paraAtribuir = await novaOportunidade();
    await expect(repositorio.updateOpportunityStage(paraAtribuir, { stage: "decisao", ownerId: outro.id }, principal)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(repositorio.createContract({ clientId: cliente.id, ownerId: outro.id }, principal)).rejects.toBeInstanceOf(AcessoNegado);
    const semTela = await prisma.user.create({ data: {
      name: `${marca} Sem tela`, email: `${marca}-sem-tela@teste.local`,
      departamentos: { create: { departamento: "crm", nivel: "membro", telas: [] } },
    } });
    const bloqueado: AuthPrincipal = { id: semTela.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: [] }] } };
    await autenticar(bloqueado);
    const contatosAntes = await prisma.opportunityContact.count({ where: { opportunityId: oportunidade.id } });
    for (const acao of [
      () => repositorio.listOpportunities({}, bloqueado),
      () => repositorio.listContracts({}, bloqueado),
      () => repositorio.opportunity(oportunidade.id, bloqueado),
      () => repositorio.contract(contrato.id, bloqueado),
      () => repositorio.updateOpportunityStage(paraAtribuir, { stage: "decisao" }, bloqueado),
      () => repositorio.registerOpportunityContact(oportunidade.id, { channel: "phone", outcome: "connected" }, bloqueado),
      () => repositorio.winOpportunity(paraAtribuir, { clientId: cliente.id }, bloqueado),
      () => repositorio.loseOpportunity(paraAtribuir, { lossReason: "Teste" }, bloqueado),
      () => repositorio.revisitOpportunity(paraAtribuir, { nextActionAt: new Date().toISOString(), nextActionNote: "Bloqueado" }, bloqueado),
      () => repositorio.updateContractStatus(contrato.id, { status: "aguardando_assinatura" }, bloqueado),
      () => repositorio.createOpportunity({ title: `${marca} bloqueada`, product: "teste", ownerId: bloqueado.id, nextActionAt: new Date().toISOString() }, bloqueado),
      () => repositorio.createContract({ clientId: cliente.id }, bloqueado),
    ]) await expect(acao()).rejects.toBeInstanceOf(AcessoNegado);
    expect(await prisma.opportunityContact.count({ where: { opportunityId: oportunidade.id } })).toBe(contatosAntes);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contrato.id } })).status).toBe("revisao_interna");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: paraAtribuir } })).ownerId).toBe(principal.id);
  }, PRAZO_MS);

  it("deduplicacao ao ganhar reaproveita cliente da tela sem trocar seu responsavel", async () => {
    const outro = await prisma.user.create({ data: { name: `${marca} Duplicado`, email: `${marca}-duplicado@teste.local` } });
    const email = `${marca}-dedup@teste.local`;
    const alheio = await prisma.client.create({ data: { name: `${marca} Alheio`, email, ownerId: outro.id } });
    const id = await novaOportunidade();
    const ganho = await repositorio.winOpportunity(id, { newClient: { name: `${marca} Próprio`, email } }, principal);
    expect(ganho.clientId).toBe(alheio.id);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: alheio.id } })).ownerId).toBe(outro.id);
    expect(await prisma.client.count({ where: { email } })).toBe(1);
  }, PRAZO_MS);

  it("transferir cliente preserva oportunidade e contrato para quem tem as telas concedidas", async () => {
    const outro = await prisma.user.create({ data: { name: `${marca} Destinatário`, email: `${marca}-transferencia@teste.local` } });
    const cliente = await prisma.client.create({ data: { name: `${marca} Transferido`, ownerId: principal.id } });
    const oportunidade = await prisma.opportunity.create({ data: { title: `${marca} Após transferência`, product: "teste", ownerId: principal.id, clientId: cliente.id } });
    const contrato = await prisma.contract.create({ data: { ownerId: principal.id, clientId: cliente.id, opportunityId: oportunidade.id, nextActionAt: new Date() } });
    expect((await repositorio.contract(contrato.id, principal)).clientName).toBe(cliente.name);
    await prisma.client.update({ where: { id: cliente.id }, data: { ownerId: outro.id } });

    const detalhe = await repositorio.opportunity(oportunidade.id, principal);
    expect(detalhe).toMatchObject({ clientId: cliente.id, clientName: cliente.name, contracts: [expect.objectContaining({ id: contrato.id })] });
    const item = (await repositorio.listOpportunities({}, principal)).items.find((linha) => linha.id === oportunidade.id);
    expect(item).toMatchObject({ clientId: cliente.id, clientName: cliente.name });
    expect((await repositorio.listContracts({}, principal)).items.map((linha) => linha.id)).toContain(contrato.id);
    expect((await repositorio.contract(contrato.id, principal)).clientName).toBe(cliente.name);
    expect((await repositorio.updateContractStatus(contrato.id, { status: "revisao_interna" }, principal)).status).toBe("revisao_interna");
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contrato.id } })).status).toBe("revisao_interna");
    expect((await prisma.opportunity.findUnique({ where: { id: oportunidade.id } }))?.clientId).toBe(cliente.id);
    const gerente: AuthPrincipal = { ...principal, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines", "crm.clientes", "crm.contratos"] }] } };
    expect((await repositorio.contract(contrato.id, gerente)).clientName).toBe(cliente.name);
    expect((await repositorio.opportunity(oportunidade.id, gerente)).clientName).toBe(cliente.name);
  }, PRAZO_MS);
});

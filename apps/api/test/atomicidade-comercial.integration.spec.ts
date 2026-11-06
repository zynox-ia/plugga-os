import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, EstadoInvalido, NaoEncontrado } from "../src/common/errors/dominio.js";
import { PrismaCommercialRepository } from "../src/commercial/prisma-commercial.repository.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
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
 * Devolve um PrismaService cuja PRIMEIRA leitura de oportunidade a mostra
 * aberta, mesmo já decidida: reproduz a janela entre a checagem e a transação.
 */
function iludirPrimeiraLeitura(real: PrismaService): PrismaService {
  let iludir = true;
  const ligar = (alvo: object, chave: string | symbol) => {
    const valor = Reflect.get(alvo, chave) as unknown;
    return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(alvo) : valor;
  };
  return new Proxy(real, {
    get(alvo, chave) {
      if (chave !== "opportunity") return ligar(alvo, chave);
      const delegate = alvo.opportunity;
      return new Proxy(delegate, {
        get(d, metodo) {
          if (metodo === "findUnique" && iludir) {
            iludir = false;
            return async (args: Parameters<typeof d.findUnique>[0]) => {
              const linha = await d.findUnique(args);
              return linha ? { ...linha, status: "aberta" } : linha;
            };
          }
          return ligar(d, metodo);
        },
      });
    },
  });
}

describe.skipIf(!HABILITADO)("comercial: ganhar oportunidade é atômico", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaCommercialRepository(prisma, new AuditAppender());
  const marca = `atom-com-${randomUUID().slice(0, 8)}`;
  const principal: AuthPrincipal = { id: randomUUID(), kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] } };
  const oportunidades: string[] = [];

  async function novaOportunidade(extra: { status?: "aberta" | "perdida" } = {}): Promise<string> {
    const linha = await prisma.opportunity.create({
      data: {
        title: `${marca} oportunidade`,
        product: "teste",
        ownerId: principal.id,
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
    await prisma.user.create({ data: { id: principal.id, name: marca, email: `${marca}@teste.local` } });
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.contract.deleteMany({ where: { client: { name: { startsWith: marca } } } });
    await prisma.opportunity.deleteMany({ where: { title: { startsWith: marca } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
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
      const repositorioIludido = new PrismaCommercialRepository(iludirPrimeiraLeitura(prisma), new AuditAppender());

      await expect(
        repositorioIludido.winOpportunity(id, { newClient: { name: `${marca} cliente órfão`, email } }, principal),
      ).rejects.toBeInstanceOf(EstadoInvalido);

      expect(await clientesDaMarca(email)).toHaveLength(0);
      const linha = await prisma.opportunity.findUnique({ where: { id } });
      expect(linha?.status).toBe("perdida");
      expect(linha?.clientId).toBeNull();
      expect(
        await prisma.eventLog.count({
          where: { eventName: { in: ["commercial.opportunity.won", "clientes.client.created"] }, entityId: id },
        }),
      ).toBe(0);
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
  it("isola oportunidades, contratos, contatos e vínculos de outro membro sem permitir ownerId forjado", async () => {
    const outro = await prisma.user.create({ data: { name: `${marca} Outro`, email: `${marca}-outro@teste.local` } });
    const cliente = await prisma.client.create({ data: { name: `${marca} Cliente restrito`, ownerId: outro.id, email: `${marca}-cliente@teste.local` } });
    const oportunidade = await prisma.opportunity.create({ data: { title: `${marca} Restrita`, product: "teste", ownerId: outro.id, clientId: cliente.id, nextActionAt: new Date() } });
    const contrato = await prisma.contract.create({ data: { ownerId: outro.id, clientId: cliente.id } });
    const proprioId = await novaOportunidade();

    expect((await repositorio.listOpportunities({ ownerId: outro.id }, principal)).items).toEqual([]);
    expect((await repositorio.listContracts({ ownerId: outro.id }, principal)).items).toEqual([]);
    expect((await repositorio.listOpportunities({}, principal)).items.map((item) => item.id)).toContain(proprioId);
    expect((await repositorio.listOpportunities({}, principal)).items.map((item) => item.id)).not.toContain(oportunidade.id);
    for (const acao of [
      () => repositorio.opportunity(oportunidade.id, principal),
      () => repositorio.contract(contrato.id, principal),
      () => repositorio.updateOpportunityStage(oportunidade.id, { stage: "decisao" }, principal),
      () => repositorio.registerOpportunityContact(oportunidade.id, { channel: "phone", outcome: "connected" }, principal),
      () => repositorio.winOpportunity(oportunidade.id, { clientId: cliente.id }, principal),
      () => repositorio.loseOpportunity(oportunidade.id, { lossReason: "Teste" }, principal),
      () => repositorio.revisitOpportunity(oportunidade.id, { nextActionAt: new Date().toISOString(), nextActionNote: "Teste" }, principal),
      () => repositorio.updateContractStatus(contrato.id, { status: "revisao_interna" }, principal),
      () => repositorio.createOpportunity({ title: `${marca} vínculo`, product: "teste", ownerId: principal.id, clientId: cliente.id, nextActionAt: new Date().toISOString() }, principal),
      () => repositorio.createContract({ clientId: cliente.id }, principal),
      () => repositorio.createContract({ opportunityId: oportunidade.id }, principal),
      () => repositorio.winOpportunity(proprioId, { clientId: cliente.id }, principal),
    ]) await expect(acao()).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(repositorio.updateOpportunityStage(proprioId, { stage: "decisao", ownerId: outro.id }, principal)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(repositorio.createContract({ clientId: cliente.id, ownerId: outro.id }, principal)).rejects.toBeInstanceOf(AcessoNegado);
    const gerente: AuthPrincipal = { ...principal, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] } };
    expect((await repositorio.opportunity(oportunidade.id, gerente)).id).toBe(oportunidade.id);
    expect((await repositorio.contract(contrato.id, gerente)).id).toBe(contrato.id);
    expect((await prisma.opportunityContact.count({ where: { opportunityId: oportunidade.id } }))).toBe(0);
    expect((await prisma.contract.findUnique({ where: { id: contrato.id } }))?.status).toBe("rascunho");
  }, PRAZO_MS);

  it("deduplicação ao ganhar não reaproveita cliente de outro membro e o novo tem responsável", async () => {
    const outro = await prisma.user.create({ data: { name: `${marca} Duplicado`, email: `${marca}-duplicado@teste.local` } });
    const email = `${marca}-dedup@teste.local`;
    const alheio = await prisma.client.create({ data: { name: `${marca} Alheio`, email, ownerId: outro.id } });
    const id = await novaOportunidade();
    const ganho = await repositorio.winOpportunity(id, { newClient: { name: `${marca} Próprio`, email } }, principal);
    expect(ganho.clientId).not.toBe(alheio.id);
    expect((await prisma.client.findUnique({ where: { id: ganho.clientId! } }))?.ownerId).toBe(principal.id);
  }, PRAZO_MS);

  it("transferir cliente oculta sua relação na oportunidade e o contrato inteiro do antigo responsável", async () => {
    const outro = await prisma.user.create({ data: { name: `${marca} Destinatário`, email: `${marca}-transferencia@teste.local` } });
    const cliente = await prisma.client.create({ data: { name: `${marca} Transferido`, ownerId: principal.id } });
    const oportunidade = await prisma.opportunity.create({ data: { title: `${marca} Após transferência`, product: "teste", ownerId: principal.id, clientId: cliente.id } });
    const contrato = await prisma.contract.create({ data: { ownerId: principal.id, clientId: cliente.id, opportunityId: oportunidade.id, nextActionAt: new Date() } });
    expect((await repositorio.contract(contrato.id, principal)).clientName).toBe(cliente.name);
    await prisma.client.update({ where: { id: cliente.id }, data: { ownerId: outro.id } });

    const detalhe = await repositorio.opportunity(oportunidade.id, principal);
    expect(detalhe).toMatchObject({ clientId: null, clientName: null, contracts: [] });
    const item = (await repositorio.listOpportunities({}, principal)).items.find((linha) => linha.id === oportunidade.id);
    expect(item).toMatchObject({ clientId: null, clientName: null });
    expect((await repositorio.listContracts({}, principal)).items.map((linha) => linha.id)).not.toContain(contrato.id);
    await expect(repositorio.contract(contrato.id, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(repositorio.updateContractStatus(contrato.id, { status: "revisao_interna" }, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect((await prisma.contract.findUnique({ where: { id: contrato.id } }))?.status).toBe("rascunho");
    expect((await prisma.opportunity.findUnique({ where: { id: oportunidade.id } }))?.clientId).toBe(cliente.id);
    const gerente: AuthPrincipal = { ...principal, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] } };
    expect((await repositorio.contract(contrato.id, gerente)).clientName).toBe(cliente.name);
    expect((await repositorio.opportunity(oportunidade.id, gerente)).clientName).toBe(cliente.name);
  }, PRAZO_MS);
});

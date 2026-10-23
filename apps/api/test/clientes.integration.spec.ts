import { randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clientContactInputSchema, createClientRequestSchema, updateClientRequestSchema } from "@plugga/shared";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { PrismaClientesRepository } from "../src/clientes/prisma-clientes.repository.js";
import { Conflito, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Cadastro único de clientes (PLU-268) contra o Postgres de verdade: índice
 * único do documento, contato principal, busca por dígitos e máscara da lista.
 *
 *     pnpm --filter @plugga/api test:clientes
 *
 * Os documentos são da faixa sintética do projeto (CNPJ 99999…, CPF 999999…),
 * gerados a cada execução com dígito verificador válido.
 */
const HABILITADO = process.env.RUN_CLIENTES_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

function digitoVerificador(base: number[], pesos: number[]): number {
  const resto = base.reduce((soma, d, i) => soma + d * pesos[i]!, 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function gerarCnpj(): string {
  const base = [9, 9, 9, 9, 9, ...Array.from({ length: 7 }, () => randomInt(10))];
  const d1 = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}

function gerarCpf(): string {
  const base = [9, 9, 9, 9, 9, 9, ...Array.from({ length: 3 }, () => randomInt(10))];
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}

const telefoneAleatorio = () => `92${9}${randomInt(10_000_000, 99_999_999)}`;

describe.skipIf(!HABILITADO)("clientes: cadastro único no Postgres", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaClientesRepository(prisma, new AuditAppender());
  const marca = `cli-${randomUUID().slice(0, 8)}`;
  let principal: AuthPrincipal;
  let semPapelId: string;

  // Mesma validação e normalização que o controller aplica antes do repositório.
  const criar = (dados: unknown) => repositorio.create(createClientRequestSchema.parse(dados), principal);
  const editar = (id: string, dados: unknown) => repositorio.update(id, updateClientRequestSchema.parse(dados), principal);
  const adicionarContato = (id: string, dados: unknown) => repositorio.addContact(id, clientContactInputSchema.parse(dados), principal);

  beforeAll(async () => {
    await prisma.$connect();
    // Banco de teste recém-migrado não tem o seed: o papel é garantido aqui.
    const admin = await prisma.role.upsert({ where: { key: "admin" }, create: { key: "admin", name: "Admin" }, update: {} });
    const dono = await prisma.user.create({
      data: { email: `${marca}-dono@teste.local`, name: `${marca} Dono`, platformRoles: { create: { roleId: admin.id } } },
    });
    const semPapel = await prisma.user.create({ data: { email: `${marca}-sem-papel@teste.local`, name: `${marca} Sem papel` } });
    principal = { id: dono.id, kind: "user", roles: ["admin"] };
    semPapelId = semPapel.id;
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.client.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "cadastra prospect sem documento, com quem cadastra como responsável e auditoria sem dado pessoal",
    async () => {
      const { client } = await criar({ personType: "pj", name: `${marca} Logística`, phone: telefoneAleatorio(), document: null });

      expect(client.document).toBeNull();
      expect(client.owner?.id).toBe(principal.id);
      const eventos = await prisma.eventLog.findMany({ where: { eventName: "clientes.client_created", entityId: client.id } });
      expect(eventos).toHaveLength(1);
      expect(JSON.stringify(eventos[0]?.payload)).not.toContain(client.phone!);
    },
    PRAZO_MS,
  );

  it(
    "bloqueia o mesmo CNPJ num segundo cliente e o aponta como duplicata",
    async () => {
      const cnpj = gerarCnpj();
      const { client } = await criar({ personType: "pj", name: `${marca} Hotel`, email: `${marca}-h@teste.local`, document: cnpj });

      await expect(
        criar({ personType: "pj", name: `${marca} Hotel Filial`, email: `${marca}-f@teste.local`, document: cnpj }),
      ).rejects.toBeInstanceOf(Conflito);

      const { candidates } = await repositorio.duplicateCandidates({ document: cnpj });
      expect(candidates[0]).toMatchObject({ id: client.id, matchedOn: expect.arrayContaining(["document"]) });
    },
    PRAZO_MS,
  );

  it(
    "avisa, sem bloquear, quando o telefone já é de um contato de outro cliente",
    async () => {
      const telefone = telefoneAleatorio();
      const { client } = await criar({ personType: "pj", name: `${marca} Supermercado`, email: `${marca}-s@teste.local` });
      await adicionarContato(client.id, { name: "Patrícia", phone: telefone });

      const resposta = await criar({ personType: "pf", name: `${marca} Patrícia Souza`, phone: `+55 ${telefone}` });

      expect(resposta.client.id).not.toBe(client.id);
      expect(resposta.duplicateCandidates).toContainEqual(expect.objectContaining({ id: client.id, matchedOn: expect.arrayContaining(["phone"]) }));
    },
    PRAZO_MS,
  );

  it(
    "recusa responsável sem papel comercial, de diretoria ou admin",
    async () => {
      await expect(
        criar({ personType: "pj", name: `${marca} Sem dono`, phone: telefoneAleatorio(), ownerId: semPapelId }),
      ).rejects.toBeInstanceOf(RequisicaoInvalida);
    },
    PRAZO_MS,
  );

  it(
    "mantém um contato principal: o primeiro assume, outro pode tomar o lugar e o mais antigo herda na remoção",
    async () => {
      const { client } = await criar({ personType: "pj", name: `${marca} Condomínio`, email: `${marca}-c@teste.local`, primaryContact: { name: "Jorge" } });
      const jorge = client.contacts[0]!;
      expect(jorge.isPrimary).toBe(true);

      let ficha = await adicionarContato(client.id, { name: "Marta" });
      expect(ficha.contacts.find((c) => c.name === "Marta")?.isPrimary).toBe(false);

      const marta = ficha.contacts.find((c) => c.name === "Marta")!;
      ficha = await repositorio.updateContact(client.id, marta.id, { isPrimary: true }, principal);
      expect(ficha.contacts.filter((c) => c.isPrimary).map((c) => c.name)).toEqual(["Marta"]);

      ficha = await repositorio.removeContact(client.id, marta.id, principal);
      expect(ficha.contacts).toEqual([expect.objectContaining({ id: jorge.id, isPrimary: true })]);
    },
    PRAZO_MS,
  );

  it(
    "não aceita contato em cliente pessoa física",
    async () => {
      const { client } = await criar({ personType: "pf", name: `${marca} Rafael`, phone: telefoneAleatorio() });
      await expect(adicionarContato(client.id, { name: "Alguém" })).rejects.toBeInstanceOf(RequisicaoInvalida);
    },
    PRAZO_MS,
  );

  it(
    "acha pelo CNPJ formatado e pelo nome do contato, e mascara CPF e telefone na lista",
    async () => {
      const cnpj = gerarCnpj();
      const cpf = gerarCpf();
      await criar({ personType: "pj", name: `${marca} Clínica`, phone: "9230007700", document: cnpj, primaryContact: { name: `${marca} Dra Helena` } });
      await criar({ personType: "pf", name: `${marca} Marcos`, email: `${marca}-m@teste.local`, document: cpf });

      const formatado = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
      const peloCnpj = await repositorio.list({ q: formatado });
      expect(peloCnpj.items.map((i) => i.name)).toEqual([`${marca} Clínica`]);
      expect(peloCnpj.items[0]?.phoneDisplay).toBe("(92) 3•••-7700");

      const peloContato = await repositorio.list({ q: `${marca} Dra Helena` });
      expect(peloContato.items.map((i) => i.name)).toEqual([`${marca} Clínica`]);

      const pf = await repositorio.list({ q: `${marca} Marcos` });
      expect(pf.items[0]?.documentDisplay).toBe(`•••.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-••`);
    },
    PRAZO_MS,
  );

  it(
    "na edição, guarda a data de nascimento sem deslocar o dia e não deixa apagar o último canal",
    async () => {
      const { client } = await criar({ personType: "pf", name: `${marca} Joana`, phone: telefoneAleatorio() });

      const editado = await editar(client.id, { birthDate: "1985-03-07", nationality: "brasileira" });
      expect(editado.birthDate).toBe("1985-03-07");

      await expect(editar(client.id, { phone: null })).rejects.toBeInstanceOf(RequisicaoInvalida);
    },
    PRAZO_MS,
  );
});

import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Acesso, ListaDaEquipe, MembroDaEquipe } from "@plugga/shared";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { AuditPort } from "../src/audit/audit.port";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { SessionCache } from "../src/core/auth/session-cache";
import { SessionLookupRepository } from "../src/core/auth/session-lookup.repository";
import { EmailPort } from "../src/email/email.port";
import { AuthRepository } from "../src/auth/auth.repository";
import {
  CapturingEmailPort,
  InMemoryAuthRepository,
  InMemorySessionLookup,
  InMemoryStore,
  NoopAuditRepository,
  type StoredUser,
} from "./support/in-memory-auth";

const SESSION_SECRET = "test_only_session_secret_change_me_please";
const SENHA = "senha de teste da equipe";

const DESENVOLVEDOR: Acesso = { plataforma: "desenvolvedor", departamentos: [] };
const ADMIN: Acesso = { plataforma: "admin", departamentos: [] };
const GERENTE_SUPRIMENTOS: Acesso = {
  plataforma: null,
  departamentos: [{ departamento: "suprimentos", nivel: "gerente" }],
};
const MEMBRO_SUPRIMENTOS: Acesso = {
  plataforma: null,
  departamentos: [{ departamento: "suprimentos", nivel: "membro" }],
};
const MEMBRO_CRM: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] };
const MEMBRO_SUPRIMENTOS_E_CRM: Acesso = {
  plataforma: null,
  departamentos: [
    { departamento: "crm", nivel: "membro" },
    { departamento: "suprimentos", nivel: "membro" },
  ],
};

describe("equipe e acessos no modelo de 4 papéis (e2e, armazenamento em memória)", () => {
  let app: NestExpressApplication;
  let store: InMemoryStore;
  let email: CapturingEmailPort;
  const pessoas: Record<string, StoredUser> = {};

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET = SESSION_SECRET;
    store = new InMemoryStore();
    email = new CapturingEmailPort();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(new InMemoryAuthRepository(store))
      .overrideProvider(SessionLookupRepository)
      .useValue(new InMemorySessionLookup(store))
      .overrideProvider(EmailPort)
      .useValue(email)
      .overrideProvider(AuditPort)
      .useValue(new NoopAuditRepository())
      .overrideProvider(SessionCache)
      .useValue(new NullSessionCache())
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    await app.listen(0);
  });

  beforeEach(async () => {
    store.clear();
    email.sent.length = 0;
    const criar = async (chave: string, acesso: Acesso) => {
      pessoas[chave] = await store.addUser({
        email: `${chave}@plugga.local`,
        name: chave,
        password: SENHA,
        acesso,
      });
    };
    await criar("desenvolvedor", DESENVOLVEDOR);
    await criar("admin", ADMIN);
    await criar("gerente", GERENTE_SUPRIMENTOS);
    await criar("comprador", MEMBRO_SUPRIMENTOS);
    await criar("vendedor", MEMBRO_CRM);
    await criar("duplo", MEMBRO_SUPRIMENTOS_E_CRM);
  });

  afterAll(async () => {
    await app.close();
  });

  let ip = 0;
  async function como(chave: string) {
    ip += 1;
    const agente = request.agent(app.getHttpServer()).set("Origin", "http://localhost:3000");
    await agente
      .post("/auth/login")
      .set("X-Forwarded-For", `10.97.0.${ip}`)
      .send({ email: `${chave}@plugga.local`, password: SENHA })
      .expect(200);
    return agente;
  }

  const nomes = (lista: ListaDaEquipe) => lista.membros.map((membro) => membro.name).sort();
  const membroDe = (lista: ListaDaEquipe, nome: string) =>
    lista.membros.find((membro) => membro.name === nome) as MembroDaEquipe;

  it("/auth/me entrega o acesso novo", async () => {
    const agente = await como("gerente");
    const resposta = await agente.get("/auth/me").expect(200);
    expect(resposta.body.acesso).toEqual(GERENTE_SUPRIMENTOS);
  });

  describe("desenvolvedor", () => {
    it("vê todo mundo e pode dar qualquer papel", async () => {
      const agente = await como("desenvolvedor");
      const lista = (await agente.get("/equipe").expect(200)).body as ListaDaEquipe;
      expect(nomes(lista)).toEqual(["admin", "comprador", "desenvolvedor", "duplo", "gerente", "vendedor"]);
      expect(lista.escopo).toEqual({
        papel: "desenvolvedor",
        podeConvidar: true,
        papeisConcediveis: ["desenvolvedor", "admin", "gerente", "membro"],
        departamentos: ["crm", "energia-opm", "produto-tecnologia", "financeiro", "suprimentos", "engenharia-obras", "marketing"],
      });
      expect(membroDe(lista, "admin").podeEditar).toBe(true);
      expect(membroDe(lista, "desenvolvedor").podeEditar).toBe(false);
    });

    it("promove alguém a desenvolvedor", async () => {
      const agente = await como("desenvolvedor");
      const resposta = await agente
        .put(`/equipe/${pessoas.admin!.id}/acesso`)
        .send({ acesso: DESENVOLVEDOR })
        .expect(200);
      expect(resposta.body.acesso).toEqual(DESENVOLVEDOR);
    });
  });

  describe("admin", () => {
    it("vê todo mundo menos desenvolvedores, e não dá o papel de desenvolvedor", async () => {
      const agente = await como("admin");
      const lista = (await agente.get("/equipe").expect(200)).body as ListaDaEquipe;
      expect(nomes(lista)).toEqual(["admin", "comprador", "duplo", "gerente", "vendedor"]);
      expect(lista.escopo.papeisConcediveis).toEqual(["admin", "gerente", "membro"]);

      await agente
        .post("/equipe/convites")
        .send({ email: "nova@plugga.local", name: "Nova", acesso: DESENVOLVEDOR })
        .expect(403);
    });

    it("não edita nem desativa desenvolvedor: para o admin ele não existe", async () => {
      const agente = await como("admin");
      await agente.put(`/equipe/${pessoas.desenvolvedor!.id}/acesso`).send({ acesso: MEMBRO_CRM }).expect(404);
      await agente.post(`/equipe/${pessoas.desenvolvedor!.id}/desativar`).send({}).expect(404);
    });

    it("convida gerente em qualquer departamento e o convite sai por e-mail", async () => {
      const agente = await como("admin");
      const acesso: Acesso = { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente" }] };
      const resposta = await agente
        .post("/equipe/convites")
        .send({ email: "diretora@plugga.local", name: "Diretora Financeira", acesso })
        .expect(201);
      expect(resposta.body).toMatchObject({ status: "invited", acesso, podeReenviarConvite: true });
      expect(email.sent.map((enviado) => enviado.to)).toContain("diretora@plugga.local");
    });

    it("desativa membro, mas não a si mesmo", async () => {
      const agente = await como("admin");
      await agente.post(`/equipe/${pessoas.vendedor!.id}/desativar`).send({}).expect(200);
      await agente.post(`/equipe/${pessoas.admin!.id}/desativar`).send({}).expect(403);
    });
  });

  describe("gerente", () => {
    it("vê quem divide departamento com ele e só dá membro nos departamentos que gere", async () => {
      const agente = await como("gerente");
      const lista = (await agente.get("/equipe").expect(200)).body as ListaDaEquipe;
      expect(nomes(lista)).toEqual(["comprador", "duplo", "gerente"]);
      expect(lista.escopo).toEqual({
        papel: "gerente",
        podeConvidar: true,
        papeisConcediveis: ["membro"],
        departamentos: ["suprimentos"],
      });
      // Quem também está em outro departamento aparece, mas não é editável.
      expect(membroDe(lista, "comprador")).toMatchObject({ podeEditar: true, podeDesativar: false });
      expect(membroDe(lista, "duplo").podeEditar).toBe(false);
    });

    it("convida membro no próprio departamento e é recusado fora dele ou para cima", async () => {
      const agente = await como("gerente");
      await agente
        .post("/equipe/convites")
        .send({ email: "novo@plugga.local", name: "Novo", acesso: MEMBRO_SUPRIMENTOS })
        .expect(201);
      await agente
        .post("/equipe/convites")
        .send({ email: "fora@plugga.local", name: "Fora", acesso: MEMBRO_CRM })
        .expect(403);
      await agente
        .post("/equipe/convites")
        .send({ email: "outro.gerente@plugga.local", name: "Outro gerente", acesso: GERENTE_SUPRIMENTOS })
        .expect(403);
      await agente
        .post("/equipe/convites")
        .send({ email: "admin2@plugga.local", name: "Admin", acesso: ADMIN })
        .expect(403);
    });

    it("não edita a si mesmo, nem quem é de outro departamento, nem desativa ninguém", async () => {
      const agente = await como("gerente");
      await agente.put(`/equipe/${pessoas.gerente!.id}/acesso`).send({ acesso: MEMBRO_SUPRIMENTOS }).expect(403);
      await agente.put(`/equipe/${pessoas.duplo!.id}/acesso`).send({ acesso: MEMBRO_SUPRIMENTOS }).expect(403);
      await agente.put(`/equipe/${pessoas.vendedor!.id}/acesso`).send({ acesso: MEMBRO_SUPRIMENTOS }).expect(404);
      await agente.post(`/equipe/${pessoas.comprador!.id}/desativar`).send({}).expect(403);
    });
  });

  describe("membro", () => {
    it("não gere equipe", async () => {
      const agente = await como("comprador");
      await agente.get("/equipe").expect(403);
      await agente
        .post("/equipe/convites")
        .send({ email: "x@plugga.local", name: "X", acesso: MEMBRO_SUPRIMENTOS })
        .expect(403);
    });
  });

  it("acesso concedido vazio é recusado na validação", async () => {
    const agente = await como("admin");
    await agente
      .post("/equipe/convites")
      .send({ email: "vazio@plugga.local", name: "Vazio", acesso: { plataforma: null, departamentos: [] } })
      .expect(400);
  });

  it("o desenvolvedor conta como admin: rebaixar o único admin não deixa a plataforma sem admin", async () => {
    store.clear();
    await store.addUser({ email: "dev@plugga.local", name: "dev", password: SENHA, acesso: DESENVOLVEDOR });
    const unico = await store.addUser({ email: "admin@plugga.local", name: "admin", password: SENHA, acesso: ADMIN });
    const dev = await como("dev");
    // Ninguém edita o próprio acesso, então quem rebaixa um admin é sempre outro
    // admin ou um desenvolvedor — que tem a linha `admin` e mantém a plataforma.
    await dev.put(`/equipe/${unico.id}/acesso`).send({ acesso: MEMBRO_CRM }).expect(200);
  });
});

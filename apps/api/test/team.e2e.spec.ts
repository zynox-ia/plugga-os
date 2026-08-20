import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { UserAccess } from "@plugga/shared";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { AuditRepository } from "../src/audit/audit.repository";
import { NullSessionCache } from "../src/core/auth/null-session-cache";
import { SessionCache } from "../src/core/auth/session-cache";
import { SessionLookupRepository } from "../src/core/auth/session-lookup.repository";
import { EmailPort } from "../src/email/email.port";
import { AuthRepository } from "../src/auth/auth.repository";
import {
  access,
  CapturingEmailPort,
  InMemoryAuthRepository,
  InMemorySessionLookup,
  InMemoryStore,
  NoopAuditRepository,
  type StoredUser,
} from "./support/in-memory-auth";

const SESSION_SECRET = "test_only_session_secret_change_me_please";

const ADMIN_PASSWORD = "correct horse battery staple";
const MANAGER_PASSWORD = "manager password for tests";
const MEMBER_PASSWORD = "member password for tests";

/** Acesso "só Plugga, só financeiro" — o caso de aceite do briefing. */
const soPluggaFinanceiro: UserAccess = {
  platformRoles: [],
  companies: [
    {
      companyId: "plugga",
      roles: ["financeiro"],
      departments: [{ departmentId: "financeiro", isManager: false }],
    },
  ],
};

/** Gestor do departamento de energia na Plugga. */
const gestorEnergia: UserAccess = {
  platformRoles: [],
  companies: [
    {
      companyId: "plugga",
      roles: ["opm"],
      departments: [{ departmentId: "energia-opm", isManager: true }],
    },
  ],
};

describe("team API — access by company and department (e2e, in-memory stores)", () => {
  let app: NestExpressApplication;
  let store: InMemoryStore;
  let email: CapturingEmailPort;
  let admin: StoredUser;
  let gestor: StoredUser;
  let membro: StoredUser;

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
      .overrideProvider(AuditRepository)
      .useValue(new NoopAuditRepository())
      // Testes com store em memória não têm Redis de verdade para cachear; sem
      // este override o SessionService.issue()/revokeAllForUser() de todo
      // login e desativação real bateria na rede à toa.
      .overrideProvider(SessionCache)
      .useValue(new NullSessionCache())
      .compile();

    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    // Sobe o servidor uma vez e o mantém no ar. Sem isto cada `request.agent()`
    // abre e fecha uma porta efêmera própria; um agente que sobrevive ao
    // fechamento do anterior acaba batendo numa porta já reciclada por outro
    // processo da máquina, e o teste falha com a resposta de um estranho.
    await app.listen(0);
  });

  beforeEach(async () => {
    store.clear();
    email.sent.length = 0;

    admin = await store.addUser({
      email: "admin@plugga.local",
      name: "Administração Local",
      password: ADMIN_PASSWORD,
      access: access({ platformRoles: ["admin"] }),
    });
    gestor = await store.addUser({
      email: "gestor.energia@plugga.local",
      name: "Gestor de Energia",
      password: MANAGER_PASSWORD,
      access: gestorEnergia,
    });
    membro = await store.addUser({
      email: "financeiro@plugga.local",
      name: "Financeiro Plugga",
      password: MEMBER_PASSWORD,
      access: soPluggaFinanceiro,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // Cada login precisa do seu IP sintético: sem ele a suíte inteira divide o
  // mesmo balde de 10 req/60s do /auth/login e passa a 429 a si mesma.
  let testIpCounter = 0;
  async function loginAgent(userEmail: string, password: string) {
    testIpCounter += 1;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/auth/login")
      .set("X-Forwarded-For", `10.98.0.${testIpCounter}`)
      .send({ email: userEmail, password })
      .expect(200);
    return agent;
  }

  describe("/auth/me carrega o acesso, não só os papéis", () => {
    it("entrega empresas, departamentos e papéis por empresa", async () => {
      const agent = await loginAgent(membro.email, MEMBER_PASSWORD);
      const me = await agent.get("/auth/me").expect(200);

      expect(me.body.roles).toEqual(["financeiro"]);
      expect(me.body.access).toEqual(soPluggaFinanceiro);
    });

    it("marca o gestor no departamento que ele gestiona", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);
      const me = await agent.get("/auth/me").expect(200);

      expect(me.body.access.companies[0].departments).toEqual([
        { departmentId: "energia-opm", isManager: true },
      ]);
    });
  });

  describe("admin de plataforma", () => {
    it("convida alguém só para a Plugga/financeiro e a pessoa entra com esse alcance", async () => {
      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);

      const convidado = await agent
        .post("/auth/invite")
        .send({
          email: "nova.financeiro@plugga.local",
          name: "Nova Financeiro",
          access: soPluggaFinanceiro,
        })
        .expect(201);

      expect(convidado.body).toMatchObject({ status: "invited", roles: ["financeiro"] });
      expect(convidado.body.access).toEqual(soPluggaFinanceiro);

      const token = email.lastTokenFor("invite");
      await request(app.getHttpServer())
        .post("/auth/accept-invite")
        .send({ token, password: "a brand new password" })
        .expect(200, { ok: true });

      const nova = await loginAgent("nova.financeiro@plugga.local", "a brand new password");
      const me = await nova.get("/auth/me").expect(200);
      expect(me.body.access.companies.map((c: { companyId: string }) => c.companyId)).toEqual([
        "plugga",
      ]);
      expect(
        me.body.access.companies[0].departments.map(
          (d: { departmentId: string }) => d.departmentId,
        ),
      ).toEqual(["financeiro"]);
    });

    it("concede também a Waze/engenharia e a pessoa passa a alcançar as duas", async () => {
      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);

      const atualizado = await agent
        .put(`/auth/users/${membro.id}/access`)
        .send({
          access: {
            platformRoles: [],
            companies: [
              ...soPluggaFinanceiro.companies,
              {
                companyId: "waze",
                roles: ["viewer"],
                departments: [{ departmentId: "engenharia-obras", isManager: false }],
              },
            ],
          },
        })
        .expect(200);

      expect(
        atualizado.body.access.companies.map((c: { companyId: string }) => c.companyId),
      ).toEqual(["plugga", "waze"]);

      const dele = await loginAgent(membro.email, MEMBER_PASSWORD);
      const me = await dele.get("/auth/me").expect(200);
      expect(me.body.roles).toEqual(["financeiro", "viewer"]);
    });

    it("recusa departamento que não é da empresa concedida", async () => {
      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);

      await agent
        .put(`/auth/users/${membro.id}/access`)
        .send({
          access: {
            platformRoles: [],
            companies: [
              {
                companyId: "waze",
                roles: ["viewer"],
                // `energia-opm` é da Plugga; na Waze não existe.
                departments: [{ departmentId: "energia-opm", isManager: false }],
              },
            ],
          },
        })
        .expect(400);
    });

    it("desativa um membro e derruba a sessão dele na hora", async () => {
      const dele = await loginAgent(membro.email, MEMBER_PASSWORD);
      await dele.get("/auth/me").expect(200);

      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);
      await agent.post(`/auth/users/${membro.id}/deactivate`).expect(200, { ok: true });

      await dele.get("/auth/me").expect(401);
    });

    it("não deixa o último admin ativo perder o próprio papel de plataforma", async () => {
      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);

      await agent
        .put(`/auth/users/${admin.id}/access`)
        .send({ access: soPluggaFinanceiro })
        .expect(403);
    });

    it("não deixa um admin desativar a si mesmo", async () => {
      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);
      await agent.post(`/auth/users/${admin.id}/deactivate`).expect(403);
    });
  });

  describe("gestor de departamento", () => {
    it("convida dentro do próprio escopo", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);

      const convidado = await agent
        .post("/auth/invite")
        .send({
          email: "novo.opm@plugga.local",
          name: "Novo OPM",
          access: {
            platformRoles: [],
            companies: [
              {
                companyId: "plugga",
                roles: ["opm"],
                departments: [{ departmentId: "energia-opm", isManager: false }],
              },
            ],
          },
        })
        .expect(201);

      expect(convidado.body).toMatchObject({ status: "invited", roles: ["opm"] });
    });

    it("não concede uma empresa que não gestiona", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);

      await agent
        .post("/auth/invite")
        .send({
          email: "fora.de.escopo@plugga.local",
          name: "Fora de Escopo",
          access: {
            platformRoles: [],
            companies: [
              {
                companyId: "waze",
                roles: ["viewer"],
                departments: [{ departmentId: "engenharia-obras", isManager: false }],
              },
            ],
          },
        })
        .expect(403);
    });

    it("não concede um departamento da própria empresa que não gestiona", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);

      await agent
        .post("/auth/invite")
        .send({
          email: "outro.departamento@plugga.local",
          name: "Outro Departamento",
          access: soPluggaFinanceiro,
        })
        .expect(403);
    });

    it("não concede papel que ele próprio não tem", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);

      await agent
        .post("/auth/invite")
        .send({
          email: "escalada@plugga.local",
          name: "Tentativa de Escalada",
          access: {
            platformRoles: [],
            companies: [
              {
                companyId: "plugga",
                // O gestor é `opm`; conceder `tech` seria escalar privilégio.
                roles: ["tech"],
                departments: [{ departmentId: "energia-opm", isManager: false }],
              },
            ],
          },
        })
        .expect(403);
    });

    it("não promove ninguém a admin de plataforma", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);

      await agent
        .post("/auth/invite")
        .send({
          email: "admin.pirata@plugga.local",
          name: "Admin Pirata",
          access: { platformRoles: ["admin"], companies: [] },
        })
        .expect(403);
    });

    it("não edita quem está fora do escopo dele", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);

      await agent
        .put(`/auth/users/${membro.id}/access`)
        .send({
          access: {
            platformRoles: [],
            companies: [
              {
                companyId: "plugga",
                roles: ["opm"],
                departments: [{ departmentId: "energia-opm", isManager: false }],
              },
            ],
          },
        })
        .expect(403);
    });

    it("não desativa ninguém — desativar é da plataforma", async () => {
      const noEscopo = await store.addUser({
        email: "opm.membro@plugga.local",
        name: "Membro OPM",
        access: access({
          companies: [
            {
              companyId: "plugga",
              roles: ["opm"],
              departments: [{ departmentId: "energia-opm", isManager: false }],
            },
          ],
        }),
      });

      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);
      await agent.post(`/auth/users/${noEscopo.id}/deactivate`).expect(403);
    });

    it("vê só quem está no escopo dele, mais ele mesmo", async () => {
      const noEscopo = await store.addUser({
        email: "opm.membro@plugga.local",
        name: "Membro OPM",
        access: access({
          companies: [
            {
              companyId: "plugga",
              roles: ["opm"],
              departments: [{ departmentId: "energia-opm", isManager: false }],
            },
          ],
        }),
      });

      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);
      const lista = await agent.get("/auth/users").expect(200);

      const ids = lista.body.members.map((member: { id: string }) => member.id);
      expect(ids).toContain(noEscopo.id);
      expect(ids).toContain(gestor.id);
      expect(ids).not.toContain(membro.id);
      expect(ids).not.toContain(admin.id);
    });

    it("recebe um escopo que descreve exatamente o que pode conceder", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);
      const lista = await agent.get("/auth/users").expect(200);

      expect(lista.body.scope).toEqual({
        isPlatformAdmin: false,
        canInvite: true,
        companies: [
          {
            companyId: "plugga",
            departmentIds: ["energia-opm"],
            roles: ["opm", "viewer"],
            canGrantManager: true,
          },
        ],
      });
    });

    it("não edita o próprio acesso", async () => {
      const agent = await loginAgent(gestor.email, MANAGER_PASSWORD);

      await agent
        .put(`/auth/users/${gestor.id}/access`)
        .send({ access: gestorEnergia })
        .expect(403);
    });
  });

  describe("filtros da lista", () => {
    it("filtra por empresa e departamento no mesmo vínculo", async () => {
      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);

      const plugga = await agent.get("/auth/users?companyId=plugga").expect(200);
      expect(plugga.body.members.map((m: { id: string }) => m.id)).toEqual([gestor.id, membro.id]);

      const financeiro = await agent
        .get("/auth/users?companyId=plugga&departmentId=financeiro")
        .expect(200);
      expect(financeiro.body.members.map((m: { id: string }) => m.id)).toEqual([membro.id]);
    });

    it("recusa um filtro que não existe no catálogo", async () => {
      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);
      await agent.get("/auth/users?companyId=inexistente").expect(400);
    });
  });

  describe("reenvio de convite", () => {
    it("reenvia enquanto o convite está pendente e recusa depois de aceito", async () => {
      const agent = await loginAgent(admin.email, ADMIN_PASSWORD);
      const convidado = await agent
        .post("/auth/invite")
        .send({
          email: "pendente@plugga.local",
          name: "Pendente",
          access: soPluggaFinanceiro,
        })
        .expect(201);

      await agent.post(`/auth/users/${convidado.body.id}/resend-invite`).expect(200, { ok: true });
      expect(email.sent.filter((entry) => entry.template === "invite")).toHaveLength(2);

      const token = email.lastTokenFor("invite");
      await request(app.getHttpServer())
        .post("/auth/accept-invite")
        .send({ token, password: "a brand new password" })
        .expect(200, { ok: true });

      // Já ativo: reenviar aqui seria redefinição de senha por caminho lateral.
      await agent.post(`/auth/users/${convidado.body.id}/resend-invite`).expect(400);
    });
  });
});

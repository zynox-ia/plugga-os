import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";

import {
  IntegrationsRepository,
  type StoredIntegrationSummary,
} from "../src/integrations/integrations.repository";
import {
  JobsRepository,
  type StoredJobRunInventoryItem,
} from "../src/jobs/jobs.repository";

class InMemoryIntegrationsRepository extends IntegrationsRepository {
  async findAll(): Promise<StoredIntegrationSummary[]> {
    return [
      {
        id: "00000000-0000-4000-8000-000000000303",
        key: "whatsapp",
        name: "WhatsApp",
        mode: "mock",
        status: "unknown",
        lastSyncAt: null,
        lastError: null,
        owner: "Operações",
        updatedAt: new Date("2026-08-06T15:00:00.000Z"),
      },
    ];
  }
}

class InMemoryJobsRepository extends JobsRepository {
  async findRuns(): Promise<StoredJobRunInventoryItem[]> {
    return [
      {
        id: "00000000-0000-4000-8000-000000000304",
        jobKey: "inventory.whatsapp-health",
        integration: { key: "whatsapp" },
        scheduledFor: new Date("2026-08-06T12:10:00.000Z"),
        startedAt: null,
        finishedAt: null,
        status: "skipped",
        attempt: 1,
        durationMs: null,
        error: null,
        triggeredBy: "seed:inventory-only",
        logRef: "mock://job-runs/inventory-whatsapp-health",
        createdAt: new Date("2026-08-06T15:00:00.000Z"),
      },
    ];
  }
}

describe("read-only inventory API (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.EMAIL_PROVIDER = "mailpit";
    delete process.env.BREVO_API_KEY;

    /**
     * `AppModule` é importado aqui, e não no topo, porque
     * `ConfigModule.forRoot()` roda na avaliação do decorador `@Module` — ou
     * seja, no import. Com import estático, o ambiente é fotografado antes das
     * duas linhas acima, e elas viram enfeite.
     *
     * O efeito só aparece fora da máquina de quem desenvolve: aqui o `.env` da
     * raiz fornece `EMAIL_PROVIDER=mailpit` no instante do import e o teste
     * passa por acidente; na CI não existe `.env`, o snapshot sai `noop` e o
     * teste falha sem que nada no código tenha mudado.
     */
    const { AppModule } = await import("../src/app.module");

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IntegrationsRepository)
      .useClass(InMemoryIntegrationsRepository)
      .overrideProvider(JobsRepository)
      .useClass(InMemoryJobsRepository)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication for integration metadata", async () => {
    await request(app.getHttpServer()).get("/integrations").expect(401);
  });

  it("refuses integration metadata to roles outside the integrations screen", async () => {
    await request(app.getHttpServer())
      .get("/integrations")
      .set("x-dev-principal", "local-viewer")
      .set("x-dev-roles", "viewer")
      .expect(403);
  });

  it("lists integration metadata without credential fields", async () => {
    await request(app.getHttpServer())
      .get("/integrations")
      .set("x-dev-principal", "local-tech")
      .set("x-dev-roles", "tech")
      .expect(200, {
        items: [
          {
            id: "00000000-0000-4000-8000-000000000303",
            key: "whatsapp",
            name: "WhatsApp",
            mode: "mock",
            status: "unknown",
            lastSyncAt: null,
            lastError: null,
            owner: "Operações",
            updatedAt: "2026-08-06T15:00:00.000Z",
          },
        ],
      });
  });

  it("requires authentication for email provider status", async () => {
    await request(app.getHttpServer()).get("/email/status").expect(401);
  });

  it("reports the configured email provider without any address or key", async () => {
    await request(app.getHttpServer())
      .get("/email/status")
      .set("x-dev-principal", "local-viewer")
      .set("x-dev-roles", "viewer")
      .expect(200, { provider: "mailpit", configured: true });
  });

  it("refuses the job-run inventory to roles outside the jobs screen", async () => {
    // O histórico operacional carrega mensagens de erro de integração; os
    // papéis são os mesmos que a navegação da web dá à tela de Jobs.
    await request(app.getHttpServer())
      .get("/jobs")
      .set("x-dev-principal", "local-viewer")
      .set("x-dev-roles", "viewer")
      .expect(403);
  });

  it("lists job runs as an inventory with no mutation controls", async () => {
    await request(app.getHttpServer())
      .get("/jobs")
      .set("x-dev-principal", "local-tech")
      .set("x-dev-roles", "tech")
      .expect(200, {
        inventoryOnly: true,
        items: [
          {
            id: "00000000-0000-4000-8000-000000000304",
            jobKey: "inventory.whatsapp-health",
            integrationKey: "whatsapp",
            scheduledFor: "2026-08-06T12:10:00.000Z",
            startedAt: null,
            finishedAt: null,
            status: "skipped",
            attempt: 1,
            durationMs: null,
            error: null,
            triggeredBy: "seed:inventory-only",
            logRef: "mock://job-runs/inventory-whatsapp-health",
            createdAt: "2026-08-06T15:00:00.000Z",
          },
        ],
      });
  });
});

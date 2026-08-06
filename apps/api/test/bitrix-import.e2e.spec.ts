import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { IntegrationMode } from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import {
  BitrixRepository,
  type MirrorUpsertOutcome,
} from "../src/integrations/bitrix/bitrix.repository";
import {
  JobsQueue,
  type EnqueueOptions,
  type EnqueueResult,
} from "../src/jobs/queue/jobs-queue.port";

/** Mode is mutable so one app can exercise every gate branch. */
class ConfigurableBitrixRepository extends BitrixRepository {
  static mode: IntegrationMode | null = "mock";

  async getIntegrationMode(): Promise<IntegrationMode | null> {
    return ConfigurableBitrixRepository.mode;
  }

  async upsertMirrorRecord(): Promise<MirrorUpsertOutcome> {
    throw new Error("the HTTP trigger must never write the mirror directly");
  }
}

class RecordingJobsQueue extends JobsQueue {
  static calls: { jobKey: string; payload: unknown; options?: EnqueueOptions }[] = [];

  async enqueue<Payload>(
    jobKey: string,
    payload: Payload,
    options?: EnqueueOptions,
  ): Promise<EnqueueResult> {
    RecordingJobsQueue.calls.push({ jobKey, payload, options });
    return { jobId: "job-1", jobKey, deduped: false };
  }
}

const CREDENTIAL_ENV = {
  BITRIX_WEBHOOK_URL: "https://portal.example.com/rest/1/local-only-test-token",
  BITRIX_OPM_ENTITY_TYPE_ID: "1032",
} as const;

async function buildApp(credentialed: boolean): Promise<INestApplication> {
  if (credentialed) {
    Object.assign(process.env, CREDENTIAL_ENV);
  } else {
    delete process.env.BITRIX_WEBHOOK_URL;
    delete process.env.BITRIX_OPM_ENTITY_TYPE_ID;
  }

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BitrixRepository)
    .useClass(ConfigurableBitrixRepository)
    .overrideProvider(JobsQueue)
    .useClass(RecordingJobsQueue)
    .compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe("Bitrix read-only import trigger (e2e)", () => {
  describe("without a Bitrix credential", () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await buildApp(false);
    });

    afterAll(async () => {
      await app.close();
    });

    it("requires authentication", async () => {
      ConfigurableBitrixRepository.mode = "read_only";
      await request(app.getHttpServer()).post("/integrations/bitrix/import").expect(401);
    });

    it("refuses a non-admin principal", async () => {
      ConfigurableBitrixRepository.mode = "read_only";
      await request(app.getHttpServer())
        .post("/integrations/bitrix/import")
        .set("x-dev-principal", "local-viewer")
        .set("x-dev-roles", "viewer")
        .expect(403);
    });

    it("refuses to import while the integration is still in mock mode", async () => {
      ConfigurableBitrixRepository.mode = "mock";
      const response = await request(app.getHttpServer())
        .post("/integrations/bitrix/import")
        .set("x-dev-principal", "local-admin")
        .set("x-dev-roles", "admin")
        .expect(409);

      expect(response.body.message).toMatch(/read_only/);
      expect(RecordingJobsQueue.calls).toHaveLength(0);
    });

    it("refuses when the mode is right but no credential is configured", async () => {
      ConfigurableBitrixRepository.mode = "read_only";
      await request(app.getHttpServer())
        .post("/integrations/bitrix/import")
        .set("x-dev-principal", "local-admin")
        .set("x-dev-roles", "admin")
        .expect(503);

      expect(RecordingJobsQueue.calls).toHaveLength(0);
    });

    it("exposes no write route on the Bitrix surface", async () => {
      for (const path of [
        "/integrations/bitrix/export",
        "/integrations/bitrix/sync",
        "/integrations/bitrix/push",
      ]) {
        await request(app.getHttpServer())
          .post(path)
          .set("x-dev-principal", "local-admin")
          .set("x-dev-roles", "admin")
          .expect(404);
      }
    });
  });

  describe("with mode read_only and a credential present", () => {
    let app: INestApplication;

    beforeAll(async () => {
      RecordingJobsQueue.calls = [];
      app = await buildApp(true);
      ConfigurableBitrixRepository.mode = "read_only";
    });

    afterAll(async () => {
      await app.close();
      delete process.env.BITRIX_WEBHOOK_URL;
      delete process.env.BITRIX_OPM_ENTITY_TYPE_ID;
    });

    it("enqueues the OPM import and attributes it to the requesting admin", async () => {
      const response = await request(app.getHttpServer())
        .post("/integrations/bitrix/import")
        .set("x-dev-principal", "local-admin")
        .set("x-dev-roles", "admin")
        .expect(201);

      expect(response.body).toEqual({
        domain: "opm",
        jobKey: "bitrix.import.opm",
        jobId: "job-1",
        deduped: false,
      });
      expect(RecordingJobsQueue.calls).toHaveLength(1);
      expect(RecordingJobsQueue.calls[0]).toMatchObject({
        jobKey: "bitrix.import.opm",
        options: { triggeredBy: "user:local-admin" },
      });
    });

    it("never echoes the Bitrix credential in the response", async () => {
      const response = await request(app.getHttpServer())
        .post("/integrations/bitrix/import")
        .set("x-dev-principal", "local-admin")
        .set("x-dev-roles", "admin")
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain("local-only-test-token");
    });
  });
});

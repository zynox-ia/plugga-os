import type { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AcessoGuard } from "../core/auth/acesso.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { PipelinesController } from "./pipelines.controller";
import { PipelinesService } from "./pipelines.service";

const principal = { id: "00000000-0000-4000-8000-000000000001", kind: "user", acesso: { plataforma: null, departamentos: [] } };
const pipelineId = "00000000-0000-4000-8000-000000000100";
const list = vi.fn<PipelinesService["list"]>().mockResolvedValue({ pipelines: [], responsaveis: [], canCreateIn: [] });
let app: INestApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [PipelinesController],
    providers: [{ provide: PipelinesService, useValue: { list } }],
  })
    .overrideGuard(SessionAuthGuard).useValue({ canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest().authPrincipal = principal;
      return true;
    } })
    .overrideGuard(AcessoGuard).useValue({ canActivate: () => true })
    .overrideGuard(OriginCheckGuard).useValue({ canActivate: () => true })
    .overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true })
    .compile();
  app = module.createNestApplication();
  await app.init();
});
beforeEach(() => list.mockClear());
afterAll(async () => app?.close());

describe("GET /pipelines: filtro opcional para revalidação", () => {
  it("encaminha o UUID validado e a identidade para o serviço", async () => {
    await request(app.getHttpServer()).get("/pipelines").query({ pipelineId }).expect(200);
    expect(list).toHaveBeenCalledExactlyOnceWith(principal, { pipelineId });
  });

  it("preserva a listagem completa quando não há filtro", async () => {
    await request(app.getHttpServer()).get("/pipelines").expect(200);
    expect(list).toHaveBeenCalledExactlyOnceWith(principal, {});
  });

  it.each([
    { pipelineId: "inválido" },
    { pipelineId: "" },
    { pipelineId: [pipelineId, pipelineId] },
    { companyId: "plugga" },
  ])("rejeita query inválida antes de consultar o serviço: %j", async (query) => {
    await request(app.getHttpServer()).get("/pipelines").query(query).expect(400);
    expect(list).not.toHaveBeenCalled();
  });
});

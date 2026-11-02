import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { NegociosRepository } from "../src/negocios/negocios.repository";

describe("prioridade do negócio (e2e)", () => {
  let app: INestApplication;
  const setPriority = vi.fn(async (_id, input) => input);
  const id = "00000000-0000-4000-8000-000000000001";
  const comercial = (r: request.Test) => r.set("x-dev-principal", "local-comercial").set("x-dev-departamentos", "crm:membro");

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NegociosRepository).useValue({ setPriority }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it("exige sessão e valida os valores antes de delegar", async () => {
    await request(app.getHttpServer()).patch(`/negocios/${id}/prioridade`).send({ priority: "normal" }).expect(401);
    await comercial(request(app.getHttpServer()).patch(`/negocios/${id}/prioridade`)).send({ priority: "alta" }).expect(400);
    await comercial(request(app.getHttpServer()).patch(`/negocios/${id}/prioridade`)).send({ priority: null }).expect(200, { priority: null });
    expect(setPriority).toHaveBeenCalledOnce();
  });
});

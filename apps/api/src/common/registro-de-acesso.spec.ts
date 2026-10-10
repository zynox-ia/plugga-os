import { EventEmitter } from "node:events";

import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requestIdMiddleware } from "./request-id.middleware";

describe("registro de acesso", () => {
  afterEach(() => vi.restoreAllMocks());

  it("grava método, rota sem query, status e duração, sem corpo nem cookies", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const res = Object.assign(new EventEmitter(), { statusCode: 201, setHeader: vi.fn() });
    const req = {
      method: "POST",
      originalUrl: "/clientes?token=segredo&cpf=123",
      headers: { cookie: "plugga_session=abc" },
      body: { email: "a@b.com" },
    };

    requestIdMiddleware(req as never, res as never, () => undefined);
    res.emit("finish");

    const linha = String(log.mock.calls[0]?.[0]);
    expect(linha).toMatch(/^POST \/clientes 201 \d+ms$/);
    expect(linha).not.toMatch(/segredo|cpf|plugga_session|a@b\.com/);
  });
});

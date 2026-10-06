import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { contextoDaRequisicao } from "../common/contexto-requisicao";
import { JsonLogger } from "./json-logger.service";

function registro(chamar: (l: JsonLogger) => void, nivel: "stdout" | "stderr" = "stdout") {
  const escrita = vi.spyOn(process[nivel], "write").mockImplementation(() => true);
  chamar(new JsonLogger(new ConfigService({ LOG_LEVEL: "debug" })));
  const linha = String(escrita.mock.calls[0]?.[0]);
  return JSON.parse(linha) as Record<string, unknown>;
}

describe("JsonLogger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("preserva a pilha e os demais parâmetros e separa o contexto", () => {
    const r = registro((l) => l.error("falhou", "Error: x\n    at a.ts:1", { id: 7 }, "MeuServico"), "stderr");
    expect(r.context).toBe("MeuServico");
    expect(r.detalhes).toEqual(["Error: x\n    at a.ts:1", { id: 7 }]);
  });

  it("mantém a pilha de um Error", () => {
    const r = registro((l) => l.error(new Error("boom")), "stderr");
    expect((r.message as { stack?: string }).stack).toContain("boom");
  });

  it("inclui o requestId da requisição em andamento", () => {
    const r = registro((l) => contextoDaRequisicao.run({ requestId: "REQ1" }, () => l.log("ok", "Ctx")));
    expect(r.requestId).toBe("REQ1");
    expect(r.detalhes).toBeUndefined();
  });
});

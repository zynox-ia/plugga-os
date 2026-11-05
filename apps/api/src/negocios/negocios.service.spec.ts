import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../core/auth/auth.types";
import type { NegociosRepository } from "./negocios.repository";
import { NegociosService } from "./negocios.service";

describe("NegociosService", () => {
  it("encaminha a alteração de prioridade e a identidade ao repositório", async () => {
    const setPriority = vi.fn().mockResolvedValue({ priority: null });
    const service = new NegociosService({ setPriority } as unknown as NegociosRepository);
    const principal: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000001", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
    await expect(service.setPriority("negocio", { priority: null }, principal)).resolves.toEqual({ priority: null });
    expect(setPriority).toHaveBeenCalledWith("negocio", { priority: null }, principal);
  });
});

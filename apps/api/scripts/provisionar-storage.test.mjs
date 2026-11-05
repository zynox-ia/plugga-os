import { describe, expect, it, vi } from "vitest";
import { provisionarBaldes } from "./provisionar-storage.mjs";

describe("provisionamento de armazenamento", () => {
  it("cria cada balde uma vez e aceita balde ja existente", async () => {
    const enviar = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error(), { name: "BucketAlreadyOwnedByYou" }));
    await provisionarBaldes(enviar, ["plugga-arquivos", "legado", "plugga-arquivos"]);
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls.map(([comando]) => comando.input.Bucket)).toEqual(["plugga-arquivos", "legado"]);
  });
  it("propaga falhas de permissao ou conflito de propriedade", async () => {
    for (const name of ["AccessDenied", "BucketAlreadyExists"]) {
      await expect(provisionarBaldes(() => Promise.reject(Object.assign(new Error(), { name })), ["plugga-arquivos"])).rejects.toMatchObject({ name });
    }
  });
  it("rejeita lista vazia e nomes vazios", async () => {
    await expect(provisionarBaldes(vi.fn(), [])).rejects.toThrow();
    await expect(provisionarBaldes(vi.fn(), [""])).rejects.toThrow();
  });
});

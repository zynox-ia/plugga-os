import { afterEach, describe, expect, it, vi } from "vitest";
import type { PipelineField } from "@plugga/shared";

import { PrismaService } from "../prisma/prisma.service";
import { contarValores, removerValores } from "./custom-fields.persistence";

const field: PipelineField = { id: "00000000-0000-4000-8000-000000000001", name: "Texto", type: "text", options: [], showOnCard: true, showInList: true, position: 0, valueCount: 0 };
afterEach(() => vi.restoreAllMocks());
describe("persistência dos campos na configuração", () => {
  it("conta todos os campos em uma consulta, com false/zero e opções agregadas", async () => {
    const prisma = new PrismaService();
    const query = vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ id: field.id, value: null, count: 3 }]);
    expect(await contarValores(prisma, [field])).toEqual({ [field.id]: { count: 3, options: {} } });
    expect(query).toHaveBeenCalledOnce();
    await contarValores(prisma, []);
    expect(query).toHaveBeenCalledOnce();
  });
  it("remoção de campo e etapa no mesmo formulário usa um único update por negócio", async () => {
    const prisma = new PrismaService();
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ id: "negócio", custom_fields: { [field.id]: "privado" }, stage_id: "origem", status: "open" }]);
    const stop = new Error("parada antes da escrita");
    const write = vi.spyOn(prisma.deal, "update").mockRejectedValue(stop);
    await expect(removerValores(prisma, [field], "ator", [{ fromId: "origem", fromName: "Origem", toId: "destino", toName: "Destino" }])).rejects.toBe(stop);
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customFields: {}, stageId: "destino", stageEnteredAt: expect.any(Date) }) }));
  });
});

import { describe, expect, it, vi } from "vitest";

import { JobsQueue } from "./jobs-queue.port";
import { JOBS_EXTINTOS, LimpezaDeJobsExtintos } from "./limpeza-de-jobs-extintos";

class FilaFalsa extends JobsQueue {
  enqueue = vi.fn();
  override removerAgendamento = vi.fn(async (id: string) => ({ removido: id === "omie-despacho" }));
  override descartarPendentes = vi.fn(async () => ({ descartados: 2 }));
}

describe("limpeza dos jobs de integrações extintas (o OMIE, 24/11/2026)", () => {
  it("tira o agendamento do despacho e descarta os jobs omie.* que ainda não começaram", async () => {
    const fila = new FilaFalsa();
    expect(await new LimpezaDeJobsExtintos(fila).limpar()).toEqual({ agendamentosRemovidos: 1, descartados: 2 });
    expect(fila.removerAgendamento).toHaveBeenCalledWith("omie-despacho");
    expect(fila.descartarPendentes).toHaveBeenCalledWith(["omie.despachar", "omie.enviar"]);
    expect(JOBS_EXTINTOS.jobKeys.every((k) => k.startsWith("omie."))).toBe(true);
  });

  it("sem a fila (JOBS_ENABLED desligado), não há o que limpar e nada quebra", async () => {
    class SemFila extends JobsQueue { enqueue = vi.fn(); }
    expect(await new LimpezaDeJobsExtintos(new SemFila()).limpar()).toEqual({ agendamentosRemovidos: 0, descartados: 0 });
  });

  it("no boot, uma falha do Redis fica no log e não segura a subida", async () => {
    const fila = new FilaFalsa();
    fila.removerAgendamento.mockRejectedValueOnce(new Error("redis fora"));
    const limpeza = new LimpezaDeJobsExtintos(fila);
    const aviso = vi.spyOn((limpeza as unknown as { logger: { warn: (m: string) => void } }).logger, "warn").mockImplementation(() => undefined);
    expect(() => limpeza.onApplicationBootstrap()).not.toThrow();
    await vi.waitFor(() => expect(aviso).toHaveBeenCalledWith(expect.stringMatching(/redis fora/)));
  });
});

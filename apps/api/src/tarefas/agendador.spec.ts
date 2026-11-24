import { describe, expect, it, vi } from "vitest";

import { DisabledJobsQueue } from "../jobs/queue/disabled-jobs-queue";
import { cronDiario } from "../jobs/queue/jobs-queue.port";
import { AGENDAMENTO_DA_GERACAO, GERAR_OCORRENCIAS_JOB_KEY, GerarOcorrenciasDoDiaHandler } from "./gerar-ocorrencias-do-dia.handler";
import { TarefasModule } from "./tarefas.module";

describe("agendador das tarefas", () => {
  it("o horário vira a expressão cron diária", () => {
    expect(cronDiario("08:00")).toBe("0 8 * * *");
    expect(cronDiario("23:59")).toBe("59 23 * * *");
    expect(() => cronDiario("24:00")).toThrow();
  });

  it("sem a fila (JOBS_ENABLED desligado), não há o que agendar e nada quebra", async () => {
    expect(await new DisabledJobsQueue().agendarDiario(GERAR_OCORRENCIAS_JOB_KEY, {}, AGENDAMENTO_DA_GERACAO)).toEqual({ agendado: false });
  });

  it("ao subir, registra o handler e agenda a geração das 08:00 de Manaus, sem segurar a subida se a fila falhar", async () => {
    const registry = { register: vi.fn() };
    const fila = { agendarDiario: vi.fn().mockRejectedValue(new Error("redis fora")) };
    const handler = { jobKey: GERAR_OCORRENCIAS_JOB_KEY } as unknown as GerarOcorrenciasDoDiaHandler;
    const modulo = new TarefasModule(registry as never, fila as never, handler);
    expect(() => modulo.onModuleInit()).not.toThrow();
    expect(registry.register).toHaveBeenCalledWith(handler);
    expect(fila.agendarDiario).toHaveBeenCalledWith("tarefas.gerar_ocorrencias_do_dia", {}, { id: "tarefas-geracao-diaria", horario: "08:00", fuso: "America/Manaus" });
    await new Promise((resolve) => setImmediate(resolve));
  });

  it("o handler gera até o fim da semana de hoje, numa transação", async () => {
    const tx = {
      tarefa: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      ocorrenciaDeTarefa: { createMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((fazer: (t: typeof tx) => unknown) => fazer(tx)) };
    // Quarta, 25/11/2026: a semana vai até domingo, 29/11.
    const handler = new GerarOcorrenciasDoDiaHandler(prisma as never, () => new Date("2026-11-25T14:00:00Z"));
    expect(await handler.process()).toEqual({ logRef: "os://tarefas/ocorrencias hoje=2026-11-25 ate=2026-11-29 criadas=0" });
    expect(tx.tarefa.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ encerradaEm: null }) }));
  });
});

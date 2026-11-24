import { describe, expect, it, vi } from "vitest";

import { DisabledJobsQueue } from "../jobs/queue/disabled-jobs-queue";
import { intervaloValido } from "../jobs/queue/jobs-queue.port";
import { OmieDespacharHandler, OmieEnviarHandler } from "./omie-fila.handlers";
import { AGENDAMENTO_DO_DESPACHO, OMIE_DESPACHAR_JOB } from "./omie-fila.service";
import { OmieModule } from "./omie.module";

describe("agendamento do despacho do OMIE (PLU-342)", () => {
  it("o intervalo é inteiro, de 1 minuto a 24 horas", () => {
    expect(intervaloValido(30 * 60_000)).toBe(1_800_000);
    for (const ruim of [0, 59_999, 86_400_001, 1.5, Number.NaN]) expect(() => intervaloValido(ruim)).toThrow();
  });

  it("sem a fila (JOBS_ENABLED desligado), não há o que agendar e nada quebra", async () => {
    expect(await new DisabledJobsQueue().agendarACada(OMIE_DESPACHAR_JOB, {}, AGENDAMENTO_DO_DESPACHO)).toEqual({ agendado: false });
  });

  it("ao subir, registra os dois handlers e agenda o despacho a cada 30 min, sem segurar a subida se a fila falhar", async () => {
    const registry = { register: vi.fn() };
    const fila = { agendarACada: vi.fn().mockRejectedValue(new Error("redis fora")) };
    const despachar = { jobKey: "omie.despachar" } as unknown as OmieDespacharHandler;
    const enviar = { jobKey: "omie.enviar" } as unknown as OmieEnviarHandler;
    const modulo = new OmieModule(registry as never, fila as never, despachar, enviar);
    expect(() => modulo.onModuleInit()).not.toThrow();
    expect(registry.register.mock.calls.map(([h]) => h)).toEqual([despachar, enviar]);
    // Id próprio: não sobrescreve o agendador das Tarefas.
    expect(fila.agendarACada).toHaveBeenCalledWith("omie.despachar", {}, { id: "omie-despacho", intervaloMs: 1_800_000 });
    await new Promise((resolve) => setImmediate(resolve));
  });
});

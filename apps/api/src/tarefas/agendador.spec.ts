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
    const handler = new GerarOcorrenciasDoDiaHandler(prisma as never, portoes({ FINANCEIRO_LIGADO: true, ENGENHARIA_LIGADA: true }), () => new Date("2026-11-25T14:00:00Z"));
    expect(await handler.process()).toEqual({ logRef: "os://tarefas/ocorrencias hoje=2026-11-25 ate=2026-11-29 criadas=0" });
    expect(tx.tarefa.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ encerradaEm: null }) }));
  });

  describe("portão por departamento (PLU-336)", () => {
    /** Tarefas já cadastradas, uma por departamento, únicas na quinta 26/11 e nunca geradas. */
    const TAREFAS = [
      { id: "fin", departamento: "financeiro" },
      { id: "eng", departamento: "engenharia-obras" },
      { id: "ene", departamento: "energia-opm" },
    ].map((t) => ({ ...t, tipo: "unica", regra: null, dia: new Date("2026-11-26T04:00:00Z"), horarioLimite: "18:00", geradaAte: null }));

    /** Um banco falso que aplica o filtro de departamento do `where`, como o Postgres. */
    async function gerarCom(ligados: Record<string, boolean>) {
      const tx = {
        tarefa: {
          findMany: vi.fn(async ({ where }: { where: { departamento?: string | { in: string[] } } }) => TAREFAS.filter((t) => {
            const filtro = where.departamento;
            if (filtro === undefined) return true;
            return typeof filtro === "string" ? t.departamento === filtro : filtro.in.includes(t.departamento);
          })),
          update: vi.fn(),
        },
        ocorrenciaDeTarefa: { createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
      };
      const prisma = { $transaction: vi.fn((fazer: (t: typeof tx) => unknown) => fazer(tx)) };
      const handler = new GerarOcorrenciasDoDiaHandler(prisma as never, portoes(ligados), () => new Date("2026-11-25T14:00:00Z"));
      const resultado = await handler.process();
      const geradas = tx.ocorrenciaDeTarefa.createMany.mock.calls.flatMap(([{ data }]) => (data as { tarefaId: string }[]).map((o) => o.tarefaId));
      return { resultado, geradas, atualizadas: tx.tarefa.update.mock.calls.map(([{ where }]) => (where as { id: string }).id) };
    }

    it("com o Financeiro fechado, não gera as ocorrências das tarefas financeiras já cadastradas, e gera as dos outros", async () => {
      const { resultado, geradas, atualizadas } = await gerarCom({ FINANCEIRO_LIGADO: false, ENGENHARIA_LIGADA: true });
      expect(geradas).toEqual(["eng", "ene"]);
      // Nem marca a financeira como gerada: quando o portão abrir, ela gera o que faltar.
      expect(atualizadas).toEqual(["eng", "ene"]);
      expect(resultado.logRef).toMatch(/criadas=2$/);
    });

    it("com os portões abertos, gera de todos os departamentos", async () => {
      expect((await gerarCom({ FINANCEIRO_LIGADO: true, ENGENHARIA_LIGADA: true })).geradas).toEqual(["fin", "eng", "ene"]);
    });

    it("portão sem valor conta como fechado (falha fechada), como na API de Tarefas", async () => {
      expect((await gerarCom({})).geradas).toEqual(["ene"]);
    });

    it("fechado → aberto → repetido: nada fica marcado no fechamento e a reabertura gera o que faltou, uma vez só", async () => {
      // Estado persistido entre as execuções, como no Postgres: a marca geradaAte e o unique (tarefa, dia).
      const tarefas = [
        // Recorrente em dia útil, desde 16/11, já gerada até domingo 22/11 (antes de fechar).
        { id: "fin-diaria", departamento: "financeiro", tipo: "recorrente", regra: { recorrencia: "dia_util" }, dia: new Date("2026-11-16T04:00:00Z"), horarioLimite: "18:00", geradaAte: new Date("2026-11-22T04:00:00Z") as Date | null },
        // Única na quarta 25/11, dentro da semana fechada.
        { id: "fin-unica", departamento: "financeiro", tipo: "unica", regra: null, dia: new Date("2026-11-25T04:00:00Z"), horarioLimite: "18:00", geradaAte: null as Date | null },
        { id: "ene", departamento: "energia-opm", tipo: "unica", regra: null, dia: new Date("2026-11-26T04:00:00Z"), horarioLimite: "18:00", geradaAte: null as Date | null },
      ];
      const ocorrencias = new Set<string>();
      const tx = {
        tarefa: {
          findMany: vi.fn(async ({ where }: { where: { departamento?: { in: string[] }; OR: [unknown, { geradaAte: { lt: Date } }] } }) => {
            const limite = where.OR[1].geradaAte.lt;
            return tarefas
              .filter((t) => !where.departamento || where.departamento.in.includes(t.departamento))
              .filter((t) => t.geradaAte === null || t.geradaAte < limite)
              .map((t) => ({ ...t }));
          }),
          update: vi.fn(async ({ where, data }: { where: { id: string }; data: { geradaAte: Date } }) => {
            tarefas.find((t) => t.id === where.id)!.geradaAte = data.geradaAte;
          }),
        },
        ocorrenciaDeTarefa: {
          createMany: vi.fn(async ({ data }: { data: { tarefaId: string; dia: Date }[] }) => {
            let count = 0;
            for (const o of data) {
              const chave = `${o.tarefaId} ${o.dia.toISOString().slice(0, 10)}`;
              if (!ocorrencias.has(chave)) { ocorrencias.add(chave); count += 1; }
            }
            return { count };
          }),
        },
      };
      const prisma = { $transaction: vi.fn((fazer: (t: typeof tx) => unknown) => fazer(tx)) };
      const rodar = (ligado: boolean, agora: string) => new GerarOcorrenciasDoDiaHandler(prisma as never, portoes({ FINANCEIRO_LIGADO: ligado, ENGENHARIA_LIGADA: true }), () => new Date(agora)).process();
      const doFinanceiro = () => [...ocorrencias].filter((o) => o.startsWith("fin-")).sort();

      // Segunda 23/11, fechado: só a Energia; as marcas do Financeiro ficam como estavam.
      expect((await rodar(false, "2026-11-23T13:00:00Z")).logRef).toMatch(/criadas=1$/);
      expect(doFinanceiro()).toEqual([]);
      expect(tarefas.find((t) => t.id === "fin-diaria")!.geradaAte).toEqual(new Date("2026-11-22T04:00:00Z"));
      expect(tarefas.find((t) => t.id === "fin-unica")!.geradaAte).toBeNull();

      // Quarta 02/12, aberto: gera desde a última marca (23/11) até o domingo da semana do job (06/12),
      // inclusive os dias úteis em que o módulo esteve fechado, que nascem atrasados.
      expect((await rodar(true, "2026-12-02T13:00:00Z")).logRef).toMatch(/ate=2026-12-06 criadas=11$/);
      expect(doFinanceiro()).toEqual([
        "fin-diaria 2026-11-23", "fin-diaria 2026-11-24", "fin-diaria 2026-11-25", "fin-diaria 2026-11-26", "fin-diaria 2026-11-27",
        "fin-diaria 2026-11-30", "fin-diaria 2026-12-01", "fin-diaria 2026-12-02", "fin-diaria 2026-12-03", "fin-diaria 2026-12-04",
        "fin-unica 2026-11-25",
      ]);

      // Repetido no mesmo dia: nada novo.
      expect((await rodar(true, "2026-12-02T15:00:00Z")).logRef).toMatch(/criadas=0$/);
      expect(doFinanceiro()).toHaveLength(11);
    });
  });
});

/** O ConfigService só com os portões. */
function portoes(ligados: Record<string, boolean>) {
  return { get: (chave: string) => ligados[chave] } as never;
}

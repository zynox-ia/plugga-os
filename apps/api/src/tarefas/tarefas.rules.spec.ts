import { describe, expect, it } from "vitest";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { acoesPermitidas, colunaDaSituacao, conferirConclusao, diasParaGerar, marcasDoChecklist, noDepartamento, noPeriodo, prazoDaOcorrencia, situacaoDaOcorrencia } from "./tarefas.rules";

// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");
const EU = "00000000-0000-4000-8000-000000000001";
const ENG = { plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.os"] }] } as never;
const ENG_GERENTE = { plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "gerente", telas: ["engenharia-obras.os"] }] } as never;
const SEM_TELA = { plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "gerente", telas: [] }] } as never;

describe("tarefas: geração das ocorrências", () => {
  const diaria = { tipo: "recorrente" as const, regra: { recorrencia: "dia_util" as const }, dia: "2026-11-20", geradaAte: null, encerrada: false };

  it("a recorrente gera cada dia em que a regra cai, a partir do início", () => {
    expect(diasParaGerar(diaria, "2026-11-24")).toEqual(["2026-11-20", "2026-11-23", "2026-11-24"]);
  });

  it("continua do dia seguinte ao último gerado e não repete", () => {
    expect(diasParaGerar({ ...diaria, geradaAte: "2026-11-23" }, "2026-11-25")).toEqual(["2026-11-24", "2026-11-25"]);
    expect(diasParaGerar({ ...diaria, geradaAte: "2026-11-25" }, "2026-11-25")).toEqual([]);
  });

  it("a única tem um dia só, e a encerrada não gera mais", () => {
    expect(diasParaGerar({ tipo: "unica", regra: null, dia: "2026-11-26", geradaAte: null, encerrada: false }, "2026-11-29")).toEqual(["2026-11-26"]);
    expect(diasParaGerar({ tipo: "unica", regra: null, dia: "2026-11-26", geradaAte: "2026-11-29", encerrada: false }, "2026-12-06")).toEqual([]);
    expect(diasParaGerar({ ...diaria, encerrada: true }, "2026-11-24")).toEqual([]);
  });

  it("o prazo é o dia às horas-limite, em Manaus", () => {
    expect(prazoDaOcorrencia("2026-11-23", "12:00").toISOString()).toBe("2026-11-23T16:00:00.000Z");
  });
});

describe("tarefas: situação, período e Kanban", () => {
  const de = (dia: string, horario: string, concluidaEm: Date | null = null) => ({ dia, prazoEm: prazoDaOcorrencia(dia, horario), concluidaEm });

  it("atrasada depois do horário-limite; vence hoje antes dele; no prazo nos dias seguintes", () => {
    expect(situacaoDaOcorrencia(de("2026-11-23", "09:00"), AGORA)).toBe("atrasada");
    expect(situacaoDaOcorrencia(de("2026-11-20", "18:00"), AGORA)).toBe("atrasada");
    expect(situacaoDaOcorrencia(de("2026-11-23", "12:00"), AGORA)).toBe("vence_hoje");
    expect(situacaoDaOcorrencia(de("2026-11-24", "12:00"), AGORA)).toBe("no_prazo");
    expect(situacaoDaOcorrencia(de("2026-11-20", "18:00", AGORA), AGORA)).toBe("concluida");
    expect(colunaDaSituacao("vence_hoje")).toBe("pendentes");
  });

  it("Hoje e Esta semana incluem as atrasadas", () => {
    expect(noPeriodo("hoje", "2026-11-20", "atrasada", "2026-11-23")).toBe(true);
    expect(noPeriodo("hoje", "2026-11-24", "no_prazo", "2026-11-23")).toBe(false);
    expect(noPeriodo("semana", "2026-11-29", "no_prazo", "2026-11-23")).toBe(true);
    expect(noPeriodo("semana", "2026-11-30", "no_prazo", "2026-11-23")).toBe(false);
    expect(noPeriodo("atrasadas", "2026-11-23", "vence_hoje", "2026-11-23")).toBe(false);
    expect(noPeriodo("todas", "2026-10-01", "concluida", "2026-11-23")).toBe(true);
  });
});

describe("tarefas: quem pode o quê", () => {
  const tarefa = { origem: "criada" as const, criadoPorId: EU, encerrada: false, automacao: null };
  const ocorrencia = { dia: "2026-11-23", concluida: false, cancelada: false };
  const contexto = { departamento: "engenharia-obras" as const, acesso: ENG, principalId: EU, hoje: "2026-11-23", tarefa, ocorrencia };

  it("quem é do departamento conclui a de hoje ou de antes, nunca a de amanhã nem a automática", () => {
    expect(acoesPermitidas(contexto)).toEqual(["concluir", "encerrar"]);
    expect(acoesPermitidas({ ...contexto, ocorrencia: { ...ocorrencia, dia: "2026-11-24" } })).toEqual(["encerrar"]);
    expect(acoesPermitidas({ ...contexto, tarefa: { ...tarefa, automacao: "engenharia.monitoramento_do_dia" } })).toEqual(["encerrar"]);
    expect(acoesPermitidas({ ...contexto, ocorrencia: { ...ocorrencia, concluida: true } })).toEqual(["encerrar"]);
  });

  it("encerra quem criou ou o gerente; a rotina do departamento só o gerente", () => {
    expect(acoesPermitidas({ ...contexto, principalId: "outra", ocorrencia: undefined })).toEqual([]);
    expect(acoesPermitidas({ ...contexto, acesso: ENG_GERENTE, principalId: "outra", ocorrencia: undefined })).toEqual(["encerrar"]);
    expect(acoesPermitidas({ ...contexto, tarefa: { ...tarefa, origem: "do_departamento" }, ocorrencia: undefined })).toEqual([]);
  });

  it("sem tela no departamento, nada; fora dele, nada", () => {
    expect(noDepartamento(SEM_TELA, "engenharia-obras")).toBe(false);
    expect(acoesPermitidas({ ...contexto, departamento: "financeiro" })).toEqual([]);
  });

  it("a conclusão traz o que a tarefa pede, e o checklist só os itens dela", () => {
    expect(() => conferirConclusao({ evidencia: false, resultado: true, instrucoes: 0 }, { resultado: null, temEvidencia: false, checklist: [] })).toThrow(RequisicaoInvalida);
    expect(() => conferirConclusao({ evidencia: true, resultado: false, instrucoes: 0 }, { resultado: "ok", temEvidencia: false, checklist: [] })).toThrow(RequisicaoInvalida);
    expect(() => conferirConclusao({ evidencia: false, resultado: true, instrucoes: 2 }, { resultado: "ok", temEvidencia: false, checklist: [2] })).toThrow(RequisicaoInvalida);
    expect(() => conferirConclusao({ evidencia: true, resultado: true, instrucoes: 2 }, { resultado: "ok", temEvidencia: true, checklist: [0, 1] })).not.toThrow();
    expect(marcasDoChecklist(3, [0, 2])).toEqual([true, false, true]);
  });
});

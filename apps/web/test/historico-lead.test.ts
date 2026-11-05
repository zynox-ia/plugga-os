import assert from "node:assert/strict";
import { test } from "node:test";
import type { DealHistoryEntry } from "@plugga/shared";
import { agruparHistoricoPorDia, formatarHoraHistorico } from "../app/lib/historico-lead.ts";

function entrada(id: string, occurredAt: string): DealHistoryEntry {
  return { id, occurredAt, kind: "created", actor: null, field: null, before: null, after: null, fromStageName: null, toStageName: null, fromPipelineName: null, toPipelineName: null, fromPriority: null, toPriority: null };
}

test("histórico vazio não cria grupos", () => {
  assert.deepEqual(agruparHistoricoPorDia([], new Date("2026-11-02T12:00:00Z")), []);
});

test("agrupa pelo dia em Manaus, respeitando a virada de dia em UTC", () => {
  const grupos = agruparHistoricoPorDia([
    entrada("anterior", "2026-11-02T03:59:00Z"),
    entrada("hoje", "2026-11-02T04:00:00Z"),
  ], new Date("2026-11-02T12:00:00Z"));
  assert.deepEqual(grupos.map((grupo) => [grupo.rotulo, grupo.entradas.map((item) => item.id)]), [
    ["Hoje, 2 de novembro", ["hoje"]],
    ["Ontem, 1 de novembro", ["anterior"]],
  ]);
});

test("ordena os grupos e eventos pelos mais recentes sem alterar a lista recebida", () => {
  const entradas = [entrada("antigo", "2026-10-30T16:00:00Z"), entrada("cedo", "2026-11-02T14:00:00Z"), entrada("recente", "2026-11-02T18:00:00Z")];
  const grupos = agruparHistoricoPorDia(entradas, new Date("2026-11-02T19:00:00Z"));
  assert.deepEqual(grupos.map((grupo) => grupo.entradas.map((item) => item.id)), [["recente", "cedo"], ["antigo"]]);
  assert.equal(grupos[1]!.rotulo, "30 de outubro de 2026");
  assert.deepEqual(entradas.map((item) => item.id), ["antigo", "cedo", "recente"]);
});

test("ontem atravessa a virada do ano no fuso do produto", () => {
  const grupos = agruparHistoricoPorDia([entrada("dezembro", "2025-12-31T20:00:00Z")], new Date("2026-01-01T06:00:00Z"));
  assert.equal(grupos[0]!.rotulo, "Ontem, 31 de dezembro");
});

test("horário usa Manaus e relógio de 24 horas", () => {
  assert.equal(formatarHoraHistorico("2026-11-02T18:47:00Z"), "14:47");
  assert.equal(formatarHoraHistorico("2026-11-02T04:00:00Z"), "00:00");
});

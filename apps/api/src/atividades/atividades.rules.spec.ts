import { describe, expect, it } from "vitest";
import { EstadoInvalido, RequisicaoInvalida } from "../common/errors/dominio";
import { exigeRodadaAberta, validarAgenda, janelaManaus } from "./atividades.rules";

describe("atividades: estado, CAS e agenda", () => {
  it("recusa versão antiga e rodada encerrada antes de alterar dados", () => {
    expect(() => exigeRodadaAberta(3, 2, null)).toThrow(EstadoInvalido);
    expect(() => exigeRodadaAberta(3, 3, new Date())).toThrow(EstadoInvalido);
    expect(() => exigeRodadaAberta(3, 3, null)).not.toThrow();
  });
  it("aceita compromisso pontual e recusa fim anterior ao início depois de mesclar PATCH", () => {
    const startsAt = new Date("2026-11-09T15:00:00Z");
    expect(() => validarAgenda(startsAt, startsAt)).not.toThrow();
    expect(() => validarAgenda(startsAt, new Date("2026-11-09T14:59:59Z"))).toThrow(RequisicaoInvalida);
  });
  it("buckets usam data de Manaus perto da meia-noite UTC, sem depender do TZ local", () => {
    const range = janelaManaus(new Date("2026-11-10T01:30:00Z"));
    expect(range.today.toISOString()).toBe("2026-11-09T04:00:00.000Z");
    expect(range.tomorrow.toISOString()).toBe("2026-11-10T04:00:00.000Z");
    expect(range.afterNext7.toISOString()).toBe("2026-11-17T04:00:00.000Z");
  });
});

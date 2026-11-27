import { describe, expect, it } from "vitest";

import { adicionarDiasUteis, cumpriuPrazo, diaEmManaus, fimDoDiaEmManaus, inicioDoDiaEmManaus, inicioDoDiaSeguinteEmManaus, situacaoDoPrazo } from "./dias-uteis";

// Manaus é UTC−4 sem horário de verão: 10:00 em Manaus = 14:00Z.
const manaus = (diaHora: string) => new Date(`${diaHora}-04:00`);

describe("adicionarDiasUteis", () => {
  it("não conta o dia de entrada e vence no fim do dia em Manaus", () => {
    // Segunda 23/11/2026 + 2 dias úteis = quarta 25/11, 23:59:59.999 de Manaus.
    expect(adicionarDiasUteis(manaus("2026-11-23T10:00:00"), 2).toISOString()).toBe("2026-11-26T03:59:59.999Z");
  });

  it("pula sábado e domingo", () => {
    // Sexta 27/11 + 2 = terça 01/12.
    expect(diaEmManaus(adicionarDiasUteis(manaus("2026-11-27T09:00:00"), 2))).toBe("2026-12-01");
    // Sábado 28/11 + 1 = segunda 30/11.
    expect(diaEmManaus(adicionarDiasUteis(manaus("2026-11-28T09:00:00"), 1))).toBe("2026-11-30");
  });

  it("lê o dia em Manaus, não em UTC", () => {
    // 23:30 de sexta em Manaus já é sábado em UTC; a contagem parte da sexta.
    expect(diaEmManaus(adicionarDiasUteis(manaus("2026-11-27T23:30:00"), 1))).toBe("2026-11-30");
  });

  it("atravessa a virada do ano", () => {
    // Quinta 31/12/2026 + 5 = quinta 07/01/2027 (feriado não é descontado).
    expect(diaEmManaus(adicionarDiasUteis(manaus("2026-12-31T08:00:00"), 5))).toBe("2027-01-07");
  });

  it("entrar de manhã ou à noite no mesmo dia vence no mesmo instante", () => {
    expect(adicionarDiasUteis(manaus("2026-11-23T07:00:00"), 5)).toEqual(adicionarDiasUteis(manaus("2026-11-23T22:00:00"), 5));
  });

  it("recusa prazo menor que 1 ou fracionado", () => {
    expect(() => adicionarDiasUteis(new Date(), 0)).toThrow();
    expect(() => adicionarDiasUteis(new Date(), 1.5)).toThrow();
  });
});

describe("situacaoDoPrazo", () => {
  const prazo = fimDoDiaEmManaus("2026-11-25");

  it("no prazo antes do dia do vencimento", () => {
    expect(situacaoDoPrazo(prazo, manaus("2026-11-24T23:59:00"))).toBe("no_prazo");
  });

  it("vence hoje durante o dia do vencimento, em Manaus", () => {
    expect(situacaoDoPrazo(prazo, manaus("2026-11-25T00:00:00"))).toBe("vence_hoje");
    expect(situacaoDoPrazo(prazo, manaus("2026-11-25T23:59:59"))).toBe("vence_hoje");
  });

  it("vencido depois do fim do dia", () => {
    expect(situacaoDoPrazo(prazo, manaus("2026-11-26T00:00:00"))).toBe("vencido");
  });
});

describe("cumpriuPrazo", () => {
  it("sair até o fim do dia do vencimento cumpre", () => {
    const prazo = fimDoDiaEmManaus("2026-11-25");
    expect(cumpriuPrazo(manaus("2026-11-25T23:00:00"), prazo)).toBe(true);
    expect(cumpriuPrazo(manaus("2026-11-26T08:00:00"), prazo)).toBe(false);
  });
});

describe("dias de Manaus", () => {
  it("início e fim do dia são os limites locais", () => {
    expect(inicioDoDiaEmManaus("2026-11-23").toISOString()).toBe("2026-11-23T04:00:00.000Z");
    expect(fimDoDiaEmManaus("2026-11-23").toISOString()).toBe("2026-11-24T03:59:59.999Z");
  });

  it("o início do dia seguinte é o fim exclusivo de um período que inclui o dia, na virada do mês, do ano e no extremo do calendário", () => {
    expect(inicioDoDiaSeguinteEmManaus("2026-11-30").toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(inicioDoDiaSeguinteEmManaus("2026-12-31").toISOString()).toBe("2027-01-01T04:00:00.000Z");
    expect(inicioDoDiaSeguinteEmManaus("2028-02-28").toISOString()).toBe("2028-02-29T04:00:00.000Z");
    expect(inicioDoDiaSeguinteEmManaus("9999-12-31").getTime()).toBe(Date.UTC(10000, 0, 1, 4));
    expect(() => inicioDoDiaSeguinteEmManaus("2026-02-30")).toThrow();
  });

  it("recusa dia inexistente", () => {
    expect(() => inicioDoDiaEmManaus("2026-02-30")).toThrow();
  });
});

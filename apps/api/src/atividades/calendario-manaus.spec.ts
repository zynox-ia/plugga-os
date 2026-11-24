import { describe, expect, it } from "vitest";

import { calcularPrazoManaus } from "./calendario-manaus";

describe("prazo comercial em dias úteis de Manaus (D+N, 18h)", () => {
  const casos: [string, string, number, string][] = [
    ["não conta D0 mesmo depois das 18h locais", "2026-11-10T00:30:00Z", 2, "2026-11-11T22:00:00Z"],
    ["antes da meia-noite local ainda usa a data anterior", "2026-11-10T03:59:59Z", 2, "2026-11-11T22:00:00Z"],
    ["depois da meia-noite local muda a data-base", "2026-11-10T04:00:00Z", 2, "2026-11-12T22:00:00Z"],
    ["sexta-feira pula sábado e domingo", "2026-11-13T12:00:00Z", 2, "2026-11-17T22:00:00Z"],
    ["aplica os quatro dias do acompanhamento comercial", "2026-11-13T12:00:00Z", 4, "2026-11-19T22:00:00Z"],
    ["exclui Consciência Negra em 20/11", "2026-11-19T12:00:00Z", 2, "2026-11-24T22:00:00Z"],
    ["exclui a padroeira de Manaus em 8/12", "2026-12-07T12:00:00Z", 2, "2026-12-10T22:00:00Z"],
    ["7/12 facultativo continua útil", "2026-12-04T12:00:00Z", 1, "2026-12-07T22:00:00Z"],
    ["atravessa ano e o feriado de 1/1", "2026-12-31T12:00:00Z", 2, "2027-01-05T22:00:00Z"],
    ["segunda de Carnaval não vira feriado", "2026-02-13T12:00:00Z", 1, "2026-02-16T22:00:00Z"],
    ["Carnaval 2026 é excluído e Cinzas conta", "2026-02-16T12:00:00Z", 2, "2026-02-19T22:00:00Z"],
    ["Cinzas 2026 pode receber vencimento às 18h", "2026-02-17T12:00:00Z", 1, "2026-02-18T22:00:00Z"],
    ["Carnaval 2027 é calculado e Cinzas conta", "2027-02-08T12:00:00Z", 2, "2027-02-11T22:00:00Z"],
    ["Cinzas 2027 pode receber vencimento às 18h", "2027-02-09T12:00:00Z", 1, "2027-02-10T22:00:00Z"],
    ["exclui Paixão de Cristo 2026", "2026-04-02T12:00:00Z", 1, "2026-04-06T22:00:00Z"],
    ["exclui Paixão de Cristo 2027", "2027-03-25T12:00:00Z", 1, "2027-03-29T22:00:00Z"],
    ["Corpus Christi é feriado local, sexta seguinte não é", "2026-06-03T12:00:00Z", 1, "2026-06-05T22:00:00Z"],
    ["calcula Corpus Christi 2027 sem emendar a sexta", "2027-05-26T12:00:00Z", 1, "2027-05-28T22:00:00Z"],
    ["exclui a elevação do Amazonas em 5/9", "2028-09-04T12:00:00Z", 1, "2028-09-06T22:00:00Z"],
    ["exclui o aniversário de Manaus em 24/10", "2025-10-23T12:00:00Z", 1, "2025-10-27T22:00:00Z"],
    ["não transfere feriado de domingo para segunda", "2027-10-22T12:00:00Z", 1, "2027-10-25T22:00:00Z"],
    ["conta ponto facultativo anterior a Tiradentes", "2026-04-17T12:00:00Z", 1, "2026-04-20T22:00:00Z"],
    ["exclui Tiradentes sem emendar o dia anterior", "2026-04-17T12:00:00Z", 2, "2026-04-22T22:00:00Z"],
    ["exclui o Dia do Trabalho", "2026-04-30T12:00:00Z", 1, "2026-05-04T22:00:00Z"],
    ["exclui a Independência", "2026-09-04T12:00:00Z", 1, "2026-09-08T22:00:00Z"],
    ["exclui Nossa Senhora Aparecida", "2026-10-09T12:00:00Z", 1, "2026-10-13T22:00:00Z"],
    ["Dia do Servidor continua útil", "2026-10-27T12:00:00Z", 1, "2026-10-28T22:00:00Z"],
    ["exclui Finados", "2026-10-30T12:00:00Z", 1, "2026-11-03T22:00:00Z"],
    ["exclui a Proclamação da República em dia útil", "2027-11-12T12:00:00Z", 1, "2027-11-16T22:00:00Z"],
    ["exclui o Natal", "2026-12-24T12:00:00Z", 1, "2026-12-28T22:00:00Z"],
    ["preserva a data bissexta civil", "2024-02-28T12:00:00Z", 1, "2024-02-29T22:00:00Z"],
  ];

  it.each(casos)("%s", (_nome, entrada, dias, esperado) => {
    expect(calcularPrazoManaus(new Date(entrada), dias).toISOString()).toBe(new Date(esperado).toISOString());
  });

  it("não muda o instante de entrada nem depende do TZ do processo", () => {
    const entrada = new Date("2026-11-10T01:30:45.123Z");
    const anterior = process.env.TZ;
    try {
      for (const fuso of ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"]) {
        process.env.TZ = fuso;
        const prazo = calcularPrazoManaus(entrada, 3);
        expect(prazo.toISOString()).toBe("2026-11-12T22:00:00.000Z");
        expect(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(prazo)).toBe("18:00");
        expect(prazo).not.toBe(entrada);
      }
    } finally {
      if (anterior === undefined) delete process.env.TZ;
      else process.env.TZ = anterior;
    }
    expect(entrada.toISOString()).toBe("2026-11-10T01:30:45.123Z");
  });

  it("recusa entrada inválida e prazos que não sejam inteiros positivos seguros", () => {
    expect(() => calcularPrazoManaus(new Date(NaN), 2)).toThrow(RangeError);
    for (const dias of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => calcularPrazoManaus(new Date("2026-11-09T12:00:00Z"), dias)).toThrow(RangeError);
    }
  });
});

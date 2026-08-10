import { describe, expect, it } from "vitest";

import {
  adicionaDiasUteis,
  diasUteisEntre,
  HORA_FIM_DO_EXPEDIENTE,
  prazoDaEtapa,
  situacaoDoPrazo,
} from "./dias-uteis";

/**
 * Manaus é UTC−4 o ano inteiro, então 18h locais são 22h UTC. As datas dos
 * testes são escritas em UTC de propósito: é assim que o banco guarda, e é o
 * ponto onde um erro de fuso apareceria.
 */
function manaus(iso: string): Date {
  return new Date(iso);
}

function fimDoExpedienteEmManaus(data: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Manaus",
      hour: "2-digit",
      hour12: false,
    })
      .format(data)
      .replace(/\D/g, ""),
  );
}

describe("adicionaDiasUteis", () => {
  it("não conta o próprio dia de início", () => {
    // Segunda, 11/08/2026, 12h Manaus (16h UTC) + 1 dia útil = terça.
    const prazo = adicionaDiasUteis(manaus("2026-08-10T16:00:00Z"), 1);
    expect(prazo.toISOString()).toBe("2026-08-11T22:00:00.000Z");
  });

  it("pula o fim de semana", () => {
    // Sexta, 14/08/2026 + 1 dia útil = segunda, 17/08.
    const prazo = adicionaDiasUteis(manaus("2026-08-14T16:00:00Z"), 1);
    expect(prazo.toISOString()).toBe("2026-08-17T22:00:00.000Z");
  });

  it("conta a partir da segunda quando o início cai no sábado", () => {
    const prazo = adicionaDiasUteis(manaus("2026-08-15T16:00:00Z"), 2);
    expect(prazo.toISOString()).toBe("2026-08-18T22:00:00.000Z");
  });

  it("atravessa duas semanas com o ciclo de referência do POP §3", () => {
    // 18 dias úteis a partir de segunda 10/08 caem em quinta 03/09.
    const prazo = adicionaDiasUteis(manaus("2026-08-10T16:00:00Z"), 18);
    expect(prazo.toISOString()).toBe("2026-09-03T22:00:00.000Z");
  });

  it("vence sempre no fim do expediente, qualquer que seja a hora de entrada", () => {
    const cedo = adicionaDiasUteis(manaus("2026-08-10T12:00:00Z"), 2);
    const tarde = adicionaDiasUteis(manaus("2026-08-10T20:00:00Z"), 2);
    expect(cedo.toISOString()).toBe(tarde.toISOString());
    expect(fimDoExpedienteEmManaus(cedo)).toBe(HORA_FIM_DO_EXPEDIENTE);
  });

  it("recusa prazo menor que um dia útil", () => {
    expect(() => adicionaDiasUteis(manaus("2026-08-10T16:00:00Z"), 0)).toThrow();
  });
});

describe("diasUteisEntre", () => {
  it("conta segunda a quarta como dois dias úteis", () => {
    expect(diasUteisEntre(manaus("2026-08-10T13:00:00Z"), manaus("2026-08-12T13:00:00Z"))).toBe(2);
  });

  it("ignora o fim de semana no meio", () => {
    // Sexta 14/08 → terça 18/08: segunda e terça.
    expect(diasUteisEntre(manaus("2026-08-14T13:00:00Z"), manaus("2026-08-18T13:00:00Z"))).toBe(2);
  });

  it("é zero dentro do mesmo dia", () => {
    expect(diasUteisEntre(manaus("2026-08-10T13:00:00Z"), manaus("2026-08-10T21:00:00Z"))).toBe(0);
  });

  it("é zero quando o fim antecede o início", () => {
    expect(diasUteisEntre(manaus("2026-08-12T13:00:00Z"), manaus("2026-08-10T13:00:00Z"))).toBe(0);
  });
});

describe("prazoDaEtapa", () => {
  const entrouEm = manaus("2026-08-10T13:00:00Z");

  it.each([
    ["pedido_gerado", 2],
    ["analise_estoque", 2],
    ["cotacoes", 5],
    ["aprovacao_compra", 2],
    ["pagamento", 2],
    ["retirada", 5],
  ] as const)("usa o prazo do POP §3 para %s", (etapa, esperado) => {
    expect(prazoDaEtapa({ etapa, entrouEm }).prazoDiasUteis).toBe(esperado);
  });

  it("estende a retirada com o prazo do fornecedor na aquisição externa", () => {
    const prazo = prazoDaEtapa({
      etapa: "retirada",
      entrouEm,
      origemAtendimento: "aquisicao",
      prazoFornecedorDias: 20,
    });
    expect(prazo.prazoDiasUteis).toBe(20);
  });

  it("ignora prazo de fornecedor menor que o mínimo de 5 dias úteis", () => {
    const prazo = prazoDaEtapa({
      etapa: "retirada",
      entrouEm,
      origemAtendimento: "aquisicao",
      prazoFornecedorDias: 2,
    });
    expect(prazo.prazoDiasUteis).toBe(5);
  });

  it("não estende a retirada do fluxo interno, que não depende de fornecedor", () => {
    const prazo = prazoDaEtapa({
      etapa: "retirada",
      entrouEm,
      origemAtendimento: "estoque",
      prazoFornecedorDias: 20,
    });
    expect(prazo.prazoDiasUteis).toBe(5);
  });
});

describe("situacaoDoPrazo", () => {
  it("é sem_prazo quando não há etapa aberta", () => {
    expect(situacaoDoPrazo(null, manaus("2026-08-12T13:00:00Z"))).toBe("sem_prazo");
  });

  it("é vencida depois do fim do expediente do dia do prazo", () => {
    const prazoEm = manaus("2026-08-12T22:00:00Z");
    expect(situacaoDoPrazo(prazoEm, manaus("2026-08-12T22:00:01Z"))).toBe("vencida");
  });

  it("é vence_hoje durante o dia do prazo", () => {
    const prazoEm = manaus("2026-08-12T22:00:00Z");
    expect(situacaoDoPrazo(prazoEm, manaus("2026-08-12T13:00:00Z"))).toBe("vence_hoje");
  });

  it("é no_prazo antes do dia do prazo", () => {
    const prazoEm = manaus("2026-08-12T22:00:00Z");
    expect(situacaoDoPrazo(prazoEm, manaus("2026-08-11T13:00:00Z"))).toBe("no_prazo");
  });

  it("trata a virada do dia em Manaus, não em UTC", () => {
    // 12/08 03:00 UTC ainda é 11/08 23:00 em Manaus: não é o dia do prazo.
    const prazoEm = manaus("2026-08-12T22:00:00Z");
    expect(situacaoDoPrazo(prazoEm, manaus("2026-08-12T03:00:00Z"))).toBe("no_prazo");
  });
});

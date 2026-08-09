import { describe, expect, it } from "vitest";

import { manausDayWindow } from "./manaus-day";

describe("janela do dia de Manaus", () => {
  it("contém o instante atual mesmo entre 00:00 e 04:00 UTC", () => {
    // 01:30 UTC = 21:30 do dia anterior em Manaus. O início do dia não pode
    // cair no futuro — era o defeito que zerava o overview das 20h à meia-noite.
    const now = new Date("2026-08-09T01:30:00Z");
    const { start, end } = manausDayWindow(now);

    expect(start.toISOString()).toBe("2026-08-08T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-09T04:00:00.000Z");
    expect(now >= start && now < end).toBe(true);
  });

  it("vira o dia às 04:00 UTC, meia-noite de Manaus", () => {
    const antes = manausDayWindow(new Date("2026-08-09T03:59:59Z"));
    const depois = manausDayWindow(new Date("2026-08-09T04:00:00Z"));

    expect(antes.start.toISOString()).toBe("2026-08-08T04:00:00.000Z");
    expect(depois.start.toISOString()).toBe("2026-08-09T04:00:00.000Z");
  });
});

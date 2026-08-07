import { describe, expect, it } from "vitest";

import { PluggamobRepository } from "./pluggamob.repository";
import { PluggamobService } from "./pluggamob.service";

describe("PluggamobService", () => {
  it("always exposes local mock mode and validated overview counts", async () => {
    const repository: PluggamobRepository = {
      overview: async () => ({
        sessionsToday: 4,
        activeSessions: 1,
        openIncidents: 2,
        pendingSettlements: 3,
      }),
    };

    const result = await new PluggamobService(repository).overview();

    expect(result).toMatchObject({
      mode: "mock",
      sessionsToday: 4,
      activeSessions: 1,
      openIncidents: 2,
      pendingSettlements: 3,
    });
    expect(result.generatedAt).toEqual(expect.any(String));
  });
});

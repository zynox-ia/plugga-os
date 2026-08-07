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
      reactivationQueue: async () => ({ mode: "mock", items: [] }),
      userProfile: async () => { throw new Error("not used"); },
      recordContact: async () => { throw new Error("not used"); },
      optOut: async () => { throw new Error("not used"); },
      sessions: async () => ({ mode: "mock", items: [] }),
      session: async () => { throw new Error("not used"); },
      locations: async () => ({ mode: "mock", items: [] }),
      location: async () => { throw new Error("not used"); },
      createIncident: async () => { throw new Error("not used"); },
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

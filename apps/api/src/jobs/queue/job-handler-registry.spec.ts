import { describe, expect, it } from "vitest";

import { JobHandlerRegistry } from "./job-handler-registry";
import type { JobHandler } from "./job-handler";

const handler = (jobKey: string): JobHandler => ({
  jobKey,
  async process() {},
});

describe("JobHandlerRegistry", () => {
  it("registers and resolves handlers by job key", () => {
    const registry = new JobHandlerRegistry();
    const bitrix = handler("bitrix.import.opm");
    registry.register(bitrix);

    expect(registry.get("bitrix.import.opm")).toBe(bitrix);
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("rejects a duplicate registration for the same job key", () => {
    const registry = new JobHandlerRegistry();
    registry.register(handler("bitrix.import.opm"));

    expect(() => registry.register(handler("bitrix.import.opm"))).toThrow(
      /already registered/,
    );
  });
});

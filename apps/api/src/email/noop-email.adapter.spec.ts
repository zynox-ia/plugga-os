import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TransactionalEmail } from "./email.port";
import { NoopEmailAdapter } from "./noop-email.adapter";

const TOKEN = "super-secret-opaque-token";
const FULL_EMAIL = "person@example.com";

function email(): TransactionalEmail {
  return {
    to: FULL_EMAIL,
    template: "invite",
    variables: {
      name: "Ana",
      link: `http://localhost:3000/auth/accept-invite?token=${TOKEN}`,
      expiresInMinutes: 60,
    },
  };
}

describe("NoopEmailAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never sends and never logs the token/link or full recipient address", async () => {
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    await new NoopEmailAdapter().sendTransactional(email());

    expect(logSpy).toHaveBeenCalledTimes(1);
    const message = String(logSpy.mock.calls[0]?.[0] ?? "");
    expect(message).toContain("noop");
    expect(message).toContain("invite");
    expect(message).toContain("p***@example.com");
    expect(message).not.toContain(TOKEN);
    expect(message).not.toContain("accept-invite");
    expect(message).not.toContain(FULL_EMAIL);
  });
});

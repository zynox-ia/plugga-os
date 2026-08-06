import { beforeEach, describe, expect, it } from "vitest";

import {
  AuditRepository,
  type AgentActionAppend,
  type EventAppend,
  type StoredAgentAction,
} from "../../audit/audit.repository";
import type { AuthPrincipal } from "../../core/auth/auth.types";
import { WhatsappService } from "./whatsapp.service";

class AuditSpy extends AuditRepository {
  calls: Array<{ action: AgentActionAppend; event: EventAppend }> = [];

  async appendTrail(action: AgentActionAppend, event: EventAppend): Promise<StoredAgentAction> {
    this.calls.push({ action, event });
    return {
      id: "00000000-0000-4000-8000-000000000202",
      status: action.status,
      createdAt: new Date(),
    };
  }
}

const principal: AuthPrincipal = {
  id: "service:unit-test",
  kind: "service",
  roles: ["tech"],
};

describe("WhatsappService", () => {
  let audit: AuditSpy;
  let service: WhatsappService;

  beforeEach(() => {
    audit = new AuditSpy();
    service = new WhatsappService(audit);
  });

  it("blocks opted-out destinations and appends the decision", async () => {
    const result = await service.simulateSend(
      {
        destination: "+5592999991234",
        originDomain: "crm",
        audience: "transactional",
        priority: "normal",
        optedOut: true,
        content: { kind: "text", text: "teste" },
      },
      principal,
    );

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("opted_out");
    expect(audit.calls[0]?.event.eventName).toBe("channel.whatsapp.send.blocked");
  });

  it.each([
    { audience: "campaign" as const, priority: "normal" as const },
    { audience: "transactional" as const, priority: "critical" as const },
  ])("requires approval for $audience/$priority", async ({ audience, priority }) => {
    const result = await service.simulateSend(
      {
        destination: "+5592999991234",
        originDomain: "financeiro",
        audience,
        priority,
        optedOut: false,
        content: { kind: "template", name: "test-only", variables: {} },
      },
      principal,
    );

    expect(result.status).toBe("pending_approval");
    expect(result.reason).toBe("approval_required");
    expect(audit.calls[0]?.action.approvalStatus).toBe("pending");
  });
});

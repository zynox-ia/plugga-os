import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  eventNames,
  whatsappSendResponseSchema,
  type WhatsappSendRequest,
  type WhatsappSendResponse,
} from "@plugga/shared";

import { AuditRepository } from "../../audit/audit.repository";
import type { AuthPrincipal } from "../../core/auth/auth.types";

@Injectable()
export class WhatsappService {
  constructor(@Inject(AuditRepository) private readonly auditRepository: AuditRepository) {}

  async simulateSend(
    request: WhatsappSendRequest,
    principal: AuthPrincipal,
  ): Promise<WhatsappSendResponse> {
    const messageId = `mock_${randomUUID()}`;
    const maskedDestination = this.maskDestination(request.destination);
    const policy = this.evaluatePolicy(request);
    const auditPayload = {
      messageId,
      maskedDestination,
      status: policy.status,
      reason: policy.reason,
      originDomain: request.originDomain,
      audience: request.audience,
      priority: request.priority,
      contentKind: request.content.kind,
    };

    const event = {
      eventName: policy.eventName,
      entityType: "whatsapp_message",
      entityId: messageId,
      actorType: principal.kind === "service" ? "agent" as const : "user" as const,
      actorId: principal.id,
      payload: auditPayload,
      occurredAt: new Date(),
    };

    if (principal.kind === "service") {
      await this.auditRepository.appendTrail({
        agent: principal.id,
        requestedById: null,
        channel: "whatsapp",
        action: "channel.whatsapp.send",
        entityType: "whatsapp_message",
        entityId: messageId,
        input: auditPayload,
        payload: auditPayload,
        decision: policy.status === "queued" ? "allowed" : policy.status,
        approvalStatus: policy.status === "pending_approval" ? "pending" : "not_required",
        status: policy.status === "queued" ? "recorded" : policy.status === "blocked" ? "blocked" : "pending",
        result: "mock/no-op; no network call was made",
      }, event);
    } else {
      await this.auditRepository.appendEvent(event);
    }

    return whatsappSendResponseSchema.parse({
      messageId,
      maskedDestination,
      status: policy.status,
      simulated: true,
      reason: policy.reason,
    });
  }

  private evaluatePolicy(request: WhatsappSendRequest): {
    status: WhatsappSendResponse["status"];
    reason: WhatsappSendResponse["reason"];
    eventName: (typeof eventNames)[keyof typeof eventNames];
  } {
    if (request.optedOut) {
      return {
        status: "blocked",
        reason: "opted_out",
        eventName: eventNames.whatsappSendBlocked,
      };
    }

    if (request.audience === "campaign" || request.priority === "critical") {
      return {
        status: "pending_approval",
        reason: "approval_required",
        eventName: eventNames.whatsappSendPendingApproval,
      };
    }

    return {
      status: "queued",
      reason: "mock_only",
      eventName: eventNames.whatsappSendMocked,
    };
  }

  private maskDestination(destination: string): string {
    const visibleSuffix = destination.slice(-4);
    return `${destination.slice(0, 3)}${"*".repeat(Math.max(4, destination.length - 7))}${visibleSuffix}`;
  }
}

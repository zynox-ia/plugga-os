import { Injectable } from "@nestjs/common";

import type { JobHandler } from "./job-handler";

/**
 * Central registry of job handlers. Feature modules register their handler for a
 * job key; the worker dispatches by looking one up. Keeping the worker free of
 * direct handler imports preserves module boundaries (ADR-0002).
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(handler: JobHandler): void {
    if (this.handlers.has(handler.jobKey)) {
      throw new Error(`a handler is already registered for job '${handler.jobKey}'`);
    }
    this.handlers.set(handler.jobKey, handler);
  }

  get(jobKey: string): JobHandler | undefined {
    return this.handlers.get(jobKey);
  }

  all(): JobHandler[] {
    return [...this.handlers.values()];
  }
}

import { Controller, Get } from "@nestjs/common";

import { Public } from "../core/auth/access.decorators";

@Public()
@Controller("health")
export class HealthController {
  @Get()
  check(): { status: "ok"; service: "plugga-api"; timestamp: string } {
    return {
      status: "ok",
      service: "plugga-api",
      timestamp: new Date().toISOString(),
    };
  }
}

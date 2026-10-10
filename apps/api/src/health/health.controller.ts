import { Controller, Get, Inject, NotFoundException, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { Public } from "../core/auth/access.decorators";
import { HealthService } from "./health.service";

/** Origem interna: loopback ou rede privada, e sem cabeçalho de proxy (o Caddy sempre o acrescenta). */
export function ehRedeInterna(endereco: string | undefined, viaProxy: boolean): boolean {
  if (viaProxy || !endereco) return false;
  const ip = endereco.replace(/^::ffff:/, "");
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /** Liveness: o processo está de pé. */
  @Get()
  check(): { status: "ok"; service: "plugga-api"; timestamp: string } {
    return {
      status: "ok",
      service: "plugga-api",
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: depende de banco, Redis e armazenamento. Só responde à rede interna. */
  @Get("ready")
  async ready(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!ehRedeInterna(req.socket.remoteAddress, Boolean(req.headers["x-forwarded-for"]))) {
      throw new NotFoundException();
    }
    const resultado = await this.health.prontidao();
    if (resultado.status !== "ready") res.status(503);
    return resultado;
  }
}

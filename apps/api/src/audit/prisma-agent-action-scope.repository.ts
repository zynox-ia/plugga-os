import { Inject, Injectable } from "@nestjs/common";
import { alcancaTela, type Tela } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { AgentActionScope } from "./agent-action-scope";

const telas: Record<string, Tela> = { client: "crm.clientes", deal: "crm.pipelines", opportunity: "crm.pipelines", contract: "crm.contratos" };

@Injectable()
export class PrismaAgentActionScope extends AgentActionScope {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) { super(); }

  async permite(principal: AuthPrincipal, entityType: string, entityId: string): Promise<boolean> {
    const tela = Object.hasOwn(telas, entityType) ? telas[entityType] : undefined;
    if (!tela || !alcancaTela(principal.acesso, tela) || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(entityId)) return false;
    return this.prisma.comContexto(async (tx) => {
      const consulta = { where: { id: entityId }, select: { id: true } };
      const registro = entityType === "client" ? await tx.client.findFirst(consulta)
        : entityType === "deal" ? await tx.deal.findFirst(consulta)
          : entityType === "opportunity" ? await tx.opportunity.findFirst(consulta)
            : await tx.contract.findFirst(consulta);
      return registro !== null;
    });
  }
}

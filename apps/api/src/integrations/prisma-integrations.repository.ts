import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import {
  IntegrationsRepository,
  type StoredIntegrationSummary,
} from "./integrations.repository";

@Injectable()
export class PrismaIntegrationsRepository extends IntegrationsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  findAll(): Promise<StoredIntegrationSummary[]> {
    return this.prisma.integration.findMany({
      orderBy: { key: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        mode: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        owner: true,
        updatedAt: true,
      },
      // 🔒 SEGURANÇA [VULN-2, auditoria zero-trust]: o catálogo de integrações
      // é semeado uma vez e não cresce por ação de usuário — o risco real de
      // DoS aqui é baixo, mas o teto entra por consistência defensiva com o
      // resto da correção (CWE-770).
      take: 200,
    });
  }
}

import { Inject, Injectable } from "@nestjs/common";

import type { IntegrationMode } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { PrismaService } from "../prisma/prisma.service";
import {
  IntegrationsRepository,
  type ResultadoDaTrocaDeModo,
  type StoredIntegrationSummary,
} from "./integrations.repository";

@Injectable()
export class PrismaIntegrationsRepository extends IntegrationsRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {
    super();
  }

  async findModeByKey(key: string): Promise<IntegrationMode | null> {
    const integration = await this.prisma.integration.findUnique({
      where: { key },
      select: { mode: true },
    });
    return integration?.mode ?? null;
  }

  alterarModo(
    key: string,
    modo: IntegrationMode,
    autorId: string,
  ): Promise<ResultadoDaTrocaDeModo | null> {
    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.integration.findUnique({
        where: { key },
        select: { mode: true },
      });
      if (!existente) return null;
      if (existente.mode === modo) return { anterior: modo, atual: modo };

      await tx.integration.update({ where: { key }, data: { mode: modo } });
      await this.auditoria.append(tx, {
        eventName: "integrations.mode.changed",
        entityType: "integration",
        entityId: key,
        actorType: "user",
        actorId: autorId,
        // Só os dois modos: nada de credencial, URL ou dado de cliente.
        payload: { de: existente.mode, para: modo },
      });
      return { anterior: existente.mode, atual: modo };
    });
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

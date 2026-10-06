import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { HealthRepository } from "./health.repository";

@Injectable()
export class PrismaHealthRepository extends HealthRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async pingBanco(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}

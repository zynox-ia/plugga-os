import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import {
  ConexaoGoogleCalendarRepository,
  type ConexaoGuardada,
  type GravarConexao,
} from "./conexao-google-calendar.repository";

@Injectable()
export class PrismaConexaoGoogleCalendarRepository extends ConexaoGoogleCalendarRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async buscar(userId: string): Promise<ConexaoGuardada | null> {
    return this.prisma.comContexto((tx) => tx.conexaoGoogleCalendar.findUnique({ where: { userId } }));
  }

  async gravar(dados: GravarConexao): Promise<void> {
    const { userId, ...campos } = dados;
    await this.prisma.comContexto((tx) => tx.conexaoGoogleCalendar.upsert({
      where: { userId },
      create: { userId, ...campos },
      update: { ...campos, conectadoEm: new Date() },
    }));
  }

  async apagar(userId: string): Promise<void> {
    // `deleteMany`: apagar o que não existe não é erro.
    await this.prisma.comContexto((tx) => tx.conexaoGoogleCalendar.deleteMany({ where: { userId } }));
  }
}

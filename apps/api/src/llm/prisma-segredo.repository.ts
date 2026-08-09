import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import {
  SegredoRepository,
  type GravarSegredo,
  type SegredoGuardado,
} from "./segredo.repository.js";

@Injectable()
export class PrismaSegredoRepository extends SegredoRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async buscar(chave: string): Promise<SegredoGuardado | null> {
    const linha = await this.prisma.segredoDoSistema.findUnique({ where: { chave } });
    if (!linha) return null;

    return {
      valorCifrado: linha.valorCifrado,
      iv: linha.iv,
      tag: linha.tag,
      ultimosQuatro: linha.ultimosQuatro,
      atualizadoPor: linha.atualizadoPor,
      atualizadoEm: linha.atualizadoEm,
    };
  }

  async gravar(dados: GravarSegredo): Promise<void> {
    const { chave, ...campos } = dados;
    // `upsert` e não `create`: trocar a chave é o caso comum, não a exceção.
    await this.prisma.segredoDoSistema.upsert({
      where: { chave },
      create: { chave, ...campos },
      update: campos,
    });
  }

  async apagar(chave: string): Promise<void> {
    // `deleteMany` para apagar o que não existe não ser erro: quem clica em
    // "apagar" quer o mesmo estado final nos dois casos.
    await this.prisma.segredoDoSistema.deleteMany({ where: { chave } });
  }
}

import { describe, expect, it } from "vitest";

import type { PrismaService } from "../prisma/prisma.service";
import { PrismaAuthRepository } from "./prisma-auth.repository";

/**
 * A coluna `users.id` é UUID, e o Postgres recusa a conversão de qualquer outra
 * coisa — o erro sobe como 500, não como "não encontrado".
 *
 * Isso apareceu na tela de Equipe: o escape hatch de desenvolvimento
 * (`x-dev-principal: user:andre`) carrega id sintético, `actorScope` passava
 * direto para a busca e a tela inteira quebrava. O dublê em memória dos testes
 * de equipe não pega o caso, porque um `Map` aceita qualquer chave; só o
 * repositório real recusa.
 */
function prismaQueNuncaDeveSerChamado(): PrismaService {
  return {
    user: {
      findUnique: () => {
        throw new Error("o banco não deveria ser consultado com id inválido");
      },
    },
  } as unknown as PrismaService;
}

describe("PrismaAuthRepository.findUserById", () => {
  const repositorio = new PrismaAuthRepository(prismaQueNuncaDeveSerChamado());

  it("devolve null para id sintético do escape hatch, sem tocar no banco", async () => {
    await expect(repositorio.findUserById("user:andre")).resolves.toBeNull();
  });

  it.each(["", "openclaw", "123", "nao-e-uuid", "fcb7de1f-346c-4d4c-8ae7"])(
    "devolve null para %j",
    async (id) => {
      await expect(repositorio.findUserById(id)).resolves.toBeNull();
    },
  );

  it("consulta o banco quando o id tem forma de UUID", async () => {
    // Aqui a exceção é o resultado esperado: prova que a guarda deixou passar.
    await expect(
      repositorio.findUserById("fcb7de1f-346c-4d4c-8ae7-f3435235f217"),
    ).rejects.toThrow(/não deveria ser consultado/);
  });
});

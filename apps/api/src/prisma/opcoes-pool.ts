import type { Prisma } from "@prisma/client";

export function opcoesDoPool(variavel: "AUTH_DATABASE_URL" | "JOBS_DATABASE_URL", obrigatorio = true): Prisma.PrismaClientOptions | undefined {
  const url = process.env[variavel]?.trim();
  if (!obrigatorio) return url ? { datasourceUrl: url } : undefined;
  const testeUnitario = process.env.NODE_ENV === "test" && process.env.RUN_RLS_INTEGRATION_TESTS !== "true";
  if (!url) {
    if (testeUnitario) return { datasourceUrl: process.env.DATABASE_URL };
    throw new Error(`${variavel} é obrigatória para o pool isolado.`);
  }
  if (!testeUnitario) {
    const outras = [process.env.DATABASE_URL, process.env[variavel === "AUTH_DATABASE_URL" ? "JOBS_DATABASE_URL" : "AUTH_DATABASE_URL"]];
    try {
      const login = decodeURIComponent(new URL(url).username);
      if (outras.some((outra) => outra && decodeURIComponent(new URL(outra).username) === login)) {
        throw new Error("login repetido");
      }
    } catch {
      // Não propagar a URL/credencial em erros de parsing ou configuração.
      throw new Error(`${variavel} exige URL válida e login distinto dos outros pools.`);
    }
  }
  return { datasourceUrl: url };
}

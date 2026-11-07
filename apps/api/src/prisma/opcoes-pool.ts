import type { Prisma } from "@prisma/client";

export function opcoesDoPool(variavel: "AUTH_DATABASE_URL" | "JOBS_DATABASE_URL", obrigatorio = true): Prisma.PrismaClientOptions | undefined {
  const url = process.env[variavel]?.trim();
  const testeUnitario = process.env.NODE_ENV === "test" && process.env.RUN_RLS_INTEGRATION_TESTS !== "true";
  if (!url) {
    if (!obrigatorio) return undefined;
    if (testeUnitario) return { datasourceUrl: process.env.DATABASE_URL };
    throw new Error(`${variavel} é obrigatória para o pool isolado.`);
  }
  if (!testeUnitario) {
    const outras = [process.env.DATABASE_URL, process.env[variavel === "AUTH_DATABASE_URL" ? "JOBS_DATABASE_URL" : "AUTH_DATABASE_URL"]];
    try {
      const destino = new URL(url);
      const origem = new URL(process.env.DATABASE_URL ?? "");
      if (destino.protocol !== "postgresql:" || destino.hostname !== origem.hostname || destino.port !== origem.port || destino.pathname !== origem.pathname) {
        throw new Error("banco divergente");
      }
      const login = decodeURIComponent(destino.username);
      if (outras.some((outra) => outra && decodeURIComponent(new URL(outra).username) === login)) {
        throw new Error("login repetido");
      }
    } catch {
      // Não propagar a URL/credencial em erros de parsing ou configuração.
      throw new Error(`${variavel} exige o mesmo banco e um login distinto dos outros pools.`);
    }
  }
  return { datasourceUrl: url };
}

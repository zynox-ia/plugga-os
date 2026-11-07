import { afterEach, describe, expect, it, vi } from "vitest";

import { PrismaAuthService } from "./prisma-auth.service";
import { PrismaJobsService } from "./prisma-jobs.service";
// eslint-disable-next-line no-restricted-imports -- Verifica a proteção do pool público de banco.
import { PrismaService } from "./prisma.service";

const seguro = {
  loginSeguro: true, grupoCorreto: true, semOutrosPools: true,
  semPapelPrivilegiado: true, semDono: true, semDDL: true,
  semTruncate: true, escopoDoPool: true, rlsAtiva: true,
};

afterEach(() => vi.unstubAllEnvs());

describe("pools de banco isolados", () => {
  it("não abre conexão no boot de testes unitários", async () => {
    const prisma = new PrismaService();
    const auth = new PrismaAuthService();
    const jobs = new PrismaJobsService();
    for (const pool of [prisma, auth, jobs]) {
      const consulta = vi.spyOn(pool, "$queryRaw").mockRejectedValue(new Error("conexão proibida"));
      await expect(pool.onModuleInit()).resolves.toBeUndefined();
      expect(consulta).not.toHaveBeenCalled();
    }
  });

  it("não permite usar DATABASE_URL como pool auth fora dos testes", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://app:sintetica@127.0.0.1:55433/plugga_os_test");
    vi.stubEnv("AUTH_DATABASE_URL", "");
    expect(() => new PrismaAuthService()).toThrow(/AUTH_DATABASE_URL/);
    vi.stubEnv("AUTH_DATABASE_URL", process.env.DATABASE_URL);
    expect(() => new PrismaAuthService()).toThrow(/distinto/);
  });

  it("exige pool próprio de jobs quando o worker está habilitado", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JOBS_ENABLED", "true");
    vi.stubEnv("JOBS_DATABASE_URL", "");
    expect(() => new PrismaJobsService()).toThrow(/JOBS_DATABASE_URL/);
  });

  it.each([
    "postgresql://auth:sintetica@externo.invalid:55433/plugga_os_test",
    "postgresql://auth:sintetica@127.0.0.1:55434/plugga_os_test",
    "postgresql://auth:sintetica@127.0.0.1:55433/outro_banco",
    "https://auth:sintetica@127.0.0.1:55433/plugga_os_test",
  ])("recusa pool apontando para outro destino sem expor a URL", (url) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://app:sintetica@127.0.0.1:55433/plugga_os_test");
    vi.stubEnv("AUTH_DATABASE_URL", url);
    expect(() => new PrismaAuthService()).toThrow("AUTH_DATABASE_URL exige o mesmo banco e um login distinto dos outros pools.");
  });

  it("não usa fallback auth em integração RLS e não expõe URL inválida no erro", () => {
    vi.stubEnv("RUN_RLS_INTEGRATION_TESTS", "true");
    vi.stubEnv("AUTH_DATABASE_URL", "");
    expect(() => new PrismaAuthService()).toThrow(/AUTH_DATABASE_URL/);
    vi.stubEnv("AUTH_DATABASE_URL", "endereco-invalido-sintetico");
    try {
      new PrismaAuthService();
      expect.fail("URL inválida não pode ser aceita");
    } catch (erro) {
      expect(erro).toBeInstanceOf(Error);
      expect((erro as Error).message).not.toContain("endereco-invalido-sintetico");
    }
  });

  it("valida o runtime de desenvolvimento e oculta detalhes de erro de conexão", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const pool = new PrismaService();
    const consulta = vi.spyOn(pool, "$queryRaw").mockRejectedValue(new Error("detalhe privado sintético"));
    await expect(pool.onModuleInit()).rejects.toThrow("Não foi possível validar o isolamento do pool plugga_runtime.");
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it.each(Object.keys(seguro) as Array<keyof typeof seguro>)("recusa papel com %s falso no boot", async (campo) => {
    vi.stubEnv("RUN_RLS_INTEGRATION_TESTS", "true");
    const pool = new PrismaService();
    vi.spyOn(pool, "$queryRaw").mockResolvedValue([{ ...seguro, [campo]: false }]);
    await expect(pool.onModuleInit()).rejects.toThrow(/plugga_runtime/);
  });

  it("falha fechado quando a consulta de privilégios não produz resultado", async () => {
    vi.stubEnv("RUN_RLS_INTEGRATION_TESTS", "true");
    const pool = new PrismaService();
    vi.spyOn(pool, "$queryRaw").mockResolvedValue([]);
    await expect(pool.onModuleInit()).rejects.toThrow(/plugga_runtime/);
  });

  it("valida cada pool quando há infraestrutura RLS explícita", async () => {
    vi.stubEnv("RUN_RLS_INTEGRATION_TESTS", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://app:sintetica@127.0.0.1:55433/plugga_os_test");
    vi.stubEnv("AUTH_DATABASE_URL", "postgresql://auth:sintetica@127.0.0.1:55433/plugga_os_test");
    vi.stubEnv("JOBS_DATABASE_URL", "postgresql://jobs:sintetica@127.0.0.1:55433/plugga_os_test");
    vi.stubEnv("JOBS_ENABLED", "true");
    for (const pool of [new PrismaService(), new PrismaAuthService(), new PrismaJobsService()]) {
      const consulta = vi.spyOn(pool, "$queryRaw").mockResolvedValue([seguro]);
      await expect(pool.onModuleInit()).resolves.toBeUndefined();
      expect(consulta).toHaveBeenCalledTimes(1);
    }
  });
});

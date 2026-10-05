/**
 * Não regressão das bases que a spec 002 manda preservar (FR-080, constituição V).
 * A spec 002 mexe em muita coisa; estas são as proteções que já funcionam e que
 * nenhuma fatia pode enfraquecer sem que esta suíte fique vermelha. Cada teste
 * diz qual proteção guarda. Os que olham o texto do código existem porque a
 * proteção vive em uma linha de configuração (cookie, compose, schema), e apagar
 * essa linha não quebraria nenhum outro teste.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { argon2Options } from "../src/auth/argon2-options";
import { PasswordService } from "../src/auth/password.service";
import { SessionService } from "../src/auth/session.service";
import { validateEnvironment } from "../src/config/environment";
import { generateOpaqueToken, hashToken } from "../src/core/auth/token.util";

const API = path.resolve(__dirname, "..");
const RAIZ = path.resolve(API, "../..");
const ler = (relativo: string, base = API): string => readFileSync(path.join(base, relativo), "utf8");

describe("sessão opaca guardada só por hash", () => {
  it("o token é aleatório, e o hash é SHA-256 em hexadecimal, diferente do valor bruto", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes em base64url
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });

  it("SessionService.issue grava o hash e devolve o valor bruto só para o cookie", async () => {
    const createSession = vi.fn().mockResolvedValue(undefined);
    const cache = { set: vi.fn().mockResolvedValue(undefined) };
    const config = { get: (_k: string, padrao: unknown) => padrao };
    const servico = new SessionService({ createSession } as never, config as never, cache as never);

    const bruto = await servico.issue({ id: "u1" } as never, { ip: "127.0.0.1" });

    const gravado = createSession.mock.calls[0]![0] as { tokenHash: string };
    expect(gravado.tokenHash).toBe(hashToken(bruto));
    expect(JSON.stringify(createSession.mock.calls)).not.toContain(bruto);
    expect(JSON.stringify(cache.set.mock.calls)).not.toContain(bruto);
  });
});

describe("cookie de sessão", () => {
  const controller = ler("src/auth/auth.controller.ts");

  it("é assinado, httpOnly, SameSite=Lax e Secure em produção, ao criar e ao limpar", () => {
    // `clearCookieOptions` é a fonte; `cookieOptions` (criar) a herda por spread.
    expect(controller).toMatch(/clearCookieOptions\(\): CookieOptions \{[\s\S]*?signed: true,[\s\S]*?httpOnly: true,[\s\S]*?sameSite: "lax",/);
    expect(controller).toMatch(/\.\.\.this\.clearCookieOptions\(\)/);
    expect(controller).toMatch(/nodeEnv === "production"/);
  });
});

describe("senha com Argon2id e tempo igual para conta inexistente", () => {
  const senhas = new PasswordService();

  it("usa Argon2id nos parâmetros do ADR-0008 ou mais fortes", () => {
    expect(argon2Options.memoryCost).toBeGreaterThanOrEqual(19_456);
    expect(argon2Options.timeCost).toBeGreaterThanOrEqual(2);
  });

  it("gera hash argon2id, confere a senha certa e recusa a errada", async () => {
    const hash = await senhas.hash("senha-sintetica-de-teste");

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await senhas.verify(hash, "senha-sintetica-de-teste")).toBe(true);
    expect(await senhas.verify(hash, "outra-senha")).toBe(false);
    expect(await senhas.verify("isto-nao-e-um-hash", "x")).toBe(false);
  });

  it("o login de conta inexistente paga o custo de um verify real", () => {
    expect(ler("src/auth/auth.service.ts")).toContain("verifyAgainstDummy");
    expect(ler("src/auth/password.service.ts")).toMatch(/async verifyAgainstDummy[\s\S]*this\.verify\(/);
  });
});

describe("tokens de convite e de redefinição são de uso único", () => {
  const repositorio = ler("src/auth/prisma-auth.repository.ts");

  it("o consumo é condicional a `consumedAt: null`, para a segunda tentativa não valer", () => {
    expect(repositorio).toMatch(/where: \{ id: tokenId, consumedAt: null \}/);
    expect(repositorio).toMatch(/tokenHash, type, consumedAt: null, expiresAt: \{ gt: now \}/);
  });

  it("só o hash do token é guardado", () => {
    expect(ler("src/auth/auth-token-issuer.service.ts")).toContain("tokenHash: hashToken(rawToken)");
  });
});

describe("validação do ambiente na inicialização", () => {
  it("ambiente vazio falha com mensagem que diz o que falta, em vez de subir meio configurado", () => {
    expect(() => validateEnvironment({})).toThrow(/Invalid environment configuration/);
  });
});

describe("TRUST_PROXY=true é recusado em produção", () => {
  it("o bootstrap lança em produção (o teste comportamental está em src/configure-app.spec.ts)", () => {
    expect(ler("src/configure-app.ts")).toMatch(/trustProxy === true && nodeEnv === "production"/);
  });
});

describe("travas otimistas (updateMany condicionado)", () => {
  // Piso = quantas existem hoje. Só pode subir: perder uma é voltar a ter corrida.
  const piso: Record<string, number> = {
    "src/commercial/prisma-commercial.repository.ts": 5,
    "src/obras/prisma-obras.repository.ts": 1,
    "src/compras/prisma-compras.repository.ts": 2,
    "src/auth/prisma-auth.repository.ts": 5,
  };

  it.each(Object.entries(piso))("%s mantém ao menos %i updateMany", (arquivo, minimo) => {
    const total = ler(arquivo).match(/\.updateMany\(/g)?.length ?? 0;
    expect(total).toBeGreaterThanOrEqual(minimo);
  });
});

describe("tempo e dinheiro no banco", () => {
  const schema = ler("prisma/schema.prisma");

  it("todo DateTime é timestamptz", () => {
    const soltos = schema
      .split("\n")
      .filter((l) => /^\s+\w+\s+DateTime\??\s/.test(l) && !l.includes("@db.Timestamptz"));
    expect(soltos).toEqual([]);
  });

  it("não há Float no schema (valor monetário e quantidade são Decimal)", () => {
    const flutuantes = schema.split("\n").filter((l) => /^\s+\w+\s+Float\??(\s|$)/.test(l));
    expect(flutuantes).toEqual([]);
    expect(schema.match(/\sDecimal/g)?.length ?? 0).toBeGreaterThan(20);
  });
});

describe("gatilhos append-only e papel de banco restrito", () => {
  it("event_log e agent_actions têm gatilho que recusa UPDATE e DELETE (a prova no banco está em test:db)", () => {
    const pasta = path.join(API, "prisma/migrations");
    const sql = readdirSync(pasta)
      .map((m) => path.join(pasta, m, "migration.sql"))
      .map((f) => {
        try {
          return readFileSync(f, "utf8");
        } catch {
          return "";
        }
      })
      .join("\n");

    expect(sql).toContain("is append-only; % is not allowed");
    expect(sql).toMatch(/TRIGGER[^;]*ON "?event_log"?/i);
    expect(sql).toMatch(/TRIGGER[^;]*ON "?agent_actions"?/i);
  });

  it("a API em produção conecta com o papel `plugga_app`, não com o dono do banco", () => {
    const compose = ler("compose.yaml", RAIZ);

    expect(compose).toMatch(/DATABASE_URL: postgresql:\/\/\$\{APP_DB_USER:-plugga_app\}:/);
  });
});

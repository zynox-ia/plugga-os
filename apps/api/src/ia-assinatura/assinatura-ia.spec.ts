import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ContaDeAssinatura, ProvedorDeAssinatura } from "@plugga/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { AssinaturaIaService } from "./assinatura-ia.service";
import { CliProxyHttpAdapter } from "./cliproxy-http.adapter";
import { CliProxyFalhouError, CliProxyPort } from "./cliproxy.port";

class CofreEmMemoria extends SegredoRepository {
  linhas = new Map<string, SegredoGuardado>();
  async buscar(chave: string): Promise<SegredoGuardado | null> { return this.linhas.get(chave) ?? null; }
  async gravar(d: GravarSegredo): Promise<void> { this.linhas.set(d.chave, { ...d, atualizadoEm: new Date("2026-11-13T10:00:00Z") }); }
  async apagar(chave: string): Promise<void> { this.linhas.delete(chave); }
}

function montar(proxyPronto = true) {
  const cofre = new CofreEmMemoria();
  const contas: Record<ProvedorDeAssinatura, ContaDeAssinatura[]> = {
    claude: [{ arquivo: "claude-ana.json", email: "ana@teste.local" }],
    codex: [{ arquivo: "codex-bia.json", email: null }],
  };
  const proxy = {
    configurado: vi.fn(() => proxyPronto),
    saude: vi.fn(async () => true),
    iniciarLogin: vi.fn(async () => ({ url: "https://auth.exemplo.test/login?x=1", estado: "estado-1" })),
    situacaoDoLogin: vi.fn(async () => "aguardando" as const),
    listarContas: vi.fn(async (p: ProvedorDeAssinatura) => contas[p]),
    removerConta: vi.fn(async () => undefined),
    listarModelos: vi.fn(async () => ["claude-modelo-a", "claude-modelo-b"]),
  };
  const eventos: { eventName: string; actorId: string | null; payload: unknown }[] = [];
  const auditoria = { appendEvent: vi.fn(async (e: { eventName: string; actorId: string | null; payload: unknown }) => { eventos.push(e); }), appendTrail: vi.fn() } as unknown as AuditPort;
  return { servico: new AssinaturaIaService(cofre, proxy as unknown as CliProxyPort, auditoria), cofre, proxy, eventos };
}

const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;
beforeEach(() => { process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
afterEach(() => {
  vi.unstubAllGlobals();
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("IA pela assinatura: as travas", () => {
  it("sem o aceite do risco registrado o login nem começa", async () => {
    const { servico, proxy, eventos } = montar();

    await expect(servico.iniciarLogin("claude", "dev")).rejects.toThrow(ConflictException);

    expect(proxy.iniciarLogin).not.toHaveBeenCalled();
    expect(eventos).toHaveLength(0);
  });

  it("com o aceite, o login começa; e o aceite é de um provedor só", async () => {
    const { servico, proxy } = montar();
    await servico.aceitarRisco("claude", "dev-1");

    expect(await servico.iniciarLogin("claude", "dev-1")).toEqual({ url: "https://auth.exemplo.test/login?x=1", estado: "estado-1" });
    expect(proxy.iniciarLogin).toHaveBeenCalledWith("claude");
    await expect(servico.iniciarLogin("codex", "dev-1")).rejects.toThrow(ConflictException);
  });

  it("o aceite fica guardado cifrado e aparece no estado com quem e quando", async () => {
    const { servico, cofre } = montar();

    const estado = await servico.aceitarRisco("codex", "dev-1");

    expect(estado).toMatchObject({ provedor: "codex", riscoAceito: true, riscoAceitoPor: "dev-1" });
    expect(estado.riscoAceitoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(cofre.linhas.get("integracao.assinatura.codex")?.valorCifrado).not.toContain("dev-1");
  });

  it("aceite que não decifra mais não vale: pede de novo", async () => {
    const { servico, cofre } = montar();
    await servico.aceitarRisco("claude", "dev");
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    expect((await servico.estado("claude")).riscoAceito).toBe(false);
    await expect(servico.iniciarLogin("claude", "dev")).rejects.toThrow(ConflictException);
    expect(cofre.linhas.size).toBe(1);
  });

  it("audita aceite, login e remoção com o provedor e sem token", async () => {
    const { servico, eventos } = montar();

    await servico.aceitarRisco("claude", "dev-1");
    await servico.iniciarLogin("claude", "dev-1");
    await servico.removerConta("claude", "claude-ana.json", "dev-1");

    expect(eventos.map((e) => e.eventName)).toEqual([
      "integracao.ia_assinatura.risk_accepted",
      "integracao.ia_assinatura.login_started",
      "integracao.ia_assinatura.account_removed",
    ]);
    expect(eventos.every((e) => JSON.stringify(e.payload) === '{"provedor":"claude"}')).toBe(true);
  });

  it("só remove conta do próprio provedor: o nome do arquivo vem da tela e não vale por si", async () => {
    const { servico, proxy } = montar();

    await expect(servico.removerConta("claude", "codex-bia.json", "dev")).rejects.toThrow(NotFoundException);
    await expect(servico.removerConta("claude", "../../etc/passwd", "dev")).rejects.toThrow(NotFoundException);

    expect(proxy.removerConta).not.toHaveBeenCalled();
  });
});

describe("IA pela assinatura: estado e teste", () => {
  it("lista as contas do provedor quando o proxy responde", async () => {
    const { servico } = montar();

    expect(await servico.estado("claude")).toMatchObject({ proxy: "ok", contas: [{ arquivo: "claude-ana.json", email: "ana@teste.local" }] });
  });

  it("proxy sem configuração, fora do ar ou com erro vira estado, não exceção", async () => {
    expect((await montar(false).servico.estado("claude")).proxy).toBe("nao_configurado");

    const fora = montar();
    fora.proxy.saude.mockResolvedValueOnce(false);
    expect((await fora.servico.estado("claude")).proxy).toBe("fora_do_ar");

    const erro = montar();
    erro.proxy.saude.mockRejectedValueOnce(new CliProxyFalhouError("chave_recusada"));
    expect((await erro.servico.estado("claude")).proxy).toBe("fora_do_ar");
  });

  it("o teste confere os modelos do proxy; sem nenhum, é resposta inesperada", async () => {
    const { servico, proxy } = montar();

    expect(await servico.testar("claude")).toEqual({ modelos: ["claude-modelo-a", "claude-modelo-b"] });
    proxy.listarModelos.mockResolvedValueOnce([]);
    await expect(servico.testar("claude")).rejects.toThrow(CliProxyFalhouError);
  });
});

describe("CliProxyHttpAdapter", () => {
  const CHAVE_GERENCIA = "chave-de-gerenciamento-0123456789abcdef";
  const CHAVE_CLIENTE = "chave-de-cliente-0123456789abcdef";
  const adaptador = (extra: Record<string, unknown> = {}) =>
    new CliProxyHttpAdapter(new ConfigService({ CLIPROXY_URL: "http://127.0.0.1:8317/", CLIPROXY_MANAGEMENT_KEY: CHAVE_GERENCIA, CLIPROXY_API_KEY: CHAVE_CLIENTE, ...extra }));
  const responder = (status: number, corpo: unknown = {}) => {
    const mock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(corpo), { status }));
    vi.stubGlobal("fetch", mock);
    return mock;
  };
  const motivo = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as CliProxyFalhouError).motivo;

  it("não está configurado sem URL e sem chave de gerenciamento", () => {
    expect(adaptador().configurado()).toBe(true);
    expect(adaptador({ CLIPROXY_URL: undefined }).configurado()).toBe(false);
    expect(adaptador({ CLIPROXY_MANAGEMENT_KEY: undefined }).configurado()).toBe(false);
  });

  it("pede o login do provedor certo com a chave de gerenciamento", async () => {
    const chamada = responder(200, { url: "https://claude.ai/oauth/authorize?x=1", state: "abc" });

    expect(await adaptador().iniciarLogin("claude")).toEqual({ url: "https://claude.ai/oauth/authorize?x=1", estado: "abc" });
    const [url, init] = chamada.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8317/v0/management/anthropic-auth-url");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${CHAVE_GERENCIA}`);

    responder(200, { url: "https://auth.openai.com/oauth/authorize", state: "def" });
    await adaptador().iniciarLogin("codex");
    expect(String((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toBe("http://127.0.0.1:8317/v0/management/codex-auth-url");
  });

  it("só aceita endereço de login https; qualquer outro é resposta inesperada", async () => {
    for (const url of ["http://inseguro.test/x", "javascript:alert(1)", "file:///etc/passwd", ""]) {
      responder(200, { url, state: "abc" });
      expect(await motivo(adaptador().iniciarLogin("claude"))).toBe("resposta_inesperada");
    }
  });

  it("traduz a situação do login", async () => {
    for (const [bruto, esperado] of [["wait", "aguardando"], ["ok", "concluido"], ["error", "erro"]] as const) {
      responder(200, { status: bruto });
      expect(await adaptador().situacaoDoLogin("abc")).toBe(esperado);
    }
    responder(200, { status: "estranho" });
    expect(await motivo(adaptador().situacaoDoLogin("abc"))).toBe("resposta_inesperada");
  });

  it("separa as contas por provedor", async () => {
    responder(200, { files: [{ name: "claude-ana.json", email: "ana@teste.local" }, { name: "codex-bia.json", type: "codex" }, { name: "x.json", provider: "anthropic" }] });

    expect(await adaptador().listarContas("claude")).toEqual([{ arquivo: "claude-ana.json", email: "ana@teste.local" }, { arquivo: "x.json", email: null }]);
    responder(200, { files: [{ name: "claude-ana.json" }, { name: "codex-bia.json", type: "codex" }] });
    expect(await adaptador().listarContas("codex")).toEqual([{ arquivo: "codex-bia.json", email: null }]);
  });

  it("lista modelos com a chave de cliente (não a de gerenciamento) e filtra pelo provedor", async () => {
    const chamada = responder(200, { data: [{ id: "claude-modelo-a" }, { id: "gpt-modelo-b" }, { id: "gemini-x" }] });

    expect(await adaptador().listarModelos("claude")).toEqual(["claude-modelo-a"]);
    const [url, init] = chamada.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8317/v1/models");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${CHAVE_CLIENTE}`);
  });

  it("traduz as falhas e nunca vaza chave nem corpo", async () => {
    responder(401, { error: `chave ${CHAVE_GERENCIA} inválida` });
    const erro = (await adaptador().iniciarLogin("claude").then(() => null, (e: unknown) => e)) as Error;
    expect((erro as CliProxyFalhouError).motivo).toBe("chave_recusada");
    expect(`${erro.message} ${erro.stack ?? ""}`).not.toContain(CHAVE_GERENCIA);

    responder(502);
    expect(await motivo(adaptador().iniciarLogin("claude"))).toBe("fora_do_ar");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await motivo(adaptador().iniciarLogin("claude"))).toBe("fora_do_ar");
    expect(await motivo(adaptador({ CLIPROXY_URL: undefined }).iniciarLogin("claude"))).toBe("nao_configurado");
  });

  it("a saúde distingue proxy fora do ar de chave recusada", async () => {
    responder(200, { files: [] });
    expect(await adaptador().saude()).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await adaptador().saude()).toBe(false);
    responder(401);
    expect(await motivo(adaptador().saude())).toBe("chave_recusada");
  });
});

describe("a assinatura não chega a dado de cliente", () => {
  it("nenhum arquivo fora do módulo importa o serviço, o proxy ou o módulo de assinatura", () => {
    const raiz = path.resolve(__dirname, "..");
    const permitidos = new Set([path.join(raiz, "app.module.ts")]);
    const infratores: string[] = [];
    const varrer = (dir: string): void => {
      for (const nome of readdirSync(dir)) {
        const caminho = path.join(dir, nome);
        if (statSync(caminho).isDirectory()) {
          if (caminho !== path.join(raiz, "ia-assinatura") && nome !== "node_modules") varrer(caminho);
        } else if (caminho.endsWith(".ts") && !permitidos.has(caminho) && /ia-assinatura\//.test(readFileSync(caminho, "utf8"))) {
          infratores.push(path.relative(raiz, caminho));
        }
      }
    };
    varrer(raiz);

    expect(infratores).toEqual([]);
  });
});

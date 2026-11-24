import { randomBytes } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { BrevoCofreService, BrevoLeitura, type MaterialCifrado } from "./brevo-cofre.service";

/**
 * O Brevo conectado pela tela. As garantias que valem aqui:
 *
 * 1. a tela nunca recebe a chave, só os quatro últimos caracteres;
 * 2. o cofre vence o ambiente, senão um `.env` esquecido venceria a tela em silêncio;
 * 3. conectar e desconectar viram evento de auditoria, sem a chave;
 * 4. linha ilegível não derruba o envio: o sistema cai para o ambiente.
 */

class RepositorioEmMemoria extends SegredoRepository {
  linha: SegredoGuardado | null = null;

  async buscar(): Promise<SegredoGuardado | null> {
    return this.linha;
  }
  async gravar(dados: GravarSegredo): Promise<void> {
    this.linha = { ...dados, atualizadoEm: new Date("2026-11-12T10:00:00Z") };
  }
  async apagar(): Promise<void> {
    this.linha = null;
  }
}

class LeituraEmMemoria extends BrevoLeitura {
  constructor(private readonly repositorio: RepositorioEmMemoria) {
    super();
  }
  async lerCifrado(): Promise<MaterialCifrado | null> {
    const linha = this.repositorio.linha;
    return linha ? { valorCifrado: linha.valorCifrado, iv: linha.iv, tag: linha.tag } : null;
  }
}

function montar(ambiente: Record<string, unknown> = {}) {
  const repositorio = new RepositorioEmMemoria();
  const eventos: { eventName: string; actorId: string | null; payload: unknown }[] = [];
  const auditoria = {
    appendEvent: vi.fn(async (e: { eventName: string; actorId: string | null; payload: unknown }) => {
      eventos.push(e);
    }),
    appendTrail: vi.fn(),
  } as unknown as AuditPort;
  const servico = new BrevoCofreService(repositorio, new LeituraEmMemoria(repositorio), auditoria, new ConfigService(ambiente));
  return { servico, repositorio, eventos };
}

const ENTRADA = { chave: "xkeysib-credencial-de-teste-1234", remetenteNome: "Plugga", remetenteEmail: "no-reply@plugga.test" };
const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("Brevo no cofre", () => {
  it("guarda cifrado e entrega chave e remetente ao envio", async () => {
    const { servico, repositorio } = montar();

    await servico.gravar(ENTRADA, "andre");

    expect(repositorio.linha?.valorCifrado).not.toContain("xkeysib");
    expect(repositorio.linha?.valorCifrado).not.toContain("no-reply@plugga.test");
    expect(await servico.credenciais()).toEqual(ENTRADA);
  });

  it("não devolve a chave para a tela, só os quatro últimos e o remetente", async () => {
    const { servico } = montar();

    await servico.gravar(ENTRADA, "andre");
    const estado = await servico.estado();

    expect(estado).toMatchObject({
      conectado: true,
      origem: "cofre",
      mascara: "••••1234",
      remetente: { nome: "Plugga", email: "no-reply@plugga.test" },
      atualizadoPor: "andre",
    });
    expect(JSON.stringify(estado)).not.toContain("credencial");
  });

  it("faz o cofre vencer o ambiente", async () => {
    const { servico } = montar({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "chave-do-env" });

    await servico.gravar(ENTRADA, "andre");

    expect((await servico.credenciais())?.chave).toBe(ENTRADA.chave);
    expect((await servico.estado()).origem).toBe("cofre");
  });

  it("reporta o ambiente quando não há nada no cofre e o provedor é brevo", async () => {
    const { servico } = montar({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "chave-do-env", EMAIL_FROM_ADDRESS: "env@plugga.test" });

    expect(await servico.credenciais()).toBeNull();
    expect(await servico.estado()).toMatchObject({ conectado: true, origem: "ambiente", mascara: null, remetente: { email: "env@plugga.test" } });
  });

  it("reporta desconectado sem cofre e sem ambiente", async () => {
    const { servico } = montar();

    expect(await servico.estado()).toMatchObject({ conectado: false, origem: "nenhuma", remetente: null });
  });

  it("desconectar apaga o cofre e para de entregar credenciais", async () => {
    const { servico } = montar();
    await servico.gravar(ENTRADA, "andre");

    const estado = await servico.apagar("andre");

    expect(estado.conectado).toBe(false);
    expect(await servico.credenciais()).toBeNull();
  });

  it("audita conectar e desconectar sem carregar a chave", async () => {
    const { servico, eventos } = montar();

    await servico.gravar(ENTRADA, "andre");
    await servico.apagar("andre");

    expect(eventos.map((e) => e.eventName)).toEqual(["email.brevo.connected", "email.brevo.disconnected"]);
    expect(eventos.every((e) => e.actorId === "andre")).toBe(true);
    expect(JSON.stringify(eventos)).not.toContain("xkeysib");
  });

  it("não derruba o envio quando o segredo guardado não decifra mais", async () => {
    const { servico, repositorio } = montar();
    await servico.gravar(ENTRADA, "andre");
    // Chave-mestra rotacionada sem regravar: a linha não abre mais.
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    const outro = new BrevoCofreService(
      repositorio,
      new LeituraEmMemoria(repositorio),
      { appendEvent: vi.fn(), appendTrail: vi.fn() } as unknown as AuditPort,
      new ConfigService({}),
    );

    expect(await outro.credenciais()).toBeNull();
    expect((await outro.estado()).origem).toBe("cofre_ilegivel");
  });

  it("a troca pela tela vale na hora, sem esperar o cache", async () => {
    const { servico } = montar();
    await servico.gravar(ENTRADA, "andre");
    expect((await servico.credenciais())?.remetenteNome).toBe("Plugga");

    await servico.gravar({ ...ENTRADA, remetenteNome: "Waze Energia" }, "andre");

    expect((await servico.credenciais())?.remetenteNome).toBe("Waze Energia");
  });
});

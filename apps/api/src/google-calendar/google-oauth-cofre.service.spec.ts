import { randomBytes } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { GoogleOAuthCofreService, GoogleOAuthLeitura, type MaterialCifrado } from "./google-oauth-cofre.service";

/**
 * As credenciais do app OAuth do Google no cofre. As garantias que valem aqui:
 *
 * 1. a tela nunca recebe o client secret, só o client id e os quatro últimos caracteres do secret;
 * 2. o que vai ao banco está cifrado, e o consentimento lê pela leitura restrita;
 * 3. conectar e desconectar viram evento de auditoria, sem client id nem secret;
 * 4. linha ilegível não vira "conectado" nem derruba a leitura.
 */

class RepositorioEmMemoria extends SegredoRepository {
  linha: SegredoGuardado | null = null;

  async buscar(): Promise<SegredoGuardado | null> {
    return this.linha;
  }
  async gravar(dados: GravarSegredo): Promise<void> {
    this.linha = { ...dados, atualizadoEm: new Date("2026-11-13T10:00:00Z") };
  }
  async apagar(): Promise<void> {
    this.linha = null;
  }
}

class LeituraEmMemoria extends GoogleOAuthLeitura {
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
  const servico = new GoogleOAuthCofreService(repositorio, new LeituraEmMemoria(repositorio), auditoria, new ConfigService(ambiente));
  return { servico, repositorio, eventos };
}

const ENTRADA = {
  clientId: "1234567890-abcdefg.apps.googleusercontent.com",
  clientSecret: "GOCSPX-segredo-sintetico-9z8y",
};
const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("credenciais do Google no cofre", () => {
  it("guarda cifrado e entrega as credenciais ao consentimento", async () => {
    const { servico, repositorio } = montar();

    await servico.gravar(ENTRADA, "andre");

    expect(repositorio.linha?.valorCifrado).not.toContain("GOCSPX");
    expect(repositorio.linha?.valorCifrado).not.toContain("googleusercontent");
    expect(await servico.credenciais()).toEqual(ENTRADA);
  });

  it("não devolve o secret para a tela, só o client id e os quatro últimos caracteres", async () => {
    const { servico } = montar();

    await servico.gravar(ENTRADA, "andre");
    const estado = await servico.estado();

    expect(estado).toMatchObject({
      conectado: true,
      origem: "cofre",
      clientId: ENTRADA.clientId,
      mascara: "••••9z8y",
      atualizadoPor: "andre",
    });
    expect(JSON.stringify(estado)).not.toContain("segredo-sintetico");
  });

  it("informa a URI de redirecionamento e os escopos para o cadastro no Google Cloud", async () => {
    const { servico } = montar({ AUTH_APP_BASE_URL: "https://os.plugga.app.br/" });

    const estado = await servico.estado();

    expect(estado.urlDeRetorno).toBe("https://os.plugga.app.br/api/google/calendar/callback");
    expect(estado.escopos).toContain("https://www.googleapis.com/auth/calendar.events");
  });

  it("reporta desconectado quando não há nada no cofre", async () => {
    const { servico } = montar();

    expect(await servico.credenciais()).toBeNull();
    expect(await servico.estado()).toMatchObject({ conectado: false, origem: "nenhuma", clientId: null, mascara: null });
  });

  it("desconectar apaga o cofre e para de entregar credenciais", async () => {
    const { servico } = montar();
    await servico.gravar(ENTRADA, "andre");

    const estado = await servico.apagar("andre");

    expect(estado.conectado).toBe(false);
    expect(await servico.credenciais()).toBeNull();
  });

  it("audita conectar e desconectar sem carregar client id nem secret", async () => {
    const { servico, eventos } = montar();

    await servico.gravar(ENTRADA, "andre");
    await servico.apagar("andre");

    expect(eventos.map((e) => e.eventName)).toEqual(["google.oauth.connected", "google.oauth.disconnected"]);
    expect(eventos.every((e) => e.actorId === "andre")).toBe(true);
    const texto = JSON.stringify(eventos);
    expect(texto).not.toContain("GOCSPX");
    expect(texto).not.toContain("googleusercontent");
  });

  it("não derruba a leitura quando o segredo guardado não decifra mais, e não diz que está conectado", async () => {
    const { servico } = montar();
    await servico.gravar(ENTRADA, "andre");
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    expect(await servico.credenciais()).toBeNull();
    expect(await servico.estado()).toMatchObject({ conectado: false, origem: "cofre_ilegivel", clientId: null, mascara: null });
  });

  it("não derruba a leitura sem chave-mestra: a conexão fica indisponível", async () => {
    const { servico } = montar();
    await servico.gravar(ENTRADA, "andre");
    delete process.env.SECRETS_ENCRYPTION_KEY;

    expect(await servico.credenciais()).toBeNull();
  });

  it("uma falha na auditoria não desfaz a gravação", async () => {
    const { repositorio } = montar();
    const auditoria = { appendEvent: vi.fn().mockRejectedValue(new Error("event_log fora do ar")), appendTrail: vi.fn() };
    const comFalha = new GoogleOAuthCofreService(
      repositorio,
      new LeituraEmMemoria(repositorio),
      auditoria as unknown as AuditPort,
      new ConfigService({}),
    );

    await expect(comFalha.gravar(ENTRADA, "andre")).resolves.toMatchObject({ conectado: true });
  });
});

import { randomBytes } from "node:crypto";

import type { EntradaDoTelegram } from "@plugga/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { TelegramCofreService, TelegramLeitura, type MaterialCifrado } from "./telegram-cofre.service";
import { TelegramFalhouError, TelegramPort } from "./telegram.port";
import { TelegramNotificadorService } from "./telegram-notificador.service";

/**
 * O Telegram conectado pela tela. Garantias: o token nunca volta para a tela
 * (só os 4 últimos); conectar e desconectar são auditados sem o token; linha
 * ilegível não derruba quem avisa; e falha do Telegram nunca volta para quem pediu o aviso.
 */

class CofreEmMemoria extends SegredoRepository {
  linha: SegredoGuardado | null = null;
  async buscar(): Promise<SegredoGuardado | null> { return this.linha; }
  async gravar(d: GravarSegredo): Promise<void> { this.linha = { ...d, atualizadoEm: new Date("2026-11-13T10:00:00Z") }; }
  async apagar(): Promise<void> { this.linha = null; }
}

class LeituraDoCofre extends TelegramLeitura {
  constructor(private readonly cofre: CofreEmMemoria) { super(); }
  async lerCifrado(): Promise<MaterialCifrado | null> {
    const l = this.cofre.linha;
    return l ? { valorCifrado: l.valorCifrado, iv: l.iv, tag: l.tag } : null;
  }
}

const TOKEN = "123456789:AAH-segredo_do_bot_para_teste_0000000";
const ENTRADA: EntradaDoTelegram = { token: TOKEN, chatId: "-1001234567890", avisarNovoLead: true, avisarAtividadeAtrasada: false };

function montar() {
  const cofre = new CofreEmMemoria();
  const enviados: { token: string; chatId: string; texto: string }[] = [];
  const telegram = { enviar: vi.fn(async (token: string, chatId: string, texto: string) => { enviados.push({ token, chatId, texto }); }) };
  const eventos: { eventName: string; actorId: string | null; payload: unknown }[] = [];
  const auditoria = { appendEvent: vi.fn(async (e: { eventName: string; actorId: string | null; payload: unknown }) => { eventos.push(e); }), appendTrail: vi.fn() } as unknown as AuditPort;
  const servico = new TelegramCofreService(cofre, new LeituraDoCofre(cofre), telegram as unknown as TelegramPort, auditoria);
  const notificador = new TelegramNotificadorService(servico, telegram as unknown as TelegramPort);
  return { servico, notificador, cofre, telegram, enviados, eventos };
}

const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;
beforeEach(() => { process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
afterEach(() => {
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("Telegram no cofre", () => {
  it("guarda cifrado e entrega token e chat ao envio", async () => {
    const { servico, cofre } = montar();

    await servico.gravar(ENTRADA, "dev");

    expect(cofre.linha?.valorCifrado).not.toContain("AAH-segredo");
    expect(cofre.linha?.valorCifrado).not.toContain("1001234567890");
    expect(await servico.credenciais()).toEqual(ENTRADA);
  });

  it("não devolve o token para a tela, só os quatro últimos e a configuração", async () => {
    const { servico } = montar();

    const estado = await servico.gravar(ENTRADA, "dev");

    expect(estado).toMatchObject({ conectado: true, origem: "cofre", mascara: "••••0000", chatId: "-1001234567890", avisarNovoLead: true, avisarAtividadeAtrasada: false, atualizadoPor: "dev" });
    expect(JSON.stringify(estado)).not.toContain("AAH-segredo");
  });

  it("sem nada no cofre, está desconectado", async () => {
    expect(await montar().servico.estado()).toMatchObject({ conectado: false, origem: "nenhuma", mascara: null, chatId: null });
  });

  it("desconectar apaga e para de entregar credenciais", async () => {
    const { servico } = montar();
    await servico.gravar(ENTRADA, "dev");

    const estado = await servico.apagar("dev");

    expect(estado.conectado).toBe(false);
    expect(await servico.credenciais()).toBeNull();
  });

  it("audita conectar e desconectar sem o token", async () => {
    const { servico, eventos } = montar();

    await servico.gravar(ENTRADA, "dev-1");
    await servico.apagar("dev-1");

    expect(eventos.map((e) => e.eventName)).toEqual(["integracao.telegram.connected", "integracao.telegram.disconnected"]);
    expect(JSON.stringify(eventos)).not.toContain("AAH-segredo");
  });

  it("segredo que não decifra mais: desconectado, sem derrubar o envio", async () => {
    const { servico, cofre } = montar();
    await servico.gravar(ENTRADA, "dev");
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    const outro = new TelegramCofreService(cofre, new LeituraDoCofre(cofre), { enviar: vi.fn() } as unknown as TelegramPort, { appendEvent: vi.fn(), appendTrail: vi.fn() } as unknown as AuditPort);

    expect(await outro.credenciais()).toBeNull();
    expect(await outro.estado()).toMatchObject({ conectado: false, origem: "cofre_ilegivel" });
  });

  it("a mensagem de teste usa a conexão atual; sem conexão, recusa", async () => {
    const { servico, enviados } = montar();
    await expect(servico.enviarTeste()).rejects.toThrow(/não está conectado/);

    await servico.gravar(ENTRADA, "dev");
    await servico.enviarTeste();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ token: TOKEN, chatId: "-1001234567890" });
  });
});

describe("notificador do Telegram", () => {
  it("só envia o aviso que está ligado", async () => {
    const { servico, notificador, enviados } = montar();
    await servico.gravar(ENTRADA, "dev");

    expect(await notificador.avisarNovoLead({ cliente: "Maria" })).toBe(true);
    expect(await notificador.avisarAtividadeAtrasada({ titulo: "Visita", prazo: new Date("2026-11-12T15:00:00Z") })).toBe(false);

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.texto).toContain("<b>Novo lead</b>");
  });

  it("sem Telegram conectado, não envia e não falha", async () => {
    const { notificador, telegram } = montar();

    expect(await notificador.avisarNovoLead({ cliente: "Maria" })).toBe(false);
    expect(telegram.enviar).not.toHaveBeenCalled();
  });

  it("falha do Telegram nunca volta para quem pediu o aviso", async () => {
    const { servico, notificador, telegram } = montar();
    await servico.gravar({ ...ENTRADA, avisarAtividadeAtrasada: true }, "dev");
    telegram.enviar.mockRejectedValueOnce(new TelegramFalhouError("indisponivel"));
    telegram.enviar.mockRejectedValueOnce(new Error("explodiu"));

    expect(await notificador.avisarNovoLead({ cliente: "Maria" })).toBe(false);
    expect(await notificador.avisarAtividadeAtrasada({ titulo: "Visita", prazo: new Date() })).toBe(false);
  });

  it("desligar o aviso pela tela vale na hora", async () => {
    const { servico, notificador } = montar();
    await servico.gravar(ENTRADA, "dev");
    expect(await notificador.avisarNovoLead({ cliente: "Maria" })).toBe(true);

    await servico.gravar({ ...ENTRADA, avisarNovoLead: false }, "dev");

    expect(await notificador.avisarNovoLead({ cliente: "Maria" })).toBe(false);
  });
});

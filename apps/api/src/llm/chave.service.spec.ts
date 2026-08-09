import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditRepository } from "../audit/audit.repository";
import { ChaveDeLlmService } from "./chave.service.js";
import { cifrar } from "./cripto.js";
import {
  SegredoRepository,
  type GravarSegredo,
  type SegredoGuardado,
} from "./segredo.repository.js";

/**
 * O cofre da chave de API.
 *
 * Três garantias se provam aqui, e cada uma corresponde a uma forma de o
 * sistema falhar caro:
 *
 * 1. a tela nunca recebe a chave — só os quatro últimos;
 * 2. o banco vence o `.env`, senão uma variável esquecida faria a troca pela
 *    tela não valer, em silêncio, com a credencial errada em uso;
 * 3. troca de credencial vira evento de auditoria, porque "quem trocou e
 *    quando" é a primeira pergunta quando a conta do mês surpreende.
 */

class RepositorioEmMemoria extends SegredoRepository {
  linha: SegredoGuardado | null = null;

  async buscar(): Promise<SegredoGuardado | null> {
    return this.linha;
  }
  async gravar(dados: GravarSegredo): Promise<void> {
    this.linha = {
      valorCifrado: dados.valorCifrado,
      iv: dados.iv,
      tag: dados.tag,
      ultimosQuatro: dados.ultimosQuatro,
      atualizadoPor: dados.atualizadoPor,
      atualizadoEm: new Date("2026-08-09T04:00:00Z"),
    };
  }
  async apagar(): Promise<void> {
    this.linha = null;
  }
}

function montar() {
  const repositorio = new RepositorioEmMemoria();
  const eventos: { eventName: string; actorId: string | null }[] = [];
  const auditoria = {
    appendEvent: vi.fn(async (evento: { eventName: string; actorId: string | null }) => {
      eventos.push(evento);
    }),
    appendTrail: vi.fn(),
  } as unknown as AuditRepository;

  return { servico: new ChaveDeLlmService(repositorio, auditoria), repositorio, eventos };
}

const ambienteAnterior = process.env.OPENROUTER_API_KEY;
const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  if (ambienteAnterior === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ambienteAnterior;
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("cofre da chave de LLM", () => {
  it("guarda cifrado e devolve a chave para o gateway", async () => {
    const { servico, repositorio } = montar();

    await servico.gravar("sk-or-v1-credencial-de-teste", "andre");

    // No banco não há a chave em claro em lugar nenhum da linha.
    expect(repositorio.linha?.valorCifrado).not.toContain("sk-or-v1");
    expect(await servico.valor()).toBe("sk-or-v1-credencial-de-teste");
  });

  it("não devolve a chave para a tela, só os quatro últimos", async () => {
    const { servico } = montar();

    await servico.gravar("sk-or-v1-credencial-1234", "andre");
    const estado = await servico.estado();

    expect(estado.mascara).toBe("••••1234");
    expect(JSON.stringify(estado)).not.toContain("credencial");
  });

  it("faz o banco vencer o ambiente", async () => {
    // A pior falha possível seria a inversa: alguém troca a chave pela tela, um
    // `.env` esquecido continua valendo, e tudo segue funcionando com a
    // credencial errada sem sinal nenhum.
    process.env.OPENROUTER_API_KEY = "chave-do-env";
    const { servico } = montar();

    await servico.gravar("chave-da-tela", "andre");

    expect(await servico.valor()).toBe("chave-da-tela");
    expect((await servico.estado()).origem).toBe("banco");
  });

  it("cai para o ambiente quando não há chave guardada", async () => {
    process.env.OPENROUTER_API_KEY = "chave-do-env";
    const { servico } = montar();

    expect(await servico.valor()).toBe("chave-do-env");
    expect((await servico.estado()).origem).toBe("ambiente");
  });

  it("cai para o ambiente, sem estourar, quando o guardado não decifra", async () => {
    process.env.OPENROUTER_API_KEY = "chave-do-env";
    const { servico, repositorio } = montar();
    const cifrada = cifrar("chave-antiga");
    repositorio.linha = {
      valorCifrado: cifrada.conteudo,
      iv: cifrada.iv,
      tag: cifrada.tag,
      ultimosQuatro: "1234",
      atualizadoPor: "andre",
      atualizadoEm: new Date(),
    };
    // Chave-mestra rotacionada sem regravar o segredo: o caso real de quem troca
    // a variável e reinicia. A leitura de fatura não pode morrer por isso.
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    expect(await servico.valor()).toBe("chave-do-env");
  });

  it("registra na auditoria quem trocou, sem o valor", async () => {
    const { servico, eventos } = montar();

    await servico.gravar("sk-or-v1-credencial", "andre");

    expect(eventos[0]?.eventName).toBe("llm.chave.gravada");
    expect(eventos[0]?.actorId).toBe("andre");
    expect(JSON.stringify(eventos)).not.toContain("credencial");
  });

  it("apaga e volta a dizer que não há chave", async () => {
    const { servico, eventos } = montar();
    await servico.gravar("sk-or-v1-credencial", "andre");

    const estado = await servico.apagar("andre");

    expect(estado.configurada).toBe(false);
    expect(estado.origem).toBe("nenhuma");
    expect(eventos[1]?.eventName).toBe("llm.chave.apagada");
  });

  it("faz a troca valer sem esperar o cache expirar", async () => {
    const { servico } = montar();
    await servico.gravar("primeira", "andre");
    expect(await servico.valor()).toBe("primeira");

    await servico.gravar("segunda", "andre");

    // Sem invalidar o cache na gravação, a chave nova só passaria a valer
    // segundos depois — e quem trocou acharia que não funcionou.
    expect(await servico.valor()).toBe("segunda");
  });
});

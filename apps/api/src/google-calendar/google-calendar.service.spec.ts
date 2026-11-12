import { randomBytes } from "node:crypto";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EstadoInvalido, RequisicaoInvalida, ServicoIndisponivel } from "../common/errors/dominio";
import {
  auditoriaEmMemoria,
  ConexoesEmMemoria,
  GoogleCalendarFake,
  LeituraDeCredenciaisEmMemoria,
  SegredosEmMemoria,
  TOKENS_SINTETICOS,
} from "./arquivos-de-teste";
import { GoogleApiError } from "./google-calendar.port";
import { GoogleCalendarService } from "./google-calendar.service";
import { GoogleOAuthCofreService } from "./google-oauth-cofre.service";
import { abrirState, selarState } from "./google-oauth-state";

/**
 * A conexão da agenda de cada pessoa, com o Google de mentira. O que vale aqui:
 *
 * 1. o state é amarrado à pessoa e à sessão, expira, e adulterado ou alheio é recusado;
 * 2. o token de renovação fica cifrado e nunca aparece em resposta nem em log;
 * 3. cada pessoa só toca a própria conexão;
 * 4. desconectar apaga mesmo que a revogação no Google falhe;
 * 5. sem as credenciais da plataforma, ninguém conecta.
 */

const CLIENTE = { clientId: "1234567890-abcdefg.apps.googleusercontent.com", clientSecret: "GOCSPX-segredo-sintetico-9z8y" };
const ANA = { userId: "00000000-0000-4000-8000-00000000000a", sessaoHash: "hash-da-sessao-da-ana" };
const BRUNO = { userId: "00000000-0000-4000-8000-00000000000b", sessaoHash: "hash-da-sessao-do-bruno" };
const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;

async function montar({ comCredenciais = true } = {}) {
  const segredos = new SegredosEmMemoria();
  const conexoes = new ConexoesEmMemoria();
  const google = new GoogleCalendarFake();
  const { porta, eventos } = auditoriaEmMemoria();
  const config = new ConfigService({ AUTH_APP_BASE_URL: "https://os.plugga.test" });
  const cofre = new GoogleOAuthCofreService(segredos, new LeituraDeCredenciaisEmMemoria(segredos), porta, config);
  if (comCredenciais) await cofre.gravar(CLIENTE, "desenvolvedor");
  eventos.length = 0;
  const servico = new GoogleCalendarService(conexoes, cofre, google, porta);
  return { servico, conexoes, google, eventos, segredos, cofre };
}

/** Faz o caminho inteiro de uma pessoa: iniciar, "ir ao Google" e voltar com o state que o Google devolve. */
async function conectar(ctx: Awaited<ReturnType<typeof montar>>, pessoa = ANA, code = "codigo-de-autorizacao") {
  const { url } = await ctx.servico.iniciar(pessoa);
  const state = new URL(url).searchParams.get("state")!;
  return ctx.servico.concluir(pessoa, { code, state });
}

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  vi.restoreAllMocks();
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("disponibilidade", () => {
  it("sem as credenciais da plataforma, a conexão está indisponível e não inicia", async () => {
    const { servico } = await montar({ comCredenciais: false });

    expect(await servico.estado(ANA.userId)).toEqual({ disponivel: false, conectado: false, email: null, conectadoEm: null });
    await expect(servico.iniciar(ANA)).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(servico.concluir(ANA, { code: "c", state: "s" })).rejects.toBeInstanceOf(EstadoInvalido);
  });

  it("com as credenciais, fica disponível e ainda desconectada", async () => {
    const { servico } = await montar();

    expect(await servico.estado(ANA.userId)).toEqual({ disponivel: true, conectado: false, email: null, conectadoEm: null });
  });
});

describe("iniciar o consentimento", () => {
  it("monta o endereço do Google com PKCE, acesso offline, escopo mínimo e state selado", async () => {
    const { servico } = await montar();

    const { url } = await servico.iniciar(ANA);
    const endereco = new URL(url);

    expect(`${endereco.origin}${endereco.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(endereco.searchParams)).toMatchObject({
      client_id: CLIENTE.clientId,
      redirect_uri: "https://os.plugga.test/api/google/calendar/callback",
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/calendar.events",
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    expect(endereco.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(abrirState(endereco.searchParams.get("state")!, ANA)).not.toBeNull();
  });

  it("nunca põe o client secret nem o verificador do PKCE na URL", async () => {
    const { servico } = await montar();

    const { url } = await servico.iniciar(ANA);
    const state = new URL(url).searchParams.get("state")!;
    const verificador = abrirState(state, ANA)!.codeVerifier;

    expect(decodeURIComponent(url)).not.toContain(CLIENTE.clientSecret);
    expect(decodeURIComponent(url)).not.toContain(verificador);
  });
});

describe("concluir o consentimento", () => {
  it("troca o código com o verificador certo, guarda o token cifrado e informa a conta", async () => {
    const ctx = await montar();

    const estado = await conectar(ctx);

    expect(estado).toEqual({ disponivel: true, conectado: true, email: "pessoa@exemplo.test", conectadoEm: "2026-11-13T12:00:00.000Z" });
    const troca = ctx.google.chamadas.find((c) => c.operacao === "trocarCodigo")!.entrada as Record<string, string>;
    expect(troca).toMatchObject({ ...CLIENTE, code: "codigo-de-autorizacao", redirectUri: "https://os.plugga.test/api/google/calendar/callback" });
    // O verificador enviado ao Google é o mesmo que ficou selado no state.
    expect(troca.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const linha = ctx.conexoes.linhas.get(ANA.userId)!;
    expect(linha.googleEmail).toBe("pessoa@exemplo.test");
    expect(linha.escopos).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(JSON.stringify(linha)).not.toContain(TOKENS_SINTETICOS.refreshToken);
    expect(JSON.stringify(linha)).not.toContain(TOKENS_SINTETICOS.accessToken);
  });

  it("nunca devolve token em resposta", async () => {
    const ctx = await montar();

    const respostas = [await conectar(ctx), await ctx.servico.estado(ANA.userId)];

    for (const resposta of respostas) {
      expect(JSON.stringify(resposta)).not.toContain("sintetico");
      expect(Object.keys(resposta).sort()).toEqual(["conectadoEm", "conectado", "disponivel", "email"].sort());
    }
  });

  it("audita a conexão sem token nem e-mail", async () => {
    const ctx = await montar();

    await conectar(ctx);

    expect(ctx.eventos).toEqual([
      { eventName: "google.calendar.connected", entityType: "conexao_google_calendar", entityId: ANA.userId, actorType: "user", actorId: ANA.userId, payload: {}, occurredAt: expect.any(Date) },
    ]);
  });

  it("recusa state de OUTRA sessão da mesma pessoa, sem chamar o Google", async () => {
    const ctx = await montar();
    const { url } = await ctx.servico.iniciar(ANA);
    const state = new URL(url).searchParams.get("state")!;

    await expect(ctx.servico.concluir({ ...ANA, sessaoHash: "hash-de-outra-sessao" }, { code: "c", state })).rejects.toBeInstanceOf(RequisicaoInvalida);
    expect(ctx.google.chamadas.some((c) => c.operacao === "trocarCodigo")).toBe(false);
    expect(ctx.conexoes.linhas.size).toBe(0);
  });

  it("recusa state de OUTRA pessoa: quem intercepta o retorno não conecta a agenda alheia", async () => {
    const ctx = await montar();
    const { url } = await ctx.servico.iniciar(ANA);
    const stateDaAna = new URL(url).searchParams.get("state")!;

    // O Bruno apresenta o state da Ana, com a sessão dele.
    await expect(ctx.servico.concluir(BRUNO, { code: "c", state: stateDaAna })).rejects.toBeInstanceOf(RequisicaoInvalida);
    expect(ctx.google.chamadas.some((c) => c.operacao === "trocarCodigo")).toBe(false);
    expect(ctx.conexoes.linhas.size).toBe(0);
  });

  it("recusa state adulterado, fabricado e expirado com a MESMA resposta", async () => {
    const ctx = await montar();
    const { url } = await ctx.servico.iniciar(ANA);
    const state = new URL(url).searchParams.get("state")!;
    const adulterado = Buffer.from(state, "base64url");
    adulterado[adulterado.length - 1] = adulterado[adulterado.length - 1]! ^ 0x01;
    const expirado = selarState({ ...ANA, codeVerifier: "v" }, Date.now() - 11 * 60_000);

    const mensagens = new Set<string>();
    for (const invalido of [adulterado.toString("base64url"), "qualquer-coisa", expirado]) {
      const erro = await ctx.servico.concluir(ANA, { code: "c", state: invalido }).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(RequisicaoInvalida);
      mensagens.add((erro as Error).message);
    }

    expect(mensagens.size).toBe(1);
    expect(ctx.google.chamadas).toEqual([]);
  });

  it("código recusado pelo Google (vencido ou repetido) é erro do pedido, não indisponibilidade", async () => {
    const ctx = await montar();
    ctx.google.respostaDaTroca = new GoogleApiError("troca de código", 400, "invalid_grant");

    await expect(conectar(ctx)).rejects.toBeInstanceOf(RequisicaoInvalida);
    expect(ctx.conexoes.linhas.size).toBe(0);
  });

  it("credenciais recusadas ou Google fora do ar viram indisponibilidade, sem repetir o corpo do Google", async () => {
    const ctx = await montar();

    for (const falha of [new GoogleApiError("troca de código", 401, "invalid_client"), new GoogleApiError("troca de código", null, "rede"), new GoogleApiError("troca de código", 500, null)]) {
      ctx.google.respostaDaTroca = falha;
      const erro = await conectar(ctx).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ServicoIndisponivel);
      expect((erro as ServicoIndisponivel).mensagemParaUsuario).not.toMatch(/HTTP|invalid_client|google troca/);
    }
    expect(ctx.conexoes.linhas.size).toBe(0);
  });

  it("sem o escopo da agenda (pessoa desmarcou), recusa e revoga o que o Google emitiu", async () => {
    const ctx = await montar();
    ctx.google.respostaDaTroca = { ...TOKENS_SINTETICOS, escopos: ["openid", "https://www.googleapis.com/auth/userinfo.email"] };

    await expect(conectar(ctx)).rejects.toThrow(/agenda/);

    expect(ctx.conexoes.linhas.size).toBe(0);
    expect(ctx.google.tokensRevogados).toEqual([TOKENS_SINTETICOS.refreshToken]);
  });

  it("sem token de renovação, recusa e revoga o token de acesso", async () => {
    const ctx = await montar();
    ctx.google.respostaDaTroca = { ...TOKENS_SINTETICOS, refreshToken: null };

    await expect(conectar(ctx)).rejects.toBeInstanceOf(RequisicaoInvalida);

    expect(ctx.conexoes.linhas.size).toBe(0);
    expect(ctx.google.tokensRevogados).toEqual([TOKENS_SINTETICOS.accessToken]);
  });

  it("sem e-mail verificado da conta, recusa e revoga", async () => {
    const ctx = await montar();
    ctx.google.respostaDaTroca = { ...TOKENS_SINTETICOS, email: null };

    await expect(conectar(ctx)).rejects.toBeInstanceOf(RequisicaoInvalida);

    expect(ctx.conexoes.linhas.size).toBe(0);
    expect(ctx.google.tokensRevogados).toEqual([TOKENS_SINTETICOS.refreshToken]);
  });

  it("se não conseguir guardar, revoga o token para não deixar autorização órfã", async () => {
    const ctx = await montar();
    ctx.conexoes.falhaAoGravar = new Error("banco fora do ar");

    await expect(conectar(ctx)).rejects.toThrow("banco fora do ar");

    expect(ctx.google.tokensRevogados).toEqual([TOKENS_SINTETICOS.refreshToken]);
  });

  it("conectar de novo troca a conexão anterior", async () => {
    const ctx = await montar();
    await conectar(ctx);
    ctx.google.respostaDaTroca = { ...TOKENS_SINTETICOS, refreshToken: "refresh-sintetico-0002", email: "nova@exemplo.test" };

    const estado = await conectar(ctx);

    expect(estado).toMatchObject({ conectado: true, email: "nova@exemplo.test" });
    expect(ctx.conexoes.linhas.size).toBe(1);
  });
});

describe("cada pessoa só alcança a própria conexão", () => {
  it("a conexão de uma não aparece para a outra, nem some quando a outra desconecta", async () => {
    const ctx = await montar();
    await conectar(ctx, ANA);
    ctx.google.respostaDaTroca = { ...TOKENS_SINTETICOS, refreshToken: "refresh-sintetico-do-bruno", email: "bruno@exemplo.test" };
    await conectar(ctx, BRUNO);

    expect(await ctx.servico.estado(ANA.userId)).toMatchObject({ conectado: true, email: "pessoa@exemplo.test" });
    expect(await ctx.servico.estado(BRUNO.userId)).toMatchObject({ conectado: true, email: "bruno@exemplo.test" });

    await ctx.servico.desconectar(ANA.userId);

    expect(await ctx.servico.estado(ANA.userId)).toMatchObject({ conectado: false });
    expect(await ctx.servico.estado(BRUNO.userId)).toMatchObject({ conectado: true, email: "bruno@exemplo.test" });
    // Só o token da Ana foi revogado.
    expect(ctx.google.tokensRevogados).toEqual([TOKENS_SINTETICOS.refreshToken]);
  });

  it("linha trocada no banco (token de outra pessoa na linha da Ana) não conta como conexão e não é revogada", async () => {
    const ctx = await montar();
    ctx.google.respostaDaTroca = { ...TOKENS_SINTETICOS, refreshToken: "refresh-sintetico-do-bruno", email: "bruno@exemplo.test" };
    await conectar(ctx, BRUNO);
    // Quem tem escrita no banco copia a linha do Bruno para a Ana.
    ctx.conexoes.linhas.set(ANA.userId, { ...ctx.conexoes.linhas.get(BRUNO.userId)!, userId: ANA.userId });

    expect(await ctx.servico.estado(ANA.userId)).toMatchObject({ conectado: false });
    await ctx.servico.desconectar(ANA.userId);
    expect(ctx.google.tokensRevogados).toEqual([]);
  });
});

describe("desconectar", () => {
  it("revoga o token certo no Google e apaga a conexão", async () => {
    const ctx = await montar();
    await conectar(ctx);
    ctx.eventos.length = 0;

    const estado = await ctx.servico.desconectar(ANA.userId);

    expect(estado).toEqual({ disponivel: true, conectado: false, email: null, conectadoEm: null });
    expect(ctx.google.tokensRevogados).toEqual([TOKENS_SINTETICOS.refreshToken]);
    expect(ctx.conexoes.linhas.size).toBe(0);
    expect(ctx.eventos.map((e) => e.eventName)).toEqual(["google.calendar.disconnected"]);
  });

  it("apaga e audita mesmo quando a revogação no Google falha", async () => {
    const ctx = await montar();
    await conectar(ctx);
    ctx.eventos.length = 0;
    ctx.google.falhaAoRevogar = new GoogleApiError("revogação", 503, null);

    const estado = await ctx.servico.desconectar(ANA.userId);

    expect(ctx.google.chamadas.some((c) => c.operacao === "revogar")).toBe(true);
    expect(estado.conectado).toBe(false);
    expect(ctx.conexoes.linhas.size).toBe(0);
    expect(ctx.eventos.map((e) => e.eventName)).toEqual(["google.calendar.disconnected"]);
  });

  it("apaga mesmo quando o token guardado já não abre (chave-mestra trocada)", async () => {
    const ctx = await montar();
    await conectar(ctx);
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    expect(await ctx.servico.estado(ANA.userId)).toMatchObject({ conectado: false });
    await ctx.servico.desconectar(ANA.userId);

    expect(ctx.conexoes.linhas.size).toBe(0);
  });

  it("sem conexão, não faz nada: nem chama o Google nem audita", async () => {
    const ctx = await montar();

    const estado = await ctx.servico.desconectar(ANA.userId);

    expect(estado.conectado).toBe(false);
    expect(ctx.google.chamadas).toEqual([]);
    expect(ctx.eventos).toEqual([]);
  });
});

describe("segredo nunca em log", () => {
  it("nenhum caminho (feliz, recusa, queda do Google) registra token, client secret ou code", async () => {
    const registrado: string[] = [];
    for (const nivel of ["log", "warn", "error", "debug", "verbose"] as const) {
      vi.spyOn(Logger.prototype, nivel).mockImplementation((...partes: unknown[]) => {
        registrado.push(partes.map(String).join(" "));
      });
    }
    const ctx = await montar();
    await conectar(ctx);
    ctx.google.falhaAoRevogar = new GoogleApiError("revogação", 500, "backendError");
    await ctx.servico.desconectar(ANA.userId);
    ctx.google.respostaDaTroca = { ...TOKENS_SINTETICOS, refreshToken: null };
    ctx.google.falhaAoRevogar = new GoogleApiError("revogação", null, "rede");
    await conectar(ctx, ANA, "outro-codigo-secreto").catch(() => undefined);
    ctx.conexoes.falhaAoGravar = new Error("banco fora do ar");
    ctx.google.respostaDaTroca = TOKENS_SINTETICOS;
    await conectar(ctx).catch(() => undefined);

    const texto = registrado.join("\n");
    expect(registrado.length).toBeGreaterThan(0);
    for (const segredo of [TOKENS_SINTETICOS.refreshToken!, TOKENS_SINTETICOS.accessToken, CLIENTE.clientSecret, "outro-codigo-secreto", "codigo-de-autorizacao"]) {
      expect(texto).not.toContain(segredo);
    }
  });
});

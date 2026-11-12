import { randomBytes } from "node:crypto";

import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { EmpresaConsultada, EnderecoConsultado } from "@plugga/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { ConsultaCadastralPort, FonteIndisponivelError } from "./consulta-cadastral.port";
import { ConsultaCadastralService, IntegracaoAtivaRepository } from "./consulta-cadastral.service";

/**
 * Garantias: nada consulta com a integração desligada; desligar vale na hora;
 * a fonte nunca é chamada com documento inválido; falha da fonte vira erro claro
 * (e não "não existe"); o resultado é guardado só quando existe.
 */

class CofreEmMemoria extends SegredoRepository {
  linha: SegredoGuardado | null = null;
  async buscar(): Promise<SegredoGuardado | null> { return this.linha; }
  async gravar(d: GravarSegredo): Promise<void> { this.linha = { ...d, atualizadoEm: new Date("2026-11-13T10:00:00Z") }; }
  async apagar(): Promise<void> { this.linha = null; }
}

class AtivaDoCofre extends IntegracaoAtivaRepository {
  constructor(private readonly cofre: CofreEmMemoria) { super(); }
  async ativa(): Promise<boolean> { return this.cofre.linha !== null; }
}

const EMPRESA: EmpresaConsultada = {
  cnpj: "11222333000181", razaoSocial: "PLUGGA TESTE LTDA", nomeFantasia: null, situacao: "ATIVA", naturezaJuridica: null,
  porte: null, abertura: null, atividadePrincipal: null, telefone: null, email: null, endereco: null,
};
const ENDERECO: EnderecoConsultado = { cep: "69000000", logradouro: "Rua Teste", numero: null, complemento: null, bairro: "Centro", cidade: "Manaus", uf: "AM" };

function montar() {
  const cofre = new CofreEmMemoria();
  const fonte = {
    consultarCnpj: vi.fn(async (): Promise<EmpresaConsultada | null> => EMPRESA),
    consultarCep: vi.fn(async (): Promise<EnderecoConsultado | null> => ENDERECO),
  };
  const eventos: { eventName: string; actorId: string | null; payload: unknown }[] = [];
  const auditoria = { appendEvent: vi.fn(async (e: { eventName: string; actorId: string | null; payload: unknown }) => { eventos.push(e); }), appendTrail: vi.fn() } as unknown as AuditPort;
  const servico = new ConsultaCadastralService(cofre, new AtivaDoCofre(cofre), fonte as unknown as ConsultaCadastralPort, auditoria);
  return { servico, cofre, fonte, eventos };
}

const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;
beforeEach(() => { process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
afterEach(() => {
  vi.useRealTimers();
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("consulta cadastral", () => {
  it("desligada por padrão: recusa a consulta e não chega na fonte", async () => {
    const { servico, fonte } = montar();

    await expect(servico.empresa("11222333000181")).rejects.toThrow(ConflictException);
    await expect(servico.endereco("69000000")).rejects.toThrow(ConflictException);
    expect(fonte.consultarCnpj).not.toHaveBeenCalled();
    expect(fonte.consultarCep).not.toHaveBeenCalled();
  });

  it("ligada, consulta com ou sem máscara e devolve o resultado", async () => {
    const { servico, fonte } = montar();
    await servico.definir(true, "dev");

    expect(await servico.empresa("11.222.333/0001-81")).toEqual(EMPRESA);
    expect(fonte.consultarCnpj).toHaveBeenCalledWith("11222333000181");
    expect(await servico.endereco("69.000-000")).toEqual(ENDERECO);
  });

  it("documento inválido não chega na fonte", async () => {
    const { servico, fonte } = montar();
    await servico.definir(true, "dev");

    await expect(servico.empresa("11222333000182")).rejects.toThrow(BadRequestException);
    await expect(servico.endereco("123")).rejects.toThrow(BadRequestException);
    expect(fonte.consultarCnpj).not.toHaveBeenCalled();
    expect(fonte.consultarCep).not.toHaveBeenCalled();
  });

  it("'não existe' vira 404 e não fica guardado", async () => {
    const { servico, fonte } = montar();
    await servico.definir(true, "dev");
    fonte.consultarCnpj.mockResolvedValueOnce(null);

    await expect(servico.empresa("11222333000181")).rejects.toThrow(NotFoundException);
    await servico.empresa("11222333000181");
    expect(fonte.consultarCnpj).toHaveBeenCalledTimes(2);
  });

  it("falha da fonte vira 502 claro e não fica guardada", async () => {
    const { servico, fonte } = montar();
    await servico.definir(true, "dev");
    fonte.consultarCep.mockRejectedValueOnce(new FonteIndisponivelError("HTTP 500"));

    await expect(servico.endereco("69000000")).rejects.toThrow(BadGatewayException);
    expect(await servico.endereco("69000000")).toEqual(ENDERECO);
  });

  it("repete a consulta sem bater na fonte de novo enquanto o resultado vale", async () => {
    const { servico, fonte } = montar();
    await servico.definir(true, "dev");

    await servico.empresa("11222333000181");
    await servico.empresa("11.222.333/0001-81");

    expect(fonte.consultarCnpj).toHaveBeenCalledTimes(1);
  });

  it("desligar vale na hora, sem esperar o cache, e esquece o que estava guardado", async () => {
    const { servico, fonte } = montar();
    await servico.definir(true, "dev");
    await servico.empresa("11222333000181");

    await servico.definir(false, "dev");

    await expect(servico.empresa("11222333000181")).rejects.toThrow(ConflictException);
    expect(fonte.consultarCnpj).toHaveBeenCalledTimes(1);
  });

  it("o resultado guardado expira", async () => {
    vi.useFakeTimers();
    const { servico, fonte } = montar();
    await servico.definir(true, "dev");

    await servico.empresa("11222333000181");
    vi.advanceTimersByTime(11 * 60_000);
    await servico.empresa("11222333000181");

    expect(fonte.consultarCnpj).toHaveBeenCalledTimes(2);
  });

  it("o estado diz quem ligou e quando, e liga/desliga viram auditoria sem dados", async () => {
    const { servico, eventos } = montar();

    expect(await servico.estado()).toMatchObject({ ativa: false, fonte: "BrasilAPI", atualizadoEm: null });
    const ligada = await servico.definir(true, "dev-1");
    expect(ligada).toMatchObject({ ativa: true, atualizadoPor: "dev-1", atualizadoEm: "2026-11-13T10:00:00.000Z" });
    await servico.definir(false, "dev-1");

    expect(eventos.map((e) => e.eventName)).toEqual(["integracao.cadastro.activated", "integracao.cadastro.deactivated"]);
    expect(eventos.every((e) => e.actorId === "dev-1" && JSON.stringify(e.payload) === "{}")).toBe(true);
  });
});

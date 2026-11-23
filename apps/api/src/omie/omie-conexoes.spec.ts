import type { BloqueioDaConexaoOmie, CompanyKey, EmpresaDoOmie } from "@plugga/shared";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { cifrar } from "../llm/cripto.js";
import type { GravarSegredo, SegredoGuardado } from "../llm/segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { CHAVE_OMIE } from "./omie-cofre.service";
import { avaliarTeste, situacaoDaConexao } from "./omie-conexoes.rules";
import { OmieConexoesService, OmieLeituraPorEmpresa, chaveDoOmie } from "./omie-conexoes.service";
import type { OmiePort } from "./omie.port";
import type { LinhaDaConexao, PrismaOmieConexoesRepository } from "./prisma-omie-conexoes.repository";

// CNPJs da faixa sintética do projeto (scripts/dados-sinteticos.mjs).
const PLUGGA = "99999001000159";
const WAZE = "99999002000103";
const empresa = (cnpj: string | null, razaoSocial = "EMPRESA SINTÉTICA"): EmpresaDoOmie => ({ razaoSocial, nomeFantasia: null, cnpj });

describe("avaliarTeste", () => {
  it("uma empresa só, com o CNPJ do cadastro: conectada", () => {
    expect(avaliarTeste([empresa(PLUGGA)], PLUGGA, { cnpjDoCadastro: null, cnpjConfirmado: null })).toMatchObject({ tipo: "conectada", cnpj: PLUGGA });
  });

  it("sem CNPJ no cadastro: espera confirmação", () => {
    expect(avaliarTeste([empresa(PLUGGA)], null, { cnpjDoCadastro: null, cnpjConfirmado: null })).toMatchObject({ tipo: "a_confirmar", cnpj: PLUGGA });
  });

  it("bloqueia o que não identifica uma empresa só, e a certa", () => {
    const bloqueio = (r: ReturnType<typeof avaliarTeste>) => (r.tipo === "bloqueada" ? r.bloqueio : null);
    expect(bloqueio(avaliarTeste([empresa(PLUGGA), empresa(WAZE)], null, { cnpjDoCadastro: null, cnpjConfirmado: null }))).toBe("mais_de_uma_empresa");
    expect(bloqueio(avaliarTeste([], null, { cnpjDoCadastro: null, cnpjConfirmado: null }))).toBe("sem_cnpj");
    expect(bloqueio(avaliarTeste([empresa(null)], null, { cnpjDoCadastro: null, cnpjConfirmado: null }))).toBe("sem_cnpj");
    expect(bloqueio(avaliarTeste([empresa(WAZE)], null, { cnpjDoCadastro: null, cnpjConfirmado: WAZE }))).toBe("cnpj_de_outra_empresa");
    // O CNPJ do cadastro da outra empresa também bloqueia, mesmo sem ela confirmada.
    expect(bloqueio(avaliarTeste([empresa(WAZE)], null, { cnpjDoCadastro: WAZE, cnpjConfirmado: null }))).toBe("cnpj_de_outra_empresa");
    expect(bloqueio(avaliarTeste([empresa(WAZE)], PLUGGA, { cnpjDoCadastro: null, cnpjConfirmado: null }))).toBe("cnpj_diferente_do_cadastro");
  });
});

describe("situacaoDaConexao", () => {
  const v1 = new Date("2026-11-23T10:00:00.000Z");
  const v2 = new Date("2026-11-23T11:00:00.000Z");
  const conexao = (o: Partial<{ ultimoTesteEm: Date | null; bloqueio: BloqueioDaConexaoOmie | null; confirmadaEm: Date | null }> = {}) =>
    ({ segredoAtualizadoEm: v1, ultimoTesteEm: v1, bloqueio: null, confirmadaEm: null, ...o });

  it("segue o par gravado: teste de um par anterior não vale", () => {
    expect(situacaoDaConexao({ segredoAtualizadoEm: null, ilegivel: false, conexao: null })).toBe("nao_conectada");
    expect(situacaoDaConexao({ segredoAtualizadoEm: v1, ilegivel: true, conexao: null })).toBe("ilegivel");
    expect(situacaoDaConexao({ segredoAtualizadoEm: v1, ilegivel: false, conexao: conexao({ ultimoTesteEm: null }) })).toBe("a_testar");
    expect(situacaoDaConexao({ segredoAtualizadoEm: v2, ilegivel: false, conexao: conexao({ confirmadaEm: v1 }) })).toBe("a_testar");
    expect(situacaoDaConexao({ segredoAtualizadoEm: v1, ilegivel: false, conexao: conexao({ bloqueio: "sem_cnpj" }) })).toBe("bloqueada");
    expect(situacaoDaConexao({ segredoAtualizadoEm: v1, ilegivel: false, conexao: conexao() })).toBe("a_confirmar");
    expect(situacaoDaConexao({ segredoAtualizadoEm: v1, ilegivel: false, conexao: conexao({ confirmadaEm: v1 }) })).toBe("conectada");
  });
});

/** Cofre e conferência em memória; a leitura por empresa imita a `config_omie(p_empresa)`. */
class Memoria extends SegredoRepository {
  readonly linhas = new Map<string, SegredoGuardado>();
  private relogio = Date.parse("2026-11-23T10:00:00.000Z");
  async buscar(chave: string) {
    return this.linhas.get(chave) ?? null;
  }
  async gravar(dados: GravarSegredo) {
    const { chave, ...resto } = dados;
    this.relogio += 1_000;
    this.linhas.set(chave, { ...resto, atualizadoEm: new Date(this.relogio) });
  }
  async apagar(chave: string) {
    this.linhas.delete(chave);
  }
}

function conferencia() {
  const linhas = new Map<CompanyKey, LinhaDaConexao>();
  const cnpjs = new Map<CompanyKey, string | null>([["plugga", null], ["waze", null]]);
  const eventos: string[] = [];
  const base = (empresa: CompanyKey, segredoAtualizadoEm: Date): LinhaDaConexao => ({
    companyId: empresa, segredoAtualizadoEm, ultimoTesteEm: null, ultimoTestePorId: null, ultimoTeste: null, bloqueio: null,
    confirmadaEm: null, confirmadaPorId: null, cnpjConfirmado: null, razaoSocialConfirmada: null, updatedAt: new Date(),
    ultimoTestePor: null, confirmadaPor: null,
  });
  const outra = (e: CompanyKey) => {
    const o: CompanyKey = e === "plugga" ? "waze" : "plugga";
    const linha = linhas.get(o);
    return { cnpjDoCadastro: cnpjs.get(o) ?? null, cnpjConfirmado: linha?.confirmadaEm ? linha.cnpjConfirmado : null };
  };
  const repo = {
    linhas: async () => new Map(linhas),
    cnpjsDoCadastro: async () => new Map(cnpjs),
    definirCnpj: async (e: CompanyKey, c: string | null) => { cnpjs.set(e, c); eventos.push("cnpj"); },
    reiniciar: async (e: CompanyKey, v: Date) => { linhas.set(e, base(e, v)); eventos.push(`conectada:${e}`); },
    registrarTeste: async (e: CompanyKey, v: Date, empresas: EmpresaDoOmie[], _p: AuthPrincipal, agora: Date) => {
      const r = avaliarTeste(empresas, cnpjs.get(e) ?? null, outra(e));
      const confirmar = r.tipo === "conectada" ? r : null;
      linhas.set(e, { ...base(e, v), ultimoTesteEm: agora, ultimoTeste: { empresas: empresas.slice(0, 2), total: empresas.length } as never, bloqueio: r.tipo === "bloqueada" ? r.bloqueio : null, confirmadaEm: confirmar ? agora : null, cnpjConfirmado: confirmar?.cnpj ?? null });
      eventos.push(`testada:${e}`);
      return r;
    },
    confirmar: async (e: CompanyKey, visto: { versao: Date; testeEm: Date; cnpj: string }, _p: AuthPrincipal, agora: Date) => {
      const linha = linhas.get(e)!;
      if (linha.segredoAtualizadoEm.getTime() !== visto.versao.getTime() || linha.ultimoTesteEm?.getTime() !== visto.testeEm.getTime()) throw new Error("O par mudou");
      const testadas = (linha.ultimoTeste as unknown as { empresas: EmpresaDoOmie[] }).empresas;
      if (testadas[0]?.cnpj !== visto.cnpj) throw new Error("O CNPJ não é o que o teste trouxe");
      const r = avaliarTeste(testadas, cnpjs.get(e) ?? null, outra(e));
      linhas.set(e, r.tipo === "bloqueada" ? { ...linha, bloqueio: r.bloqueio } : { ...linha, confirmadaEm: agora, cnpjConfirmado: visto.cnpj });
      eventos.push(`confirmada:${e}`);
      return r;
    },
    registrarDesconexao: async (e: CompanyKey) => { eventos.push(`desconectada:${e}`); },
    registrarContaAntigaMovida: async (_p: AuthPrincipal, apagada: boolean) => { eventos.push(`movida:${apagada}`); },
  };
  return { repo: repo as unknown as PrismaOmieConexoesRepository, linhas, cnpjs, eventos };
}

describe("OmieConexoesService", () => {
  const quem: AuthPrincipal = { id: "00000000-0000-4000-8000-0000000000a1", kind: "user", acesso: { plataforma: null, departamentos: [] } };
  const PAR = { appKey: "chave-plugga-0001", appSecret: "segredo-sintetico-plugga" };
  let cofre: Memoria;
  let c: ReturnType<typeof conferencia>;
  let omie: { consultarEmpresa: ReturnType<typeof vi.fn>; listarEmpresas: ReturnType<typeof vi.fn> };
  let servico: OmieConexoesService;

  beforeAll(() => {
    process.env.SECRETS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
  });

  beforeEach(() => {
    cofre = new Memoria();
    c = conferencia();
    omie = { consultarEmpresa: vi.fn(), listarEmpresas: vi.fn(async () => [empresa(PLUGGA, "PLUGGA SINTÉTICA")]) };
    // Imita a config_omie(p_empresa): só o par cuja versão foi confirmada.
    const leitura = new (class extends OmieLeituraPorEmpresa {
      async lerCifrado(e: CompanyKey) {
        const par = cofre.linhas.get(chaveDoOmie(e));
        const linha = c.linhas.get(e);
        return par && linha?.confirmadaEm && !linha.bloqueio && linha.segredoAtualizadoEm.getTime() === par.atualizadoEm.getTime() ? par : null;
      }
    })();
    servico = new OmieConexoesService(cofre, c.repo, leitura, omie as unknown as OmiePort);
  });

  const da = async (e: CompanyKey) => (await servico.estado()).conexoes.find((x) => x.empresa === e)!;

  it("gravar deixa a testar; o teste sem cadastro pede confirmação; confirmar conecta e libera o uso", async () => {
    await servico.gravar("plugga", PAR, quem);
    expect((await da("plugga")).situacao).toBe("a_testar");
    expect(await servico.credenciais("plugga")).toBeNull();

    await servico.testar("plugga", quem);
    expect(omie.listarEmpresas).toHaveBeenCalledWith(PAR);
    expect(await da("plugga")).toMatchObject({ situacao: "a_confirmar", ultimoTeste: { empresas: [{ cnpj: PLUGGA }] }, mascara: "••••0001" });
    expect(await servico.credenciais("plugga")).toBeNull();

    await expect(servico.confirmar("plugga", WAZE, quem)).rejects.toThrow("não é o que o teste trouxe");
    await servico.confirmar("plugga", PLUGGA, quem);
    expect(await da("plugga")).toMatchObject({ situacao: "conectada", confirmada: { cnpj: PLUGGA } });
    expect(await servico.credenciais("plugga")).toEqual(PAR);
  });

  it("com o CNPJ no cadastro, o teste conecta sozinho; trocar o par volta a testar", async () => {
    c.cnpjs.set("plugga", PLUGGA);
    await servico.gravar("plugga", PAR, quem);
    await servico.testar("plugga", quem);
    expect((await da("plugga")).situacao).toBe("conectada");
    await servico.gravar("plugga", { ...PAR, appKey: "chave-plugga-0002" }, quem);
    expect(await da("plugga")).toMatchObject({ situacao: "a_testar", confirmada: null, ultimoTeste: null });
  });

  it("bloqueia o par da Waze que devolve o CNPJ já confirmado da Plugga", async () => {
    c.cnpjs.set("plugga", PLUGGA);
    await servico.gravar("plugga", PAR, quem);
    await servico.testar("plugga", quem);
    await servico.gravar("waze", { appKey: "chave-waze-0001", appSecret: "segredo-sintetico-waze1" }, quem);
    await servico.testar("waze", quem);
    expect(await da("waze")).toMatchObject({ situacao: "bloqueada", bloqueio: "cnpj_de_outra_empresa" });
    await expect(servico.confirmar("waze", PLUGGA, quem)).rejects.toThrow("Só se confirma");
    expect(await servico.credenciais("waze")).toBeNull();
  });

  it("cenário A: os dois pares devolvem o mesmo CNPJ sem cadastro; a segunda confirmação é bloqueada", async () => {
    omie.listarEmpresas.mockResolvedValue([empresa(PLUGGA)]);
    await servico.gravar("plugga", PAR, quem);
    await servico.testar("plugga", quem);
    await servico.gravar("waze", { appKey: "chave-waze-0001", appSecret: "segredo-sintetico-waze1" }, quem);
    await servico.testar("waze", quem);
    expect((await da("waze")).situacao).toBe("a_confirmar");
    await servico.confirmar("plugga", PLUGGA, quem);
    await expect(servico.confirmar("waze", PLUGGA, quem)).rejects.toThrow("é o da outra empresa");
    expect(await da("waze")).toMatchObject({ situacao: "bloqueada", bloqueio: "cnpj_de_outra_empresa" });
    expect(await servico.credenciais("waze")).toBeNull();
  });

  it("cenário B: o par da Plugga que devolve o CNPJ cadastrado da Waze é bloqueado", async () => {
    c.cnpjs.set("waze", WAZE);
    omie.listarEmpresas.mockResolvedValue([empresa(WAZE)]);
    await servico.gravar("plugga", PAR, quem);
    await servico.testar("plugga", quem);
    expect(await da("plugga")).toMatchObject({ situacao: "bloqueada", bloqueio: "cnpj_de_outra_empresa" });
  });

  it("a conta antiga vira o par da Plugga e só some quando a Plugga fica conectada", async () => {
    await cofre.gravar({ chave: CHAVE_OMIE, ...cifrado(PAR), ultimosQuatro: "0001", atualizadoPor: quem.id });
    expect((await servico.estado()).contaAntiga).toMatchObject({ mascara: "••••0001" });

    await servico.moverContaAntiga(quem);
    expect((await da("plugga")).situacao).toBe("a_confirmar");
    expect((await servico.estado()).contaAntiga).not.toBeNull();
    expect(c.eventos).toContain("movida:false");

    await servico.confirmar("plugga", PLUGGA, quem);
    expect((await servico.estado()).contaAntiga).toBeNull();
  });

  it("o teste não guarda nada quando o OMIE falha", async () => {
    await servico.gravar("plugga", PAR, quem);
    omie.listarEmpresas.mockRejectedValueOnce(new Error("indisponivel"));
    await expect(servico.testar("plugga", quem)).rejects.toThrow();
    expect((await da("plugga")).situacao).toBe("a_testar");
  });

  it("o estado nunca traz a chave nem o segredo", async () => {
    await servico.gravar("plugga", PAR, quem);
    const texto = JSON.stringify(await servico.estado());
    expect(texto).not.toContain(PAR.appSecret);
    expect(texto).not.toContain(PAR.appKey);
  });
});

function cifrado(par: { appKey: string; appSecret: string }) {
  // Mesma cifra do cofre, para a conta antiga do teste.
  const c = cifrar(JSON.stringify(par));
  return { valorCifrado: c.conteudo, iv: c.iv, tag: c.tag };
}

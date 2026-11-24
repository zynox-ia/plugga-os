import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { Conflito } from "../src/common/errors/dominio";
import { FinanceiroService } from "../src/financeiro/financeiro.service";
import { PrismaCadastrosDoFinanceiroRepository } from "../src/financeiro/prisma-cadastros-do-financeiro.repository";
import { PrismaOmieLancamentosRepository } from "../src/omie/prisma-omie-lancamentos.repository";

const ID = "00000000-0000-4000-8000-000000000901";

/** Serviço dublê: o teste cobre rotas, acesso e validação de entrada; regras e persistência têm testes próprios. */
const servico = {
  listar: vi.fn().mockResolvedValue({ itens: [], total: 0 }),
  quadro: vi.fn().mockResolvedValue({ colunas: [] }),
  resumo: vi.fn().mockResolvedValue({ resumo: {} }),
  obter: vi.fn().mockResolvedValue({ id: ID }),
  opcoes: vi.fn().mockResolvedValue({ categorias: [] }),
  criarContaAPagar: vi.fn().mockResolvedValue({ id: ID }),
  editar: vi.fn().mockResolvedValue({ id: ID }),
  executarAcao: vi.fn().mockResolvedValue({ id: ID }),
  enviarAnexo: vi.fn().mockResolvedValue({ id: ID }),
  criarCobranca: vi.fn().mockResolvedValue({ id: ID }),
  buscarClientes: vi.fn().mockResolvedValue({ itens: [] }),
  sugestaoDeCobranca: vi.fn().mockResolvedValue({ valor: null, competencia: null, codigo: null }),
  prepararZipDeComprovantes: vi.fn().mockResolvedValue({ arquivos: 0, escrever: async (d: NodeJS.WritableStream) => { d.write(Buffer.from([0x50, 0x4b, 0x05, 0x06])); } }),
  baixarAnexo: vi.fn(),
};

/** O conector do OMIE, também dublê: o "Tentar de novo" mora nele. */
const conector = { tentarDeNovo: vi.fn().mockResolvedValue(undefined) };

/** Os cadastros (S3b), dublê: o RLS e as regras têm a integração própria. */
const cadastros = {
  criarCategoria: vi.fn().mockResolvedValue({ id: ID }),
  editarCategoria: vi.fn().mockResolvedValue({ id: ID }),
  criarConta: vi.fn().mockResolvedValue({ id: ID }),
  editarConta: vi.fn().mockResolvedValue({ id: ID }),
};
const CATEGORIA = { empresa: "waze", codigo: "2.01.07", nome: "Fretes", tipo: "despesa", natureza: "servico", grupoNome: "Despesas operacionais" };

const CONTA = {
  empresa: "plugga", fornecedorId: ID, categoriaId: ID, contaCorrenteId: ID,
  descricao: "Honorários", valor: "3800.00", vencimento: "2026-11-28", forma: "boleto",
};

describe("financeiro API (e2e)", () => {
  let app: INestApplication;
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const financeiro = como("financeiro:membro");
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FinanceiroService).useValue(servico)
      .overrideProvider(PrismaOmieLancamentosRepository).useValue(conector)
      .overrideProvider(PrismaCadastrosDoFinanceiroRepository).useValue(cadastros)
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação", async () => {
    await http().get("/financeiro/lancamentos").expect(401);
  });

  it("Financeiro e plataforma entram; Suprimentos e CRM não", async () => {
    await financeiro(http().get("/financeiro/lancamentos")).expect(200);
    await financeiro(http().get("/financeiro/lancamentos/quadro")).expect(200);
    await financeiro(http().get("/financeiro/lancamentos/resumo?empresa=waze")).expect(200);
    await financeiro(http().get("/financeiro/lancamentos/resumo?situacao=pagar")).expect(400);
    await financeiro(http().get("/financeiro/opcoes")).expect(200);
    await http().get("/financeiro/lancamentos").set("x-dev-principal", "00000000-0000-4000-8000-000000000002").set("x-dev-plataforma", "admin").expect(200);
    for (const d of ["suprimentos:gerente", "crm:membro"]) {
      await como(d)(http().get("/financeiro/lancamentos")).expect(403);
    }
  });

  it("filtros com os ids do protótipo; situação desconhecida e campo fora do contrato são 400", async () => {
    servico.listar.mockClear();
    await financeiro(http().get("/financeiro/lancamentos?situacao=pagar-vencido&empresa=waze&vencimento=7&busca=CP-0412")).expect(200);
    expect(servico.listar.mock.calls[0]?.[0]).toMatchObject({ tipo: "todos", situacao: "pagar-vencido", empresa: "waze", vencimento: "7" });
    await financeiro(http().get("/financeiro/lancamentos?situacao=pagas")).expect(400);
    await financeiro(http().get("/financeiro/lancamentos?pagina=2")).expect(400);
    // O quadro não aceita situação: as colunas já são a situação.
    await financeiro(http().get("/financeiro/lancamentos/quadro?situacao=pagar")).expect(400);
  });

  it("nova conta a pagar: valida antes do serviço", async () => {
    servico.criarContaAPagar.mockClear();
    await financeiro(http().post("/financeiro/lancamentos")).send({ ...CONTA, valor: "0" }).expect(400);
    await financeiro(http().post("/financeiro/lancamentos")).send({ ...CONTA, vencimento: "2026-02-31" }).expect(400);
    await financeiro(http().post("/financeiro/lancamentos")).send({ ...CONTA, etapa: "aprovada" }).expect(400);
    expect(servico.criarContaAPagar).not.toHaveBeenCalled();
    await financeiro(http().post("/financeiro/lancamentos")).send(CONTA).expect(201);
  });

  it("ações: cancelar exige motivo; ação desconhecida é 400", async () => {
    servico.executarAcao.mockClear();
    await financeiro(http().post(`/financeiro/lancamentos/${ID}/acoes`)).send({ acao: "cancelar" }).expect(400);
    await financeiro(http().post(`/financeiro/lancamentos/${ID}/acoes`)).send({ acao: "excluir" }).expect(400);
    expect(servico.executarAcao).not.toHaveBeenCalled();
    await financeiro(http().post(`/financeiro/lancamentos/${ID}/acoes`)).send({ acao: "aprovar" }).expect(200);
  });

  it("Tentar de novo é do conector do OMIE: rota nova e o alias antigo; id inválido é 400; Suprimentos não entra", async () => {
    conector.tentarDeNovo.mockClear();
    for (const rota of [`/integracoes/omie/lancamentos/${ID}/tentar-de-novo`, `/financeiro/lancamentos/${ID}/omie/tentar-de-novo`]) {
      await financeiro(http().post(rota.replace(ID, "x"))).expect(400);
      await como("suprimentos:gerente")(http().post(rota)).expect(403);
    }
    expect(conector.tentarDeNovo).not.toHaveBeenCalled();
    await financeiro(http().post(`/integracoes/omie/lancamentos/${ID}/tentar-de-novo`)).expect(200);
    await financeiro(http().post(`/financeiro/lancamentos/${ID}/omie/tentar-de-novo`)).expect(200);
    expect(conector.tentarDeNovo.mock.calls.map((c) => c[0])).toEqual([ID, ID]);
  });

  it("cadastros: só a gerência do Financeiro e a plataforma gravam; o membro e outros departamentos não", async () => {
    for (const f of Object.values(cadastros)) f.mockClear();
    const gerente = como("financeiro:gerente");
    for (const quem of [financeiro, como("suprimentos:gerente")]) {
      await quem(http().post("/financeiro/categorias")).send(CATEGORIA).expect(403);
      await quem(http().patch(`/financeiro/contas-correntes/${ID}`)).send({ ativa: false }).expect(403);
    }
    expect(cadastros.criarCategoria).not.toHaveBeenCalled();
    await gerente(http().post("/financeiro/categorias")).send(CATEGORIA).expect(201);
    await http().post("/financeiro/contas-correntes").set("x-dev-principal", "00000000-0000-4000-8000-000000000002").set("x-dev-plataforma", "admin").send({ empresa: "plugga", nome: "Caixa" }).expect(201);
    await gerente(http().patch(`/financeiro/categorias/${ID}`)).send({ ativa: false }).expect(200);
    await gerente(http().patch(`/financeiro/contas-correntes/${ID}`)).send({ banco: "Banco A" }).expect(200);
    expect(cadastros.criarCategoria.mock.calls[0]?.[0]).toEqual(CATEGORIA);
  });

  it("cadastros: código no formato 2.01.01; código, tipo e empresa não mudam; edição vazia e id inválido são 400", async () => {
    for (const f of Object.values(cadastros)) f.mockClear();
    const gerente = como("financeiro:gerente");
    for (const codigo of ["2.1.1", "2.01", "2.01.01.01", "A.01.01"]) {
      await gerente(http().post("/financeiro/categorias")).send({ ...CATEGORIA, codigo }).expect(400);
    }
    await gerente(http().post("/financeiro/categorias")).send({ ...CATEGORIA, empresa: undefined }).expect(400);
    for (const campo of [{ codigo: "2.01.08" }, { tipo: "receita" }, { empresa: "plugga" }]) {
      await gerente(http().patch(`/financeiro/categorias/${ID}`)).send(campo).expect(400);
    }
    await gerente(http().patch(`/financeiro/categorias/${ID}`)).send({}).expect(400);
    await gerente(http().patch(`/financeiro/contas-correntes/${ID}`)).send({ empresa: "waze" }).expect(400);
    await gerente(http().patch(`/financeiro/contas-correntes/${ID}`)).send({ saldo: "10.00" }).expect(400);
    await gerente(http().patch("/financeiro/categorias/x")).send({ ativa: false }).expect(400);
    expect(Object.values(cadastros).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it("editar não muda empresa nem valor", async () => {
    await financeiro(http().patch(`/financeiro/lancamentos/${ID}`)).send({ empresa: "waze" }).expect(400);
    await financeiro(http().patch(`/financeiro/lancamentos/${ID}`)).send({ valor: "1.00" }).expect(400);
    await financeiro(http().patch(`/financeiro/lancamentos/${ID}`)).send({ descricao: "Nova" }).expect(200);
  });

  it("não há rota de exclusão", async () => {
    await financeiro(http().delete(`/financeiro/lancamentos/${ID}`)).expect(404);
  });

  it("anexo: o tipo é validado antes do serviço; o arquivo vai como multipart", async () => {
    servico.enviarAnexo.mockClear();
    await financeiro(http().post(`/financeiro/lancamentos/${ID}/anexos`)).field("tipo", "foto").attach("arquivo", Buffer.from("%PDF-1.4"), "c.pdf").expect(400);
    expect(servico.enviarAnexo).not.toHaveBeenCalled();
    await financeiro(http().post(`/financeiro/lancamentos/${ID}/anexos`)).field("tipo", "comprovante").attach("arquivo", Buffer.from("%PDF-1.4"), "c.pdf").expect(201);
    expect(servico.enviarAnexo.mock.calls[0]?.[1]).toBe("comprovante");
    expect(servico.enviarAnexo.mock.calls[0]?.[2]).toMatchObject({ nomeOriginal: "c.pdf" });
  });

  it("pagar sem forma, conta ou dia é 400", async () => {
    await financeiro(http().post(`/financeiro/lancamentos/${ID}/acoes`)).send({ acao: "registrar_pagamento", forma: "pix" }).expect(400);
  });

  it("cobrança manual, busca de clientes e sugestão validam antes do serviço", async () => {
    const cobranca = { empresa: "plugga", clientId: ID, competencia: "2026-11", categoriaId: ID, descricao: "Gestão", valor: "4850.00", vencimento: "2026-12-10" };
    servico.criarCobranca.mockClear();
    await financeiro(http().post("/financeiro/cobrancas")).send({ ...cobranca, competencia: "2026-13" }).expect(400);
    expect(servico.criarCobranca).not.toHaveBeenCalled();
    await financeiro(http().post("/financeiro/cobrancas")).send(cobranca).expect(201);
    await financeiro(http().get("/financeiro/clientes?busca=H")).expect(400);
    await financeiro(http().get("/financeiro/clientes?busca=Hotel")).expect(200);
    await financeiro(http().get(`/financeiro/cobrancas/sugestao?empresa=plugga&clientId=${ID}&competencia=2026-11`)).expect(200);
  });

  it("cobrança repetida: o 409 leva a existente em `existente`, sem colidir com o `codigo` do envelope", async () => {
    const cobranca = { empresa: "plugga", clientId: ID, competencia: "2026-11", categoriaId: ID, descricao: "Gestão", valor: "4850.00", vencimento: "2026-12-10" };
    servico.criarCobranca.mockRejectedValueOnce(new Conflito("Já existe a CR-0012 deste cliente nesta competência.", undefined, { existente: { codigo: "CR-0012", id: ID } }));
    const resposta = await financeiro(http().post("/financeiro/cobrancas")).send(cobranca).expect(409);
    expect(resposta.body).toMatchObject({ codigo: "CONFLITO_UNICIDADE", existente: { codigo: "CR-0012", id: ID } });
    expect(resposta.body).not.toHaveProperty("id");
  });

  it("o .zip dos comprovantes valida o período e sai como anexo", async () => {
    await financeiro(http().get("/financeiro/comprovantes.zip?de=2026-11-30&ate=2026-11-01")).expect(400);
    const resposta = await financeiro(http().get("/financeiro/comprovantes.zip?de=2026-11-01&ate=2026-11-30&empresa=plugga")).expect(200);
    expect(resposta.headers["content-type"]).toBe("application/zip");
    expect(resposta.headers["content-disposition"]).toContain("attachment");
  });
});

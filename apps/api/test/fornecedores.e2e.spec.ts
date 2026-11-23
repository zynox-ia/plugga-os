import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CriarFornecedor, EditarFornecedor, Fornecedor, ListarFornecedoresQuery, ListarFornecedoresResposta } from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { Conflito, NaoEncontrado } from "../src/common/errors/dominio";
import { AuthContext, type AuthPrincipal } from "../src/core/auth/auth.types";
import { FornecedoresRepository } from "../src/fornecedores/fornecedores.repository";

// Documento da faixa sintética do projeto (scripts/dados-sinteticos.mjs), com dígito verificador válido.
const CNPJ = "99999001000159";
const PESSOA = "00000000-0000-4000-8000-000000000001";
const ID = "00000000-0000-4000-8000-000000000301";

const fornecedor = (dados: Partial<Fornecedor> = {}): Fornecedor => ({
  id: ID,
  nome: "Solar Sintético Ltda",
  nomeFantasia: null,
  documento: CNPJ,
  categoria: "kit_solar",
  contatoNome: null,
  telefone: null,
  email: null,
  cidade: null,
  uf: null,
  formasDePagamento: [],
  chavePix: null,
  dadosBancarios: null,
  observacoes: null,
  ativo: true,
  cotacoes: 0,
  criadoPor: null,
  atualizadoPor: null,
  createdAt: "2026-11-23T00:00:00.000Z",
  updatedAt: "2026-11-23T00:00:00.000Z",
  ...dados,
});

/** Repositório em memória: o teste cobre rotas, acesso e validação; a persistência tem teste próprio. */
class FornecedoresEmMemoria extends FornecedoresRepository {
  itens = [fornecedor()];
  ultimaConsulta: ListarFornecedoresQuery | null = null;

  async listar(query: ListarFornecedoresQuery): Promise<ListarFornecedoresResposta> {
    this.ultimaConsulta = query;
    return { itens: [], contagem: { ativos: this.itens.filter((f) => f.ativo).length, inativos: 0 } };
  }

  async obter(id: string): Promise<Fornecedor> {
    const achado = this.itens.find((f) => f.id === id);
    if (!achado) throw new NaoEncontrado("Fornecedor não encontrado.");
    return achado;
  }

  async criar(input: CriarFornecedor, principal: AuthPrincipal): Promise<Fornecedor> {
    if (input.documento && this.itens.some((f) => f.documento === input.documento)) {
      throw new Conflito("Já existe um fornecedor com este documento.", [{ campo: "documento", problema: "Já existe um fornecedor com este documento." }]);
    }
    return fornecedor({ id: "00000000-0000-4000-8000-000000000302", nome: input.nome, documento: input.documento ?? null, criadoPor: { id: principal.id, nome: "Ana" } });
  }

  async editar(id: string, input: EditarFornecedor): Promise<Fornecedor> {
    return { ...(await this.obter(id)), ...(input.nome ? { nome: input.nome } : {}) };
  }

  async mudarSituacao(id: string, ativo: boolean): Promise<Fornecedor> {
    return { ...(await this.obter(id)), ativo };
  }
}

describe("fornecedores API (e2e)", () => {
  let app: INestApplication;
  let repositorio: FornecedoresEmMemoria;
  const suprimentos = (r: request.Test) => r.set("x-dev-principal", PESSOA).set("x-dev-departamentos", "suprimentos:membro");
  const comTelas = (telas: string[], departamento = "suprimentos") =>
    vi.spyOn(app.get<AuthContext>(AuthContext), "resolve").mockResolvedValue({
      id: PESSOA, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento, nivel: "membro", telas } as never] },
    });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FornecedoresRepository)
      .useClass(FornecedoresEmMemoria)
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    repositorio = app.get(FornecedoresRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação", async () => {
    await request(app.getHttpServer()).get("/suprimentos/fornecedores").expect(401);
  });

  it("quem tem a tela Fornecedores lista, lê, cria, edita, inativa e reativa", async () => {
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/fornecedores")).expect(200);
    await suprimentos(request(app.getHttpServer()).get(`/suprimentos/fornecedores/${ID}`)).expect(200);
    await suprimentos(request(app.getHttpServer()).post("/suprimentos/fornecedores")).send({ nome: "Novo", categoria: "servico" }).expect(201);
    await suprimentos(request(app.getHttpServer()).patch(`/suprimentos/fornecedores/${ID}`)).send({ nome: "Outro nome" }).expect(200);
    const inativado = await suprimentos(request(app.getHttpServer()).post(`/suprimentos/fornecedores/${ID}/inativar`)).expect(200);
    expect(inativado.body.ativo).toBe(false);
    const reativado = await suprimentos(request(app.getHttpServer()).post(`/suprimentos/fornecedores/${ID}/reativar`)).expect(200);
    expect(reativado.body.ativo).toBe(true);
  });

  it("não há rota de exclusão", async () => {
    await suprimentos(request(app.getHttpServer()).delete(`/suprimentos/fornecedores/${ID}`)).expect(404);
  });

  it("Compras sem a tela Fornecedores não alcança o cadastro", async () => {
    const resolver = comTelas(["suprimentos.compras"]);
    try {
      await request(app.getHttpServer()).get("/suprimentos/fornecedores").expect(403);
      await request(app.getHttpServer()).post("/suprimentos/fornecedores").send({ nome: "X", categoria: "outros" }).expect(403);
    } finally {
      resolver.mockRestore();
    }
  });

  it("outros departamentos não alcançam o cadastro", async () => {
    for (const departamento of ["crm", "financeiro", "engenharia-obras"]) {
      await request(app.getHttpServer())
        .get("/suprimentos/fornecedores")
        .set("x-dev-principal", PESSOA)
        .set("x-dev-departamentos", `${departamento}:membro`)
        .expect(403);
    }
  });

  it("documento repetido responde 409 com o campo, sem dado do outro fornecedor", async () => {
    const resposta = await suprimentos(request(app.getHttpServer()).post("/suprimentos/fornecedores"))
      .send({ nome: "Duplicado", categoria: "servico", documento: "99.999.001/0001-59" })
      .expect(409);
    expect(resposta.body.codigo).toBe("CONFLITO_UNICIDADE");
    expect(resposta.body.detalhes).toEqual([{ campo: "documento", problema: "Já existe um fornecedor com este documento." }]);
    expect(JSON.stringify(resposta.body)).not.toContain("Solar Sintético");
  });

  it("documento inválido, campo desconhecido ou empresa no corpo respondem 400", async () => {
    for (const corpo of [
      { nome: "X", categoria: "servico", documento: "99999001000158" },
      { nome: "X", categoria: "servico", empresa: "plugga" },
      { nome: "X", categoria: "inexistente" },
    ]) {
      const resposta = await suprimentos(request(app.getHttpServer()).post("/suprimentos/fornecedores")).send(corpo).expect(400);
      expect(resposta.body.codigo).toBe("REQUISICAO_INVALIDA");
    }
  });

  it("id inexistente responde 404 e id malformado responde 400", async () => {
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/fornecedores/00000000-0000-4000-8000-000000000999")).expect(404);
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/fornecedores/nao-e-uuid")).expect(400);
  });

  it("a lista abre em todos e aceita os filtros", async () => {
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/fornecedores")).expect(200);
    expect(repositorio.ultimaConsulta?.situacao).toBe("todos");
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/fornecedores?busca=solar&situacao=inativos&categoria=kit_solar")).expect(200);
    expect(repositorio.ultimaConsulta).toEqual({ busca: "solar", situacao: "inativos", categoria: "kit_solar" });
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/fornecedores?empresa=waze")).expect(400);
  });
});

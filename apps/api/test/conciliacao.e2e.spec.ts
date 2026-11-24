import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaConciliacaoRepository } from "../src/financeiro/prisma-conciliacao.repository";
import { ArmazenamentoDeDocumentos } from "../src/lead-documentos/armazenamento-de-documentos";

const CONTA = "00000000-0000-4000-8000-000000000a01";
const OFX = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>999<BRANCHID>9999<ACCTID>99999-9</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261101<DTEND>20261130
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261121<TRNAMT>-10.00<FITID>F1<MEMO>TAR PACOTE</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

/** O repositório e o armazenamento são dublês: o serviço (leitura do OFX, conferência da conta, chave) é o de verdade. */
const repositorio = {
  conta: vi.fn().mockResolvedValue({ id: CONTA, companyId: "waze", nome: "Banco A", numero: "99999-9" }),
  importar: vi.fn().mockImplementation(async (_conta, arquivo) => ({
    id: "00000000-0000-4000-8000-000000000b01", contaCorrenteId: CONTA, origem: "ofx", arquivoNome: arquivo.nome,
    periodo: { de: "2026-11-01", ate: "2026-11-30" }, saldoInformado: null, movimentos: 1, novos: 1, repetidos: 0, importadoEm: new Date().toISOString(),
  })),
  listar: vi.fn().mockResolvedValue({ itens: [], extratos: [] }),
  painel: vi.fn().mockResolvedValue({
    escopo: { contaCorrenteId: null, empresa: "waze", de: "2026-11-01", ate: "2026-11-30" },
    resumo: { movimentos: 0, conciliados: 0, sugeridos: 0, valorDiferente: 0, semLancamento: 0, semExtrato: 0, faltaConciliar: "0.00" },
    sugeridos: [], valorDiferente: [], semLancamento: [], semExtrato: [], conciliados: [], extratos: [],
  }),
  conciliar: vi.fn().mockResolvedValue(undefined),
  conciliarSugeridos: vi.fn().mockResolvedValue(2),
  desfazer: vi.fn().mockResolvedValue(undefined),
  marcar: vi.fn().mockResolvedValue(undefined),
};
const armazenamento = { enviar: vi.fn().mockResolvedValue(undefined), excluir: vi.fn().mockResolvedValue(undefined) };

describe("conciliação: importar o extrato e listar os movimentos (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const financeiro = como("financeiro:membro");
  const enviar = (conteudo: string | Buffer, nome = "extrato.ofx") => financeiro(http().post(`/financeiro/contas-correntes/${CONTA}/extratos`)).attach("arquivo", Buffer.from(conteudo), nome);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaConciliacaoRepository).useValue(repositorio)
      .overrideProvider(ArmazenamentoDeDocumentos).useValue(armazenamento)
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("de quem tem o Financeiro (a tela Conciliação); Suprimentos e CRM não entram; sem sessão, 401", async () => {
    await http().get(`/financeiro/conciliacao/movimentos?contaCorrenteId=${CONTA}&de=2026-11-01&ate=2026-11-30`).expect(401);
    for (const d of ["suprimentos:gerente", "crm:membro"]) {
      await como(d)(http().get(`/financeiro/conciliacao/movimentos?contaCorrenteId=${CONTA}&de=2026-11-01&ate=2026-11-30`)).expect(403);
      await como(d)(http().post(`/financeiro/contas-correntes/${CONTA}/extratos`)).attach("arquivo", Buffer.from(OFX), "e.ofx").expect(403);
    }
    await financeiro(http().get(`/financeiro/conciliacao/movimentos?contaCorrenteId=${CONTA}&de=2026-11-01&ate=2026-11-30`)).expect(200);
  });

  it("o período é validado: fim antes do início, mais de um ano e campo fora do contrato são 400", async () => {
    repositorio.listar.mockClear();
    for (const q of [`de=2026-11-30&ate=2026-11-01`, `de=2025-01-01&ate=2026-11-30`, `de=2026-11-01&ate=2026-11-30&x=1`, `de=2026-11-01`]) {
      await financeiro(http().get(`/financeiro/conciliacao/movimentos?contaCorrenteId=${CONTA}&${q}`)).expect(400);
    }
    expect(repositorio.listar).not.toHaveBeenCalled();
  });

  it("importa o OFX: guarda o original numa chave da empresa e da conta, e registra", async () => {
    armazenamento.enviar.mockClear();
    const resposta = await enviar(OFX).expect(201);
    expect(resposta.body).toMatchObject({ origem: "ofx", movimentos: 1, novos: 1, contaConferida: true });
    const [chave, , tipo] = armazenamento.enviar.mock.calls[0]!;
    expect(chave).toMatch(new RegExp(`^financeiro/extratos/waze/${CONTA}/[0-9a-f-]{36}-extrato\\.ofx$`));
    expect(tipo).toBe("application/x-ofx");
    expect(repositorio.importar.mock.calls.at(-1)?.[1]).toMatchObject({ origem: "ofx", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), tamanho: Buffer.from(OFX).length });
  });

  it("recusa antes de guardar: sem arquivo, vazio, que não é OFX, com DOCTYPE ou de outra conta", async () => {
    armazenamento.enviar.mockClear();
    await financeiro(http().post(`/financeiro/contas-correntes/${CONTA}/extratos`)).expect(400);
    await enviar("").expect(415);
    const naoOfx = await enviar("data;valor\n2026-11-01;10", "e.csv").expect(422);
    expect(naoOfx.body).toMatchObject({ codigo: "ARQUIVO_RECUSADO", mensagem: "O arquivo não é um extrato OFX." });
    await enviar(OFX.replace("<OFX>", '<!DOCTYPE OFX [<!ENTITY x SYSTEM "file:///etc/passwd">]><OFX>')).expect(422);
    const outraConta = await enviar(OFX.replace("<ACCTID>99999-9", "<ACCTID>88888-8")).expect(400);
    expect(outraConta.body.mensagem).toMatch(/outra conta/);
    await financeiro(http().post("/financeiro/contas-correntes/x/extratos")).attach("arquivo", Buffer.from(OFX), "e.ofx").expect(400);
    expect(armazenamento.enviar).not.toHaveBeenCalled();
  });

  it("conta sem número no cadastro: importa, mas avisa que não deu para conferir", async () => {
    repositorio.conta.mockResolvedValueOnce({ id: CONTA, companyId: "waze", nome: "Caixa", numero: null });
    expect((await enviar(OFX.replace("F1", "F2")).expect(201)).body).toMatchObject({ contaConferida: false });
  });

  it("se o registro falha, o arquivo guardado sai do armazenamento", async () => {
    armazenamento.excluir.mockClear();
    repositorio.importar.mockRejectedValueOnce(new Error("falhou"));
    await enviar(OFX).expect(500);
    expect(armazenamento.excluir).toHaveBeenCalledTimes(1);
  });

  it("C3: o painel aceita uma conta ou a empresa, e valida o período; as ações validam o corpo antes do repositório", async () => {
    await financeiro(http().get("/financeiro/conciliacao?empresa=waze&de=2026-11-01&ate=2026-11-30")).expect(200);
    await financeiro(http().get(`/financeiro/conciliacao?contaCorrenteId=${CONTA}&de=2026-11-01&ate=2026-11-30`)).expect(200);
    for (const q of ["empresa=outra&de=2026-11-01&ate=2026-11-30", "de=2026-11-30&ate=2026-11-01", "de=2025-01-01&ate=2026-11-30"]) {
      await financeiro(http().get(`/financeiro/conciliacao?${q}`)).expect(400);
    }
    for (const f of Object.values(repositorio)) if ("mockClear" in f) f.mockClear();
    const M = "00000000-0000-4000-8000-000000000c01";
    const L = "00000000-0000-4000-8000-000000000d01";
    await financeiro(http().post("/financeiro/conciliacao/conciliar")).send({ movimentoId: M }).expect(400);
    await financeiro(http().post("/financeiro/conciliacao/marcar")).send({ movimentoId: M, lancamentoId: L, marcado: true }).expect(400);
    await financeiro(http().post("/financeiro/conciliacao/desfazer")).send({ movimentoId: M, motivo: "" }).expect(400);
    expect([repositorio.conciliar, repositorio.marcar, repositorio.desfazer].every((f) => f.mock.calls.length === 0)).toBe(true);

    await financeiro(http().post("/financeiro/conciliacao/conciliar")).send({ movimentoId: M, lancamentoId: L }).expect(200);
    expect((await financeiro(http().post("/financeiro/conciliacao/conciliar-sugeridos")).send({ empresa: "waze", de: "2026-11-01", ate: "2026-11-30" }).expect(200)).body).toEqual({ conciliados: 2 });
    await financeiro(http().post("/financeiro/conciliacao/marcar")).send({ lancamentoId: L, marcado: true }).expect(200);
    expect(repositorio.marcar.mock.calls[0]).toEqual([{ lancamentoId: L }, true]);
  });

  it("C3: desfazer é só da gerência do Financeiro (e da plataforma), com motivo", async () => {
    repositorio.desfazer.mockClear();
    const M = "00000000-0000-4000-8000-000000000c01";
    await financeiro(http().post("/financeiro/conciliacao/desfazer")).send({ movimentoId: M, motivo: "Pareado errado" }).expect(403);
    expect(repositorio.desfazer).not.toHaveBeenCalled();
    await como("financeiro:gerente")(http().post("/financeiro/conciliacao/desfazer")).send({ movimentoId: M, motivo: "Pareado errado" }).expect(200);
    await http().post("/financeiro/conciliacao/desfazer").set("x-dev-principal", "00000000-0000-4000-8000-000000000002").set("x-dev-plataforma", "admin").send({ movimentoId: M, motivo: "Pareado errado" }).expect(200);
    expect(repositorio.desfazer.mock.calls.map((c) => c[1])).toEqual(["Pareado errado", "Pareado errado"]);
  });
});

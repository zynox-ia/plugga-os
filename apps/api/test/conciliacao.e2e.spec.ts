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
    expect(resposta.body).toMatchObject({ origem: "ofx", movimentos: 1, novos: 1 });
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

  it("se o registro falha, o arquivo guardado sai do armazenamento", async () => {
    armazenamento.excluir.mockClear();
    repositorio.importar.mockRejectedValueOnce(new Error("falhou"));
    await enviar(OFX).expect(500);
    expect(armazenamento.excluir).toHaveBeenCalledTimes(1);
  });
});

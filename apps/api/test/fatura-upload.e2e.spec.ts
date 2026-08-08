import { deflateSync } from "node:zlib";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DevAuthGuard } from "../src/core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../src/core/auth/origin-check.guard";
import { RolesGuard } from "../src/core/auth/roles.guard";
import { FaturaController } from "../src/energy-efficiency/fatura/fatura.controller.js";
import { FaturaService } from "../src/energy-efficiency/fatura/fatura.service.js";

/**
 * O envio da conta de luz pela porta HTTP.
 *
 * O que se prova aqui é o contrato com a tela: que o multipart chega inteiro,
 * que a leitura volta no formato que o front consome, e — o mais importante —
 * que arquivo ilegível **não** vira ficha preenchida com zeros.
 *
 * Faturas reais não entram no repositório; os PDFs abaixo são sintéticos, com
 * as mesmas estruturas encontradas no corpus.
 */
function pdfComTexto(conteudo: string): Buffer {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1"),
    deflateSync(Buffer.from(conteudo, "latin1")),
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
}

/**
 * Cada bloco `Tj` vira uma linha, como no PDF de verdade: a fatura é impressa
 * em colunas, e o número da UC e a competência caem em linhas próprias — é
 * disso que a identificação depende.
 */
const FATURA_LEGIVEL = pdfComTexto(
  [
    "AMBAR ENERGIA - AM",
    "Numero da UC",
    "Mes Faturado",
    "Vencimento",
    "0000890358002-74",
    "06/2026",
    "25/07/2026",
    "Leitura Anterior CNPJ Energia Eletrica Tarifa Total",
    "Consumo Ponta 2.170 kWh a 1,805110        1,8051103.917,08",
    "Consumo F/Ponta 12.110 kWh a 0,520140      0,5201406.298,89",
    "Demanda  113 kW a 22,610000               22,6100002.554,93",
  ]
    .map((linha) => `BT (${linha}) Tj ET`)
    .join("\n"),
);

/** Sem camada de texto: é o caso de três quartos das faturas reais. */
const FATURA_DIGITALIZADA = pdfComTexto("q 612 0 0 792 0 0 cm /Im0 Do Q");

/** Foto da conta renomeada para .pdf — 18 das 73 faturas do CRM são assim. */
const FOTO_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("JFIF".padEnd(600, "\0"), "latin1"),
]);

describe("envio da conta de luz (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FaturaController],
      providers: [FaturaService],
    })
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OriginCheckGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lê a fatura e devolve unidade, competência e itens conferidos", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .attach("arquivo", FATURA_LEGIVEL, "fatura.pdf")
      .expect(201);

    expect(resposta.body.unidadeConsumidoraCodigo).toBe("0000890358002-74");
    expect(resposta.body.competenceMonth).toBe(6);
    expect(resposta.body.competenceYear).toBe(2026);
    expect(resposta.body.distribuidora).toBe("AMBAR ENERGIA");
    expect(resposta.body.invoice.consumoPontaKwh).toBe(2_170);
    expect(resposta.body.itens.every((item: { veredicto: string }) => item.veredicto === "confirmado")).toBe(true);
    expect(resposta.body.arquivoNome).toBe("fatura.pdf");
  });

  it("aceita a digitalização mas não inventa um único campo", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .attach("arquivo", FATURA_DIGITALIZADA, "escaneada.pdf")
      .expect(201);

    expect(resposta.body.origem).toBe("digitalizacao");
    expect(resposta.body.aproveitavel).toBe(false);
    // A trava do fluxo: preencher com zeros passaria pela validação do cálculo
    // e produziria um relatório inteiro em cima de nada.
    expect(resposta.body.invoice).toEqual({});
    expect(resposta.body.camposParaConfirmar.length).toBeGreaterThan(0);
  });

  it("diz o que o arquivo é de fato quando não é PDF", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .attach("arquivo", FOTO_JPEG, "conta.pdf")
      .expect(400);

    // A extensão mentia; a mensagem precisa dizer a verdade para a pessoa saber
    // que anexou uma foto, e não que o sistema está quebrado.
    expect(resposta.body.message).toMatch(/foto JPEG/);
  });

  it("recusa requisição sem arquivo", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .expect(400);

    expect(resposta.body.message).toMatch(/envie a conta de luz/);
  });
});

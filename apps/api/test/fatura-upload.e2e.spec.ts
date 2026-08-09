import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DevAuthGuard } from "../src/core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../src/core/auth/origin-check.guard";
import { RolesGuard } from "../src/core/auth/roles.guard";
import { ArmazenamentoDeFaturas } from "../src/energy-efficiency/fatura/armazenamento.js";
import { FaturaController } from "../src/energy-efficiency/fatura/fatura.controller.js";
import { FaturaService } from "../src/energy-efficiency/fatura/fatura.service.js";

/**
 * O envio da conta de luz pela porta HTTP.
 *
 * O que se prova aqui é o contrato com a tela: que o multipart chega inteiro,
 * que a leitura volta no formato que o front consome, e — o mais importante —
 * que arquivo ilegível **não** vira ficha preenchida com zeros.
 *
 * Faturas reais não entram no repositório, então os PDFs são montados aqui. Ao
 * contrário da versão anterior deste teste, eles são **PDFs válidos de
 * verdade**: catálogo, árvore de páginas, fonte, tabela de referências
 * cruzadas. Precisam ser, porque o leitor agora é o pdf.js e não um varredor de
 * bytes que aceitava qualquer coisa com a palavra `stream` dentro. Um teste que
 * passa com arquivo inválido não estava provando que o leitor funciona.
 */

/** Objeto indireto: "N 0 obj <corpo> endobj". */
function objeto(numero: number, corpo: string): string {
  return `${numero} 0 obj\n${corpo}\nendobj\n`;
}

/**
 * Monta um PDF de uma página com as linhas nas posições dadas.
 *
 * Cada linha vira um `Tj` com sua própria matriz de texto, então as
 * coordenadas do arquivo são as coordenadas que o leitor vai enxergar — é o que
 * permite testar a remontagem por linha impressa sem depender de uma fatura de
 * cliente.
 */
function pdfDeUmaPagina(linhas: { texto: string; x: number; y: number }[]): Buffer {
  const conteudo = linhas
    .map(({ texto, x, y }) => `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${texto}) Tj ET`)
    .join("\n");

  const corpos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(conteudo, "latin1")} >>\nstream\n${conteudo}\nendstream`,
  ];

  const cabecalho = "%PDF-1.4\n";
  let corpo = "";
  const deslocamentos: number[] = [];

  for (const [indice, texto] of corpos.entries()) {
    deslocamentos.push(Buffer.byteLength(cabecalho + corpo, "latin1"));
    corpo += objeto(indice + 1, texto);
  }

  const inicioDaTabela = Buffer.byteLength(cabecalho + corpo, "latin1");
  // A tabela tem largura fixa de 20 bytes por entrada; o pdf.js até recupera um
  // arquivo com tabela torta, e é justamente por isso que ela é escrita certa
  // aqui — o teste não pode passar por causa do modo de reparo.
  const tabela =
    `xref\n0 ${corpos.length + 1}\n0000000000 65535 f \n` +
    deslocamentos.map((d) => `${String(d).padStart(10, "0")} 00000 n \n`).join("");

  const fim =
    `trailer\n<< /Size ${corpos.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${inicioDaTabela}\n%%EOF\n`;

  return Buffer.from(cabecalho + corpo + tabela + fim, "latin1");
}

/**
 * Fatura legível, com as colunas nas alturas em que a distribuidora as imprime.
 *
 * A tarifa e o valor ficam na mesma altura da descrição, à direita: é o layout
 * real, e é o que a leitura por linha impressa junta.
 */
const FATURA_LEGIVEL = pdfDeUmaPagina([
  { texto: "AMBAR ENERGIA - AM", x: 60, y: 740 },
  { texto: "Codigo Unico", x: 60, y: 700 },
  { texto: "Mes Faturado", x: 200, y: 700 },
  { texto: "0000890358002-74", x: 60, y: 685 },
  { texto: "06/2026", x: 200, y: 685 },
  { texto: "D. Ctda Pta: 113 D. Ctda F.Pta: 113", x: 60, y: 650 },
  { texto: "Consumo Ponta 2.170 kWh a 1,805110", x: 60, y: 620 },
  { texto: "1,805110", x: 300, y: 620 },
  { texto: "3.917,08", x: 400, y: 620 },
  { texto: "Consumo F/Ponta 12.110 kWh a 0,520140", x: 60, y: 605 },
  { texto: "0,520140", x: 300, y: 605 },
  { texto: "6.298,89", x: 400, y: 605 },
  { texto: "Vencimento", x: 300, y: 540 },
  { texto: "Valor a Pagar", x: 400, y: 540 },
  { texto: "25/07/2026", x: 300, y: 525 },
  { texto: "R$ 10.215,97", x: 400, y: 525 },
]);

/**
 * PDF legítimo que não é uma fatura reconhecível.
 *
 * Tem camada de texto, então não cai no reconhecimento óptico — de propósito:
 * o caminho do OCR precisa de dados de treino e de alguns segundos por página,
 * e vive no teste de integração próprio (`pnpm test:ocr`). Aqui o que se prova
 * é a mesma garantia por um caminho barato: texto que o leitor não entende não
 * vira ficha preenchida.
 */
const DOCUMENTO_QUE_NAO_E_FATURA = pdfDeUmaPagina([
  { texto: "CONTRATO DE PRESTACAO DE SERVICOS", x: 60, y: 700 },
  { texto: "As partes acima qualificadas resolvem celebrar o presente", x: 60, y: 680 },
  { texto: "instrumento particular, que se regera pelas clausulas seguintes", x: 60, y: 665 },
  { texto: "e pelas disposicoes legais aplicaveis a especie, obrigando-se", x: 60, y: 650 },
  { texto: "mutuamente ao seu fiel e integral cumprimento, na forma abaixo.", x: 60, y: 635 },
  { texto: "CLAUSULA PRIMEIRA - DO OBJETO. O presente contrato tem por", x: 60, y: 615 },
  { texto: "objeto a prestacao dos servicos tecnicos descritos no anexo I,", x: 60, y: 600 },
  { texto: "que passa a integrar este instrumento para todos os efeitos.", x: 60, y: 585 },
]);

/** Foto da conta renomeada para .pdf — 18 das 73 faturas do CRM são assim. */
const FOTO_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("JFIF".padEnd(600, "\0"), "latin1"),
]);

/** Planilha enviada por engano: nem PDF nem imagem. */
const PLANILHA = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("conteudo".padEnd(400, "\0"), "latin1"),
]);

describe("envio da conta de luz (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FaturaController],
      providers: [
        FaturaService,
        // Dobro em vez do serviço real: guardar arquivo é apoio, e o que este
        // teste prova é a leitura. Sem armazenamento configurado o serviço real
        // também devolveria chave nula, mas depender disso deixaria o teste
        // preso a uma variável de ambiente.
        { provide: ArmazenamentoDeFaturas, useValue: { guardar: async () => ({ chave: null }) } },
      ],
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

    expect(resposta.body.origem).toBe("texto_direto");
    expect(resposta.body.unidadeConsumidoraCodigo).toBe("0000890358002-74");
    expect(resposta.body.competenceMonth).toBe(6);
    expect(resposta.body.competenceYear).toBe(2026);
    expect(resposta.body.distribuidora).toBe("AMBAR ENERGIA");
    expect(resposta.body.invoice.consumoPontaKwh).toBe(2_170);
    expect(resposta.body.invoice.consumoForaPontaKwh).toBe(12_110);
    expect(resposta.body.arquivoNome).toBe("fatura.pdf");
    expect(
      resposta.body.itens.every((item: { veredicto: string }) => item.veredicto === "confirmado"),
    ).toBe(true);
  });

  it("lê o valor total e a demanda contratada, que antes eram digitados à mão", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .attach("arquivo", FATURA_LEGIVEL, "fatura.pdf")
      .expect(201);

    // A leitura anterior afirmava que estes dois não vinham na camada de texto
    // e os pedia em `camposParaConfirmar`, toda competência.
    expect(resposta.body.invoice.valorTotal).toBe(10_215.97);
    expect(resposta.body.invoice.demandaContratadaKw).toBe(113);
    expect(resposta.body.camposParaConfirmar).not.toContain("valor total da fatura");
    expect(resposta.body.camposParaConfirmar).not.toContain("demanda contratada em kW");
  });

  it("recusa o que não é fatura sem inventar um único campo", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .attach("arquivo", DOCUMENTO_QUE_NAO_E_FATURA, "contrato.pdf")
      .expect(201);

    expect(resposta.body.motivo).toBe("layout_desconhecido");
    expect(resposta.body.aproveitavel).toBe(false);
    // A trava do fluxo: preencher com zeros passaria pela validação do cálculo
    // e produziria um relatório inteiro em cima de nada.
    expect(resposta.body.invoice).toEqual({});
    expect(resposta.body.camposParaConfirmar.length).toBeGreaterThan(0);
  });

  it("aceita foto da conta em vez de recusar na porta", async () => {
    // A versão anterior devolvia 400 com "foto da conta ainda não é lida" — e
    // três quartos do acervo real são exatamente isso. Este JPEG é só a
    // assinatura, sem imagem decodificável, então a leitura recusa; o que
    // importa aqui é **por que** ela recusa.
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .attach("arquivo", FOTO_JPEG, "conta.pdf");

    expect(resposta.status).toBe(400);
    expect(resposta.body.message).toMatch(/corrompid/i);
    expect(resposta.body.message).not.toMatch(/não é um PDF/i);
  });

  it("diz o que o arquivo é de fato quando não é fatura nenhuma", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .attach("arquivo", PLANILHA, "conta.pdf")
      .expect(400);

    // A extensão mentia; a mensagem precisa dizer a verdade para a pessoa saber
    // que anexou outra coisa, e não que o sistema está quebrado.
    expect(resposta.body.message).toMatch(/ZIP/);
  });

  it("recusa requisição sem arquivo", async () => {
    const resposta = await request(app.getHttpServer())
      .post("/energy-efficiency/invoices/read")
      .expect(400);

    expect(resposta.body.message).toMatch(/envie a conta de luz/);
  });
});

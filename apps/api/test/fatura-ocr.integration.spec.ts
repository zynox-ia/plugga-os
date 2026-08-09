import { describe, expect, it } from "vitest";

import { lerCamposExtras } from "../src/energy-efficiency/fatura/campos.js";
import { conferir } from "../src/energy-efficiency/fatura/conferencia.js";
import { normalizar } from "../src/energy-efficiency/fatura/documento.js";
import { identificar } from "../src/energy-efficiency/fatura/identificacao.js";
import { lerItens } from "../src/energy-efficiency/fatura/itens.js";
import { linhasImpressas } from "../src/energy-efficiency/fatura/linhas.js";
import { abrirPdf } from "../src/energy-efficiency/fatura/paginas.js";

/**
 * Leitura óptica de fatura, ponta a ponta.
 *
 * Fica atrás de uma variável de ambiente porque é caro em dois sentidos: o
 * Tesseract baixa ~15 MB de dados de treino na primeira execução e leva alguns
 * segundos por página. Nenhuma das duas coisas cabe na suíte que roda a cada
 * salvamento.
 *
 *     pnpm --filter @plugga/api test:ocr
 *
 * A fatura é sintética, gerada aqui e **rasterizada** antes de ser lida — é o
 * mesmo caminho que uma digitalização percorre, sem depender de arquivo de
 * cliente no repositório.
 */
const HABILITADO = process.env.RUN_OCR_INTEGRATION_TESTS === "true";

/** O OCR é lento; o prazo padrão de 5 s não cobre nem uma página. */
const PRAZO_MS = 5 * 60_000;

function objeto(numero: number, corpo: string): string {
  return `${numero} 0 obj\n${corpo}\nendobj\n`;
}

/** Mesmo montador do teste e2e: um PDF válido, com o texto onde se pede. */
function pdfDeUmaPagina(linhas: { texto: string; x: number; y: number }[]): Buffer {
  const conteudo = linhas
    // Corpo 14: o Tesseract erra muito abaixo de ~10 px de altura de letra, e a
    // fatura real é impressa em corpo comparável a este depois de rasterizada.
    .map(({ texto, x, y }) => `BT /F1 14 Tf 1 0 0 1 ${x} ${y} Tm (${texto}) Tj ET`)
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
  const tabela =
    `xref\n0 ${corpos.length + 1}\n0000000000 65535 f \n` +
    deslocamentos.map((d) => `${String(d).padStart(10, "0")} 00000 n \n`).join("");

  const fim =
    `trailer\n<< /Size ${corpos.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${inicioDaTabela}\n%%EOF\n`;

  return Buffer.from(cabecalho + corpo + tabela + fim, "latin1");
}

const FATURA = pdfDeUmaPagina([
  { texto: "AMBAR ENERGIA - AM", x: 50, y: 730 },
  { texto: "Codigo Unico 0514527-9   Mes Faturado 12/2025", x: 50, y: 690 },
  { texto: "D. Ctda Pta: 270   D. Ctda F.Pta: 270", x: 50, y: 650 },
  { texto: "Itens Faturados", x: 50, y: 610 },
  { texto: "Consumo Ponta 84 kWh a 1,730090", x: 50, y: 580 },
  { texto: "1,730090", x: 330, y: 580 },
  { texto: "145,32", x: 450, y: 580 },
  { texto: "Consumo F/Ponta 1.533 kWh a 0,495920", x: 50, y: 550 },
  { texto: "0,495920", x: 330, y: 550 },
  { texto: "760,24", x: 450, y: 550 },
  { texto: "Vencimento", x: 330, y: 480 },
  { texto: "Valor a Pagar", x: 450, y: 480 },
  { texto: "15/01/2026", x: 330, y: 450 },
  { texto: "361,29", x: 450, y: 450 },
]);

/** Rasteriza a página: é o que transforma o PDF de texto numa digitalização. */
async function comoImagem(pdf: Buffer): Promise<Buffer> {
  const documento = await abrirPdf(pdf);
  try {
    return await documento.rasterizar(1);
  } finally {
    await documento.fechar();
  }
}

describe.skipIf(!HABILITADO)("leitura óptica de fatura", () => {
  it(
    "lê uma fatura que só existe como imagem",
    async () => {
      const imagem = await comoImagem(FATURA);
      const documento = await normalizar(imagem);

      expect(documento.origem).toBe("reconhecimento_optico");
      expect(documento.confianca).toBeGreaterThan(60);

      const linhas = linhasImpressas(documento.paginas);
      const identificacao = identificar(linhas);

      expect(identificacao.unidadeConsumidora).toBe("0514527-9");
      expect(identificacao.competencia).toEqual({ mes: 12, ano: 2025 });
      expect(identificacao.distribuidora).toBe("AMBAR ENERGIA");
    },
    PRAZO_MS,
  );

  it(
    "recompõe as colunas da tabela de itens a partir da posição na folha",
    async () => {
      // Este é o teste que justifica o modo de segmentação em coluna: no modo
      // automático o Tesseract descarta as colunas numéricas inteiras e devolve
      // só os rótulos, e a leitura acha zero item numa página bem reconhecida.
      const documento = await normalizar(await comoImagem(FATURA));
      const itens = lerItens(linhasImpressas(documento.paginas));
      const conferencia = conferir(itens);

      expect(conferencia.confirmados).toBeGreaterThanOrEqual(2);

      const ponta = conferencia.itens.find((item) => /^Consumo Ponta/i.test(item.rotulo));
      expect(ponta?.quantidade).toBe(84);
      expect(ponta?.tarifa).toBeCloseTo(1.73009, 6);
      expect(ponta?.valor).toBeCloseTo(145.32, 2);
      expect(ponta?.veredicto).toBe("confirmado");
    },
    PRAZO_MS,
  );

  it(
    "lê valor total e demanda contratada de uma imagem",
    async () => {
      const documento = await normalizar(await comoImagem(FATURA));
      const extras = lerCamposExtras(documento.paginas);

      expect(extras.demandaContratadaPontaKw).toBe(270);
      expect(extras.demandaContratadaForaPontaKw).toBe(270);
      expect(extras.valorTotal).toBeCloseTo(361.29, 2);
    },
    PRAZO_MS,
  );

  it(
    "não derruba o processo com imagem corrompida",
    async () => {
      // Uma imagem truncada é o pior caso: veio de fora e é decodificada por
      // biblioteca. Tem de virar erro tratável, nunca queda do processo.
      const truncada = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        Buffer.from("JFIF".padEnd(2_000, "\0"), "latin1"),
      ]);

      await expect(normalizar(truncada)).rejects.toThrow(/corrompid/i);
    },
    PRAZO_MS,
  );
});

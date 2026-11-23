import type { OrdemDeServico } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { TermoDaOrdemPdf } from "./termo-da-ordem.pdf";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const ordem = {
  codigo: "OS-0042",
  empresa: "waze",
  tipo: "manutencao",
  cliente: { id: "c", nome: "Cliente Fictício" },
  local: "Rua das Flores, 10",
  uc: { id: "u", codigo: "123456", distribuidora: "Amazonas Energia" },
  tecnico: { id: "t", nome: "Técnico Fictício" },
  apoio: null,
  checkinEm: "2026-11-23T14:00:00.000Z",
  equipamento: { equipamento: "Inversor", fabricante: "Growatt", modelo: "MIN 5000", numeroSerie: "GW123" },
  laudo: { encontrado: "Disjuntor desarmado", feito: "Rearme", recomendacao: null, registrado: { por: null, em: "2026-11-23T15:00:00.000Z" } },
  fotos: [{}],
} as unknown as OrdemDeServico;

describe("PDF do termo da O.S.", () => {
  const pdf = new TermoDaOrdemPdf();

  it("gera o PDF com o nome digitado", async () => {
    const buffer = await pdf.render({ ordem, modo: "nome_digitado", nome: "Maria Fictícia", documento: "123.456.789-01", assinatura: null, assinadoEm: new Date("2026-11-23T16:00:00Z") });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("gera o PDF com a assinatura desenhada e recusa PNG quebrado", async () => {
    const buffer = await pdf.render({ ordem, modo: "desenhada", nome: "Maria Fictícia", documento: "123.456.789-01", assinatura: PNG_1X1, assinadoEm: new Date() });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    await expect(pdf.render({ ordem, modo: "desenhada", nome: "Maria", documento: "1234567", assinatura: Buffer.concat([PNG_1X1.subarray(0, 20)]), assinadoEm: new Date() })).rejects.toThrow();
  });
});

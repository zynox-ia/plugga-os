import { describe, expect, it } from "vitest";
import type { LeadProposal } from "@plugga/shared";
import { createCanvas } from "@napi-rs/canvas";

import { LeadPropostasPdf } from "./lead-propostas.pdf";

const content = {
  title: "Proposta comercial · Energia São João", recipient: "João da Conceição", company: "Energia e ação", email: "", phone: "", city: "Manaus / AM",
  owner: "André", jobTitle: "Direção", amount: "18500.00", validUntil: "2026-11-20", introduction: "Solução com redução e eficiência.", scope: "Escopo técnico.", payment: "Pagamento à vista.", notes: "<script>alert('teste')</script> & (texto) \\ seguro",
};
const proposal: LeadProposal = { id: "id", dealId: "deal", number: 1, templateId: "template", templateName: "Proposta essencial", templateStyle: "essencial", status: "draft", version: 0, revision: 1, content, document: null, createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" };

async function readPdf(buffer: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, isEvalSupported: false });
  const pdf = await loading.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const text = await page.getTextContent();
      pages.push(text.items.flatMap((item) => "str" in item ? [item.str] : []).join(" "));
      expect(await page.getAnnotations()).toEqual([]);
      if (n === 1) {
        const viewport = page.getViewport({ scale: 1 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context as never, viewport }).promise;
        // Texto extraível não basta: WOFF2 no fontkit gerava PDFs com glifos invisíveis.
        const pixels = context.getImageData(46, 20, 140, 30).data;
        const cover = pages[0]?.includes("Uma solução construída");
        let ink = 0;
        for (let p = 0; p < pixels.length; p += 4) {
          if (cover ? pixels[p]! > 200 && pixels[p + 1]! > 200 : pixels[p]! < 180 && pixels[p + 2]! > 80) ink++;
        }
        expect(ink).toBeGreaterThan(60);
      }
    }
    return pages;
  } finally { await pdf.destroy(); }
}

describe("PDF real das propostas", () => {
  it("embute fontes, preserva acentos, data civil, valor e texto literal sem executar marcação", async () => {
    const bytes = await new LeadPropostasPdf().render(proposal, true);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    const pages = await readPdf(bytes);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("João da Conceição");
    expect(pages[0]).toContain("Rascunho");
    expect(pages[0]).toContain("20/11/2026");
    expect(pages[0]).toContain("18.500,00");
    expect(pages[0]).toContain("<script>alert('teste')</script>");
  });
  it("gera capa consultiva e pagina conteúdo extenso sem perder o final", async () => {
    const long = "Ação sustentável e redução de custos. ".repeat(155) + "FIM DO ESCOPO";
    const bytes = await new LeadPropostasPdf().render({ ...proposal, templateStyle: "consultiva", content: { ...content, introduction: long, scope: long, payment: long, notes: long } }, false);
    const pages = await readPdf(bytes);
    expect(pages.length).toBeGreaterThan(3);
    expect(pages[0]).toContain("Versão 1");
    expect(pages.join(" ")).not.toContain("Rascunho");
    expect(pages.join(" ").match(/FIM DO ESCOPO/g)).toHaveLength(4);
  });
  it("mantém títulos e destinatários máximos na capa e continua com detalhes legíveis", async () => {
    const bytes = await new LeadPropostasPdf().render({ ...proposal, templateStyle: "consultiva", content: { ...content, title: "W".repeat(300), recipient: "W".repeat(300) } }, true);
    const pages = await readPdf(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("INVESTIMENTO PROPOSTO");
    expect(pages[1]).toContain("Detalhamento da proposta");
  });
  it("quebras no título/destinatário não empurram texto branco da capa para páginas brancas", async () => {
    const bytes = await new LeadPropostasPdf().render({ ...proposal, templateStyle: "consultiva", content: { ...content, title: "W\n".repeat(150), recipient: "W\n".repeat(150) } }, true);
    const pages = await readPdf(bytes);
    expect(pages[0]).toContain("INVESTIMENTO PROPOSTO");
    expect(pages[1]).toContain("Detalhamento da proposta");
  });
});

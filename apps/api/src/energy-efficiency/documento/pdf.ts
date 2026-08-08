/**
 * Conversão do relatório em PDF.
 *
 * Chromium via Playwright, que é o mesmo caminho usado hoje pelo agente. O
 * SKILL.md é explícito quanto a **não** usar LibreOffice: ele destrói o layout
 * do documento. Como o Playwright já está no repositório para os testes de
 * navegação, não entra dependência nova.
 *
 * O HTML é carregado como conteúdo, não como arquivo: os logos vêm embutidos em
 * base64 e o CSS é inline, então o documento não depende de rede nem de caminho
 * de disco — o que também evita que uma falha de rede produza PDF sem marca.
 */

export type OpcoesDePdf = {
  /** Paisagem para o estudo de eficiência, que tem gráficos largos. */
  orientacao?: "retrato" | "paisagem";
};

export async function gerarPdf(html: string, opcoes: OpcoesDePdf = {}): Promise<Buffer> {
  // Importado sob demanda: o Playwright é dependência de desenvolvimento e a
  // API precisa subir sem ele quando ninguém for gerar PDF.
  const { chromium } = await import("playwright");

  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: "load" });

    return await pagina.pdf({
      format: "A4",
      landscape: opcoes.orientacao !== "retrato",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "12mm", left: "10mm" },
    });
  } finally {
    await navegador.close();
  }
}

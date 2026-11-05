import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Deal, LeadDocument, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipeline: Pipeline;
let negocio: Deal;

async function criar<T>(request: APIRequestContext, origin: string, url: string, data: object): Promise<T> {
  const resposta = await request.post(url, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}

// Um PDF de uma página com referências xref válidas para o visualizador real.
function pdf(texto: string): Buffer {
  const conteudo = `BT /F1 18 Tf 30 150 Td (${texto}) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(conteudo)} >>\nstream\n${conteudo}\nendstream`,
  ];
  let corpo = "%PDF-1.4\n";
  const offsets = [0];
  objetos.forEach((objeto, indice) => { offsets.push(Buffer.byteLength(corpo)); corpo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`; });
  const xref = Buffer.byteLength(corpo);
  corpo += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  corpo += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${corpo}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a3sAAAAASUVORK5CYII=", "base64");

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  pipeline = await criar(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Documentos E2E ${Date.now()}`, description: null,
    valueLabel: "Investimento", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["Entrada"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })),
    tags: [], lossReasons: [], members: [],
  });
  negocio = await criar(request, baseURL!, "/api/leads", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id,
    title: "Documentos sintéticos", value: null, tagIds: [],
    lead: { personType: "pj", name: "Lead sintético de documentos", email: `docs-${Date.now()}@teste.local` },
  });
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("envia e visualiza arquivos reais, persiste e arquiva com confirmação e nova tentativa", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  await page.getByRole("button", { name: `Ver lead ${negocio.lead.name}`, exact: true }).click();
  const lead = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await lead.getByRole("tab", { name: "Documentos", exact: true }).click();
  const painel = lead.getByRole("tabpanel");
  await expect(painel.getByRole("heading", { name: /Documentos do lead/ })).toBeVisible();
  await expect(painel.getByText("Nenhum documento nesta categoria.")).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await painel.getByRole("button", { name: "Enviar documentos", exact: true }).click();
  await (await chooser).setFiles([
    { name: "proposta-sintetica.pdf", mimeType: "application/pdf", buffer: pdf("Proposta sintetica") },
    { name: "imagem-sintetica.png", mimeType: "image/png", buffer: png },
  ]);
  const envio = page.getByRole("dialog", { name: "Enviar documentos", exact: true });
  await expect(envio.getByText("proposta-sintetica.pdf")).toBeVisible();
  await expect(envio.getByText("imagem-sintetica.png")).toBeVisible();
  await envio.getByRole("combobox", { name: "Categoria dos documentos" }).click();
  await page.getByRole("option", { name: "Proposta", exact: true }).click();
  const uploads: Promise<LeadDocument>[] = [];
  const observar = (response: import("@playwright/test").Response) => {
    if (new URL(response.url()).pathname === `/api/leads/${negocio.id}/documentos` && response.request().method() === "POST") {
      uploads.push((async () => { expect(response.ok()).toBe(true); return response.json(); })());
    }
  };
  page.on("response", observar);
  await envio.getByRole("button", { name: /Enviar .*documentos/ }).click();
  await expect(envio).toHaveCount(0);
  await expect.poll(() => uploads.length).toBe(2);
  const enviados = await Promise.all(uploads);
  expect(enviados.map((d) => d.originalName).sort()).toEqual(["imagem-sintetica.png", "proposta-sintetica.pdf"]);
  expect(enviados.every((d) => d.category === "proposta" && d.archivedAt === null)).toBe(true);
  page.off("response", observar);
  await expect(painel.getByText("proposta-sintetica.pdf", { exact: true })).toBeVisible();
  await expect(painel.getByText("imagem-sintetica.png", { exact: true })).toBeVisible();

  await painel.getByRole("combobox", { name: "Filtrar documentos" }).click();
  await page.getByRole("option", { name: "Outros", exact: true }).click();
  await expect(painel.getByText("proposta-sintetica.pdf", { exact: true })).toHaveCount(0);
  await painel.getByRole("combobox", { name: "Filtrar documentos" }).click();
  await page.getByRole("option", { name: "Todas as categorias", exact: true }).click();
  await lead.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: `Ver lead ${negocio.lead.name}`, exact: true }).click();
  await lead.getByRole("tab", { name: "Documentos", exact: true }).click();
  await expect(painel.getByText("proposta-sintetica.pdf", { exact: true })).toBeVisible();
  await page.reload();
  await expect(lead).toBeVisible();
  await lead.getByRole("tab", { name: "Documentos", exact: true }).click();
  await expect(painel.getByText("imagem-sintetica.png", { exact: true })).toBeVisible();

  const dropzone = painel.locator('[data-dropzone="documentos"]');
  await expect(dropzone.getByText("Arraste seus documentos para cá")).toBeVisible();
  const bytes = Array.from(pdf("Documento arrastado"));
  await dropzone.evaluate((elemento, dados) => {
    const transferencia = new DataTransfer();
    transferencia.items.add(new File([new Uint8Array(dados)], "arrastado.pdf", { type: "application/pdf" }));
    for (const tipo of ["dragenter", "dragover", "drop"]) elemento.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: transferencia }));
  }, bytes);
  await expect(envio.getByText("arrastado.pdf")).toBeVisible();
  const post = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/leads/${negocio.id}/documentos` && r.request().method() === "POST");
  await envio.getByRole("button", { name: "Enviar documento", exact: true }).click();
  expect((await post).ok()).toBe(true);
  await expect(painel.getByText("arrastado.pdf", { exact: true })).toBeVisible();

  const visualizar = painel.getByRole("button", { name: "Visualizar proposta-sintetica.pdf", exact: true });
  const excluir = painel.getByRole("button", { name: "Arquivar proposta-sintetica.pdf", exact: true });
  const baixar = painel.getByRole("link", { name: "Baixar proposta-sintetica.pdf", exact: true });
  const [olho, lixeira, download] = await Promise.all([visualizar.boundingBox(), excluir.boundingBox(), baixar.boundingBox()]);
  expect(olho!.x).toBeLessThan(lixeira!.x);
  expect(lixeira!.x).toBeLessThan(download!.x);
  await visualizar.click();
  const visualizador = page.getByRole("dialog", { name: "Visualizar documento", exact: true });
  await expect(visualizador.getByLabel("proposta-sintetica.pdf, página 1")).toBeVisible();
  await visualizador.getByRole("button", { name: "Fechar", exact: true }).click();
  await excluir.click();
  const confirmacao = page.getByRole("dialog", { name: "Arquivar documento?", exact: true });
  const cancelar = confirmacao.getByRole("button", { name: "Cancelar", exact: true });
  const confirmar = confirmacao.getByRole("button", { name: "Arquivar documento", exact: true });
  await expect(cancelar).toBeFocused();
  expect((await cancelar.boundingBox())!.x).toBeLessThan((await confirmar.boundingBox())!.x);
  await cancelar.click();
  await expect(painel.getByText("proposta-sintetica.pdf", { exact: true })).toBeVisible();
  await excluir.click();
  const id = enviados.find((d) => d.originalName === "proposta-sintetica.pdf")!.id;
  let falhar = true;
  await page.route(`**/api/leads/${negocio.id}/documentos/${id}/arquivar`, (route) => {
    if (falhar) { falhar = false; return route.fulfill({ status: 503, json: { codigo: "SERVICO_INDISPONIVEL", mensagem: "Falha sintética ao arquivar" } }); }
    return route.continue();
  });
  await confirmar.click();
  await expect(confirmacao).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Falha sintética ao arquivar" })).toBeVisible();
  await expect(painel.getByText("proposta-sintetica.pdf", { exact: true })).toBeVisible();
  const arquivamento = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/leads/${negocio.id}/documentos/${id}/arquivar` && r.request().method() === "POST");
  await confirmar.click();
  const resposta = await arquivamento;
  expect(resposta.ok()).toBe(true);
  expect((await resposta.json()).archivedAt).toBeTruthy();
  await expect(painel.getByText("proposta-sintetica.pdf", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(lead).toBeVisible();
  await lead.getByRole("tab", { name: "Documentos", exact: true }).click();
  await expect(painel.getByText("proposta-sintetica.pdf", { exact: true })).toHaveCount(0);
  await expect(painel.getByText("imagem-sintetica.png", { exact: true })).toBeVisible();
});

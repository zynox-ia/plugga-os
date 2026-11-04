import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Deal, LeadProposal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipeline: Pipeline;
let negocio: Deal;
let outro: Deal;
async function criar<T>(request: APIRequestContext, origin: string, url: string, data: object): Promise<T> {
  const resposta = await request.post(url, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}
test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  pipeline = await criar(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Propostas E2E ${Date.now()}`, description: null, valueLabel: "Investimento estimado", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [], members: [],
  });
  for (const name of ["Lead de propostas", "Outro lead de propostas"]) {
    const criado = await criar<Deal>(request, baseURL!, "/api/leads", {
      pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id,
      title: "Solução comercial de teste", value: "18500.00", tagIds: [],
      lead: { personType: "pj", name, companyName: "Empresa sintética", email: "propostas@empresa.example", phone: "11988887777", city: "São Paulo", state: "SP", jobTitle: "Gerente comercial", mainInterest: "Eficiência energética", notes: "Contato no período da tarde." },
    });
    if (!negocio) negocio = criado; else outro = criado;
  }
});
test.afterAll(async ({ request, baseURL }) => { if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {}); });

test("propostas usam dados reais, preservam rascunhos e versões e disponibilizam PDF nos documentos", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  await page.getByRole("button", { name: `Ver lead ${negocio.lead.name}`, exact: true }).click();
  const lead = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await expect(lead.getByText("Próxima ação", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const topo = await lead.getByRole("tablist").boundingBox();
  await lead.getByRole("tab", { name: "Documentos", exact: true }).click();
  await expect(lead.getByRole("heading", { name: /Documentos/ })).toBeVisible();
  await lead.getByRole("tab", { name: "Propostas", exact: true }).click();
  await expect(lead.getByText("A primeira proposta começa aqui", { exact: true })).toBeVisible();
  await lead.getByRole("button", { name: "Gerar proposta", exact: true }).click();
  const modelos = page.getByRole("dialog", { name: "Nova proposta comercial", exact: true });
  await expect(modelos.getByRole("button", { name: /Proposta essencial/ })).toHaveAttribute("aria-pressed", "true");
  await modelos.getByRole("button", { name: "Continuar", exact: true }).click();
  let editor = page.getByRole("dialog", { name: "Nova proposta comercial", exact: true });
  await expect(editor.getByLabel("Cliente / destinatário", { exact: false })).toHaveValue(negocio.lead.name);
  await expect(editor.getByLabel("Empresa", { exact: true })).toHaveValue("Empresa sintética");
  await expect(editor.getByLabel("Cargo / função do contato", { exact: true })).toHaveValue("Gerente comercial");
  await expect(editor.getByLabel("Celular / WhatsApp", { exact: true })).toHaveValue("(11) 98888-7777");
  await expect(editor.getByLabel("Investimento proposto", { exact: true })).toHaveValue("18.500,00");
  await expect(editor.getByLabel("Escopo e entregáveis", { exact: true })).toHaveValue("Eficiência energética");
  await editor.getByLabel("Título da proposta", { exact: false }).fill("Oferta revisada");
  await editor.getByLabel(/^Validade da proposta/).fill("29022028");
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  const descarte = page.getByRole("dialog", { name: "Descartar alterações da proposta?", exact: true });
  await descarte.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(editor.getByLabel("Título da proposta", { exact: false })).toHaveValue("Oferta revisada");
  await editor.getByRole("button", { name: "Visualizar prévia", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Visualizar proposta", exact: true });
  const canvas = preview.getByLabel("Oferta revisada, página 1", { exact: true });
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).width)).toBeGreaterThan(500);
  await expect(preview.getByText("Rascunho", { exact: true })).toBeVisible();
  const lista = async () => (await (await request.get(`/api/leads/${negocio.id}/propostas`)).json()).proposals as LeadProposal[];
  let proposta = (await lista())[0]!;
  expect(proposta).toMatchObject({ status: "draft", version: 0, content: { validUntil: "2028-02-29", title: "Oferta revisada" } });
  const rascunho = await request.get(`/api/leads/${negocio.id}/propostas/${proposta.id}/download`);
  expect((await rascunho.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await preview.getByRole("button", { name: "Voltar à edição", exact: true }).click();
  editor = page.getByRole("dialog", { name: "Editar proposta comercial", exact: true });
  await editor.getByRole("button", { name: "Gerar PDF", exact: true }).click();
  await expect(preview).toContainText("Versão 1");
  proposta = (await lista())[0]!;
  expect(proposta.status).toBe("generated"); expect(proposta.version).toBe(1); expect(proposta.document).not.toBeNull();
  const pdf = await request.get(`/api/leads/${negocio.id}/propostas/${proposta.id}/download`);
  const arquivo = await request.get(`/api/leads/${negocio.id}/documentos/${proposta.document!.id}/download`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect(await pdf.body()).toEqual(await arquivo.body());
  const primeiraVersao = await arquivo.body();
  await preview.getByRole("button", { name: "Fechar", exact: true }).click();
  const linha = lead.getByRole("listitem", { name: "Oferta revisada", exact: true });
  await expect(linha).toContainText("Válida até 29/02/2028");
  await expect(linha.getByText("Gerada", { exact: true })).toHaveCSS("border-radius", "999px");
  expect((await lead.getByRole("tablist").boundingBox())!.y).toBeCloseTo(topo!.y, 0);
  await lead.getByRole("tab", { name: "Documentos", exact: true }).click();
  await expect(lead.getByText(proposta.document!.originalName, { exact: true })).toBeVisible();
  await lead.getByRole("tab", { name: "Propostas", exact: true }).click();
  await linha.getByRole("button", { name: "Editar Oferta revisada", exact: true }).click();
  editor = page.getByRole("dialog", { name: "Editar proposta comercial", exact: true });
  const concorrente = await request.patch(`/api/leads/${negocio.id}/propostas/${proposta.id}`, { headers: { origin: baseURL! }, data: { revision: proposta.revision, templateId: proposta.templateId, content: { ...proposta.content, notes: "Atualização concorrente." } } });
  expect(concorrente.ok(), await concorrente.text()).toBe(true);
  await editor.getByLabel("Observações", { exact: true }).fill("Meu texto permanece aqui.");
  await editor.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(editor.getByRole("alert")).toBeVisible();
  await expect(editor.getByLabel("Observações", { exact: true })).toHaveValue("Meu texto permanece aqui.");
  await editor.getByRole("button", { name: "Recarregar proposta atual", exact: true }).click();
  await descarte.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(editor.getByLabel("Observações", { exact: true })).toHaveValue("Atualização concorrente.");
  await editor.getByLabel("Título da proposta", { exact: false }).fill("Oferta versão dois");
  await editor.getByRole("button", { name: "Gerar PDF", exact: true }).click();
  await expect(preview).toContainText("Versão 2");
  await expect(preview.getByLabel("Oferta versão dois, página 1", { exact: true })).toBeVisible();
  await expect.poll(() => preview.getByLabel("Oferta versão dois, página 1", { exact: true }).evaluate((el) => (el as HTMLCanvasElement).width)).toBeGreaterThan(500);
  await page.screenshot({ path: testInfo.outputPath("proposta-pdf.png") });
  expect(await (await request.get(`/api/leads/${negocio.id}/documentos/${proposta.document!.id}/download`)).body()).toEqual(primeiraVersao);
  const perfil = await (await request.get(`/api/leads/${negocio.id}`)).json();
  expect(perfil.lead.name).toBe(negocio.lead.name);
  expect((await (await request.get(`/api/leads/${outro.id}/propostas`)).json()).proposals).toEqual([]);
  expect((await request.get(`/api/leads/${outro.id}/propostas/${proposta.id}/download`)).status()).toBe(404);
  await preview.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await expect(lead).toBeVisible();
  await lead.getByRole("tab", { name: "Propostas", exact: true }).click();
  await expect(lead.getByRole("listitem", { name: "Oferta versão dois", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("propostas-desktop.png") });
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await lead.getByRole("tabpanel").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

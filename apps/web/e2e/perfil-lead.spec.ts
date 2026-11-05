import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipeline: Pipeline;
let negocio: Deal;
async function criar<T>(request: APIRequestContext, origin: string, url: string, data: object): Promise<T> {
  const resposta = await request.post(url, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}
test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  pipeline = await criar(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Perfil E2E ${Date.now()}`, description: null, valueLabel: "Investimento estimado", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [], members: [],
  });
  negocio = await criar(request, baseURL!, "/api/leads", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id,
    title: "Qualificação comercial de demonstração", value: null, tagIds: [],
    lead: { personType: "pj", name: "Perfil comercial de teste", email: "perfil@empresa.example" },
  });
});
test.afterAll(async ({ request, baseURL }) => { if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {}); });

test("perfil aplica máscaras ao digitar, valida e persiste a qualificação sem cadastro fiscal", async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  await page.getByRole("button", { name: `Ver lead ${negocio.lead.name}`, exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  const abas = modal.getByRole("tablist", { name: "Seções do lead" });
  await expect(abas.getByRole("tab")).toHaveText(["Visão geral", "Perfil", "Propostas", "Oportunidade", "Histórico", "Documentos"]);
  await abas.getByRole("tab", { name: "Perfil", exact: true }).click();
  const editar = modal.getByRole("button", { name: "Editar perfil", exact: true });
  await expect(editar.locator(".ui-button-label")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(editar.locator("svg")).toHaveCSS("color", "rgb(255, 255, 255)");
  await editar.click();
  await expect(modal.getByLabel(/CPF|CNPJ|Razão social|Instagram|Origem do lead/i)).toHaveCount(0);
  await modal.getByLabel("Empresa", { exact: true }).fill("Empresa comercial de teste");
  await modal.getByLabel("Cargo / função do contato", { exact: true }).fill("Gerente comercial");
  const celular = modal.getByLabel("Celular / WhatsApp", { exact: true });
  await celular.pressSequentially("11988887777");
  await expect(celular).toHaveValue("(11) 98888-7777");
  const fixo = modal.getByLabel("Telefone fixo", { exact: true });
  await fixo.fill("1133334444");
  await expect(fixo).toHaveValue("(11) 3333-4444");
  await modal.getByLabel("Site", { exact: true }).fill("empresa.example");
  const cep = modal.getByLabel("CEP", { exact: true });
  await cep.pressSequentially("01310");
  await expect(cep).toHaveValue("01310");
  await cep.pressSequentially("2");
  await expect(cep).toHaveValue("01310-2");
  await cep.pressSequentially("00");
  await expect(cep).toHaveValue("01310-200");
  await modal.getByLabel("Rua / número", { exact: true }).fill("Avenida Paulista, 1578");
  await modal.getByLabel("Complemento", { exact: true }).fill("Endereço público de referência");
  await modal.getByLabel("Bairro", { exact: true }).fill("Bela Vista");
  await modal.getByLabel("Cidade", { exact: true }).fill("São Paulo");
  await modal.getByRole("combobox", { name: "Estado / UF", exact: true }).click();
  await page.getByRole("option", { name: "SP", exact: true }).click();
  await expect(modal.getByRole("link", { name: "Abrir no Google Maps", exact: true })).toHaveAttribute("href", /1578.*01310-200/);
  await modal.getByLabel("Segmento / interesse principal", { exact: true }).fill("Comércio · redução de custos com energia");
  await modal.getByLabel("Observações importantes", { exact: true }).fill("Preferência por contato no período da tarde.");
  const email = modal.getByLabel("E-mail", { exact: true });
  await email.fill("email-invalido");
  const salvar = modal.getByRole("button", { name: "Salvar alterações", exact: true });
  await expect(salvar.locator(".ui-button-label")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(salvar.locator("svg")).toHaveCSS("color", "rgb(255, 255, 255)");
  await salvar.click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(modal.getByRole("alert")).toContainText("Confira os campos");
  await email.fill("perfil.salvo@empresa.example");
  const resposta = page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === `/api/leads/${negocio.id}`);
  await salvar.click();
  expect((await resposta).ok()).toBe(true);
  await expect(editar).toBeVisible();
  await expect(modal.getByRole("link", { name: "WhatsApp", exact: true })).toHaveAttribute("href", "https://wa.me/5511988887777");
  const gravado = await (await request.get(`/api/leads/${negocio.id}`)).json();
  expect(gravado.lead).toMatchObject({ companyName: "Empresa comercial de teste", jobTitle: "Gerente comercial", phone: "11988887777", landlinePhone: "1133334444", email: "perfil.salvo@empresa.example", website: "https://empresa.example", postalCode: "01310200", mainInterest: "Comércio · redução de custos com energia", document: null, legalName: null });
  await page.reload();
  await expect(modal).toBeVisible();
  await modal.getByRole("tab", { name: "Perfil", exact: true }).click();
  await expect(modal.getByRole("region", { name: "Identificação", exact: true })).toContainText("Empresa comercial de teste");
  await expect(modal.getByRole("region", { name: "Contato e canais", exact: true })).toContainText("(11) 3333-4444");
  const qualificacao = modal.getByRole("region", { name: "Qualificação comercial", exact: true });
  await qualificacao.scrollIntoViewIfNeeded();
  const lados = await qualificacao.locator(":scope > div").all();
  const esquerda = (await lados[0]!.boundingBox())!;
  const direita = (await lados[1]!.boundingBox())!;
  expect(esquerda.y).toBeCloseTo(direita.y, 0);
  expect(esquerda.height).toBeCloseTo(direita.height, 0);
  await editar.click();
  await modal.getByLabel("Empresa", { exact: true }).fill("Alteração descartada");
  await email.fill("outro-email-invalido");
  await salvar.click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(modal.getByRole("alert")).toHaveCount(0);
  await expect(modal.getByRole("region", { name: "Identificação", exact: true })).not.toContainText("Alteração descartada");
  await editar.click();
  await modal.getByLabel("Telefone fixo", { exact: true }).clear();
  await modal.getByLabel("Site", { exact: true }).clear();
  const limpar = page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === `/api/leads/${negocio.id}`);
  await salvar.click();
  expect((await limpar).ok()).toBe(true);
  const limpo = await (await request.get(`/api/leads/${negocio.id}`)).json();
  expect(limpo.lead.landlinePhone).toBeNull(); expect(limpo.lead.website).toBeNull();
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await modal.getByRole("tabpanel").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

import { expect, test } from "@playwright/test";
import { pipelineParaEdicao, type DealDetail, type LeadDocument, type Pipeline, type PipelinePeopleResponse, type PipelineProcessProfile } from "@plugga/shared";

const pipelinesCriados: string[] = [];
test.afterEach(async ({ request, baseURL }) => {
  for (const id of pipelinesCriados.splice(0)) {
    const resposta = await request.post(`/api/pipelines/${id}/arquivar`, { headers: { origin: baseURL! } });
    expect(resposta.ok()).toBe(true);
  }
});

test("ficha Solar guarda UCs sem cliente, seleciona conta tipada e preserva referência indisponível", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const headers = { origin: baseURL! };
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  const criar = async <T>(url: string, data: object): Promise<T> => {
    const resposta = await request.post(url, { headers, data });
    expect(resposta.ok(), await resposta.text()).toBe(true);
    return resposta.json();
  };
  const campo = (name: string, type: "select" | "number", options: string[] = []) => ({ name, type, options: options.map((name) => ({ name })), showOnCard: false, showInList: true });
  let pipeline = await criar<Pipeline>("/api/pipelines", {
    companyId: "plugga", name: `Projeto Solar E2E ${Date.now()}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [{ name: "Atendimento", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [],
    fields: [campo("Tipo de instalação", "select", ["Residencial", "Comercial", "Rural"]), campo("Consumo mensal (kWh)", "number"), campo("Tipo de telhado", "select", ["Laje", "Solo"]), campo("Área disponível (m²)", "number"), campo("Potência estimada (kWp)", "number")],
  });
  pipelinesCriados.push(pipeline.id);
  const fields = pipeline.fields!;
  const processProfile: PipelineProcessProfile = { key: "solar_commercial", version: 1, bindings: {
    installationType: { fieldId: fields[0]!.id, options: { residential: fields[0]!.options[0]!.id, commercial: fields[0]!.options[1]!.id, rural: fields[0]!.options[2]!.id } },
    averageConsumptionKwh: { fieldId: fields[1]!.id }, roofType: { fieldId: fields[2]!.id }, availableAreaM2: { fieldId: fields[3]!.id }, estimatedPowerKwp: { fieldId: fields[4]!.id },
  } };
  const associacao = await request.put(`/api/pipelines/${pipeline.id}`, { headers, data: { ...pipelineParaEdicao(pipeline), processProfile } });
  expect(associacao.status()).toBe(200);
  pipeline = await associacao.json();
  const negocio = await criar<DealDetail>("/api/leads", { pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id, title: "Projeto UC sintético", lead: { personType: "pj", name: "Lead Solar sintético", email: "solar-projeto@teste.local" } });
  const upload = await request.post(`/api/leads/${negocio.id}/documentos`, { headers, multipart: { category: "conta_de_energia", arquivo: { name: "conta-principal-sintetica.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a3sAAAAASUVORK5CYII=", "base64") } } });
  expect(upload.status()).toBe(201);
  const conta: LeadDocument = await upload.json();
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const ficha = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  const abrirFicha = async () => { await page.getByRole("button", { name: "Ver lead Lead Solar sintético", exact: true }).click(); await ficha.getByRole("tab", { name: "Oportunidade", exact: true }).click(); };
  const salvar = async () => {
    const gravacao = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/leads/${negocio.id}`));
    await ficha.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    expect((await gravacao).status()).toBe(200);
    await expect(ficha.getByText("Alterações salvas.", { exact: true })).toBeVisible();
  };
  await abrirFicha();
  await ficha.getByLabel("UC principal", { exact: true }).fill("000001-0");
  await ficha.getByRole("button", { name: "Adicionar UC beneficiária", exact: true }).click();
  await ficha.getByLabel("UC beneficiária 1", { exact: true }).fill("000001-0");
  await ficha.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(ficha.getByText("UC repetida nesta ficha", { exact: false })).toBeVisible();
  await ficha.getByLabel("UC beneficiária 1", { exact: true }).fill("000002-0");
  await ficha.getByLabel("Conta de energia principal", { exact: true }).selectOption(conta.id);
  const reclassificada = await request.patch(`/api/leads/${negocio.id}/documentos/${conta.id}`, { headers, data: { category: "outros" } });
  expect(reclassificada.ok()).toBe(true);
  const recusada = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/leads/${negocio.id}`));
  await ficha.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  expect((await recusada).status()).toBe(400);
  await expect(ficha.getByLabel("UC principal", { exact: true })).toHaveValue("000001-0");
  await expect(ficha.getByLabel("Conta de energia principal", { exact: true })).toHaveAttribute("aria-invalid", "true");
  const restaurada = await request.patch(`/api/leads/${negocio.id}/documentos/${conta.id}`, { headers, data: { category: "conta_de_energia" } });
  expect(restaurada.ok()).toBe(true);
  await salvar();
  await ficha.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await abrirFicha();
  await expect(ficha.getByLabel("UC principal", { exact: true })).toHaveValue("000001-0");
  await expect(ficha.getByLabel("UC beneficiária 1", { exact: true })).toHaveValue("000002-0");
  await expect(ficha.getByLabel("Conta de energia principal", { exact: true })).toHaveValue(conta.id);
  await page.screenshot({ path: testInfo.outputPath("ficha-solar-desktop.png") });
  await page.setViewportSize({ width: 320, height: 844 });
  await ficha.getByLabel("UC principal", { exact: true }).scrollIntoViewIfNeeded();
  expect(await ficha.evaluate((dialogo) => dialogo.scrollWidth <= dialogo.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ficha-solar-mobile.png") });
  const arquivada = await request.post(`/api/leads/${negocio.id}/documentos/${conta.id}/arquivar`, { headers });
  expect(arquivada.ok()).toBe(true);
  await ficha.getByRole("tab", { name: "Documentos", exact: true }).click();
  await ficha.getByRole("tab", { name: "Oportunidade", exact: true }).click();
  await expect(ficha.getByText("A conta selecionada está indisponível.", { exact: false })).toBeVisible();
  await expect(ficha.getByLabel("Conta de energia principal", { exact: true })).toHaveValue(conta.id);
  await ficha.getByLabel("UC beneficiária 1", { exact: true }).fill("000003-0");
  await salvar();
  const atualizado: DealDetail = await (await request.get(`/api/leads/${negocio.id}`)).json();
  expect(atualizado.client).toBeNull();
  expect(atualizado.solarProject?.principalUc?.code).toBe("000001-0");
  expect(atualizado.solarProject?.primaryEnergyBillDocumentId).toBe(conta.id);
  expect(atualizado.solarProject?.beneficiaryUcs[0]?.code).toBe("000003-0");
  await ficha.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Configurar pipelines", exact: true }).click();
  const config = page.getByRole("dialog", { name: "Configurar pipelines", exact: true });
  await config.getByRole("tab", { name: "Campos", exact: true }).click();
  await expect(config.getByRole("button", { name: "Excluir campo Tipo de instalação", exact: true })).toBeDisabled();
  await expect(config.getByRole("button", { name: "Remover opção Residencial", exact: true })).toBeDisabled();
});

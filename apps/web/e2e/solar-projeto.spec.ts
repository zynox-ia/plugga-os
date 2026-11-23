import { expect, test } from "@playwright/test";
import { pipelineParaEdicao, type DealDetail, type Pipeline, type PipelinePeopleResponse, type PipelineProcessProfile } from "@plugga/shared";

const pipelinesCriados: string[] = [];
test.afterEach(async ({ request, baseURL }) => {
  for (const id of pipelinesCriados.splice(0)) {
    const resposta = await request.post(`/api/pipelines/${id}/arquivar`, { headers: { origin: baseURL! } });
    expect(resposta.ok()).toBe(true);
  }
});

test("aba Projetos cria card no modal sem virar card do Kanban, valida UC repetida, persiste após reload e recusa conta indisponível", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(120_000);
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

  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const ficha = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  const projetosSolaresCarregados = page.waitForResponse((resposta) => resposta.request().method() === "GET" && resposta.url().endsWith(`/api/leads/${negocio.id}/projetos-solares`));
  const propostasCarregadas = page.waitForResponse((resposta) => resposta.request().method() === "GET" && resposta.url().endsWith(`/api/leads/${negocio.id}/propostas`));
  await page.getByRole("button", { name: "Ver lead Lead Solar sintético", exact: true }).click();
  expect((await projetosSolaresCarregados).status()).toBe(200);
  expect((await propostasCarregadas).status()).toBe(200);
  const abas = ficha.getByRole("tablist", { name: "Seções do lead", exact: true });
  await expect(abas.getByRole("tab", { name: "Projetos", exact: true })).toBeVisible();
  await expect(abas.getByRole("tab", { name: "Oportunidade", exact: true })).toHaveCount(0);
  await ficha.getByRole("tab", { name: "Projetos", exact: true }).click();
  await ficha.getByRole("button", { name: "Novo projeto", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Novo projeto", exact: true });
  await modal.locator("#projeto-instalacao").click();
  await page.getByRole("option", { name: "Rural", exact: true }).click();
  await modal.getByLabel(/Consumo médio \(kWh\)/).fill("1.840,5");
  await modal.getByLabel(/Unidade consumidora \(UC\)/).fill("999945789");

  // UC beneficiária repetindo a UC principal: a mesma validação do servidor (ucsDistintas, packages/shared/src/solar.ts)
  // que antes rejeitava "UC repetida nesta ficha" na ficha única agora rejeita por projeto, com "UC repetida neste projeto".
  await modal.getByRole("button", { name: "Adicionar UC beneficiária", exact: true }).click();
  await modal.getByLabel("UC beneficiária 1", { exact: true }).fill("999945789");
  await modal.getByRole("button", { name: "Criar projeto", exact: true }).click();
  await expect(modal.getByRole("alert").filter({ hasText: "UC repetida neste projeto" })).toBeVisible();
  await modal.getByLabel("UC beneficiária 1", { exact: true }).fill("999945790");

  // Conta de energia anexada pelo próprio formulário (não há mais seleção de documento já existente,
  // como na ficha única do HEAD): o upload acontece aqui e o id entra em energyBillDocumentIds.
  await modal.locator('input[type="file"]').setInputFiles({
    name: "conta-principal-sintetica.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a3sAAAAASUVORK5CYII=", "base64"),
  });
  const linhaContaPrincipal = modal.getByRole("button", { name: "Remover conta-principal-sintetica.png", exact: true }).locator("xpath=..");
  await expect(linhaContaPrincipal).toContainText("Anexada");

  await modal.locator("#projeto-telhado").click();
  await page.getByRole("option", { name: "Metálico", exact: true }).click();
  await modal.getByLabel(/Área disponível \(m²\)/).fill("190");
  await modal.getByLabel(/Potência estimada \(kWp\)/).fill("15,2");
  await modal.getByLabel(/Investimento estimado \(R\$\)/).fill("117500,00");
  const criacao = page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().endsWith(`/api/leads/${negocio.id}/projetos-solares`));
  await modal.getByRole("button", { name: "Criar projeto", exact: true }).click();
  expect((await criacao).status()).toBe(201);
  await expect(ficha.getByRole("listitem", { name: "Rural · UC 999945789", exact: true })).toBeVisible();
  await expect(ficha.getByText("Projeto criado.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ver lead .*999945789/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("projetos-solar-desktop.png") });

  const lista = await request.get(`/api/leads/${negocio.id}/projetos-solares`);
  expect(lista.status()).toBe(200);
  const projetos = await lista.json();
  expect(projetos.projects).toHaveLength(1);
  const projeto = projetos.projects[0];
  expect(projeto.consumerUnit).toBe("999945789");
  expect(projeto.beneficiaryUcs[0]?.code).toBe("999945790");
  expect(projeto.energyBillDocumentIds).toHaveLength(1);
  const contaId: string = projeto.energyBillDocumentIds[0];

  // Persistência de UC principal/beneficiária após reload (antes verificada nos campos da ficha
  // única; agora na visualização somente leitura do próprio projeto).
  await ficha.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Ver lead Lead Solar sintético", exact: true }).click();
  await ficha.getByRole("tab", { name: "Projetos", exact: true }).click();
  await ficha.getByRole("button", { name: "Visualizar Rural · UC 999945789", exact: true }).click();
  const detalhesProjeto = page.getByRole("dialog", { name: "Detalhes do projeto", exact: true });
  await expect(detalhesProjeto.getByText("999945789", { exact: true })).toBeVisible();
  await expect(detalhesProjeto.getByText("999945790", { exact: true })).toBeVisible();

  // Layout mobile 320px sem overflow: no HEAD a ficha única cobria tanto a leitura quanto o
  // formulário editável; aqui são diálogos diferentes, então checamos os dois — o de detalhes
  // (leitura) e, a seguir, o de edição (formulário).
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await detalhesProjeto.evaluate((dialogo) => dialogo.scrollWidth <= dialogo.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("projetos-solar-mobile.png") });
  await detalhesProjeto.getByRole("button", { name: "Editar projeto", exact: true }).click();
  const edicao = page.getByRole("dialog", { name: "Editar projeto", exact: true });
  await edicao.getByLabel(/Unidade consumidora \(UC\)/).scrollIntoViewIfNeeded();
  expect(await edicao.evaluate((dialogo) => dialogo.scrollWidth <= dialogo.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("projeto-edicao-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 900 });

  // Conta arquivada depois de persistida no projeto: o PLU-313 registra que "as referências
  // indisponíveis são preservadas com aviso" — diferente do HEAD (ficha única), aqui o servidor
  // (validarContas em prisma-lead-projetos-solares.repository.ts) só recusa uma conta NOVA
  // indisponível; uma referência já salva não trava o salvamento de outra alteração no projeto.
  const arquivada = await request.post(`/api/leads/${negocio.id}/documentos/${contaId}/arquivar`, { headers });
  expect(arquivada.ok()).toBe(true);
  await edicao.getByLabel(/Potência estimada \(kWp\)/).fill("16");
  const preservada = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/leads/${negocio.id}/projetos-solares/${projeto.id}`));
  await edicao.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  expect((await preservada).status()).toBe(200);
  await expect(ficha.getByText("Projeto atualizado.", { exact: true })).toBeVisible();
  const comContaArquivada = await (await request.get(`/api/leads/${negocio.id}/projetos-solares`)).json();
  expect(comContaArquivada.projects[0].estimatedPowerKwp).toBe("16");
  expect(comContaArquivada.projects[0].energyBillDocumentIds).toEqual([contaId]);

  // Reabrindo para editar, a referência preservada aparece com o aviso (não fica silenciosa).
  await ficha.getByRole("button", { name: "Visualizar Rural · UC 999945789", exact: true }).click();
  await detalhesProjeto.getByRole("button", { name: "Editar projeto", exact: true }).click();
  await expect(edicao.getByText("Conta indisponível (reclassificada ou arquivada)", { exact: false })).toBeVisible();

  // Falha ao consultar os documentos (rede/HTTP/resposta inválida) nunca é tratada como
  // "disponível": a conta arquivada não pode aparecer como "Anexada" sem aviso.
  await edicao.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.route(`**/api/leads/${negocio.id}/documentos`, (rota) => rota.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await ficha.getByRole("button", { name: "Visualizar Rural · UC 999945789", exact: true }).click();
  await detalhesProjeto.getByRole("button", { name: "Editar projeto", exact: true }).click();
  await expect(edicao.getByText("Não foi possível verificar a disponibilidade das contas.", { exact: true })).toBeVisible();
  await expect(edicao.getByText("Conta indisponível", { exact: false })).toHaveCount(0);
  await page.unroute(`**/api/leads/${negocio.id}/documentos`);
  await edicao.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(edicao.getByText("Conta indisponível (reclassificada ou arquivada)", { exact: false })).toBeVisible();

  // Uma conta NOVA que fica indisponível antes do salvamento continua recusada — diferente da já
  // preservada acima, porque ainda não foi persistida no projeto.
  const envio = page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().includes(`/api/leads/${negocio.id}/documentos`));
  await edicao.locator('input[type="file"]').setInputFiles({
    name: "conta-nova-sintetica.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a3sAAAAASUVORK5CYII=", "base64"),
  });
  const contaNova = await (await envio).json();
  // Duas contas já convivem no formulário aqui (a arquivada preservada + a nova): associa a
  // asserção à LINHA da conta nova pelo botão de remover, que carrega o nome do arquivo.
  const linhaContaNova = edicao.getByRole("button", { name: "Remover conta-nova-sintetica.png", exact: true }).locator("xpath=..");
  await expect(linhaContaNova).toContainText("Anexada");
  const reclassificada = await request.patch(`/api/leads/${negocio.id}/documentos/${contaNova.id}`, { headers, data: { category: "outros" } });
  expect(reclassificada.ok()).toBe(true);
  const recusada = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/leads/${negocio.id}/projetos-solares/${projeto.id}`));
  await edicao.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  expect((await recusada).status()).toBe(400);
  // `lerErro` (lib/clientes.ts:108) troca a mensagem específica do servidor por "Confira os campos
  // destacados." sempre que a resposta vem com porCampo preenchido — é o comportamento já existente
  // para qualquer RequisicaoInvalida com porCampo, não algo novo desta correção.
  await expect(edicao.getByText("Confira os campos destacados.", { exact: true })).toBeVisible();
  await expect(edicao.getByLabel(/Unidade consumidora \(UC\)/)).toHaveValue("999945789");

  // Restaurando a categoria, o mesmo salvamento passa a aceitar a conta nova.
  const restaurada = await request.patch(`/api/leads/${negocio.id}/documentos/${contaNova.id}`, { headers, data: { category: "conta_de_energia" } });
  expect(restaurada.ok()).toBe(true);
  const salva = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/leads/${negocio.id}/projetos-solares/${projeto.id}`));
  await edicao.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  expect((await salva).status()).toBe(200);
  const atualizado = await (await request.get(`/api/leads/${negocio.id}/projetos-solares`)).json();
  expect(atualizado.projects[0].consumerUnit).toBe("999945789");
  expect(atualizado.projects[0].beneficiaryUcs[0]?.code).toBe("999945790");
  expect(atualizado.projects[0].energyBillDocumentIds.sort()).toEqual([contaId, contaNova.id].sort());

  await ficha.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Configurar pipelines", exact: true }).click();
  const config = page.getByRole("dialog", { name: "Configurar pipelines", exact: true });
  await config.getByRole("tab", { name: "Campos", exact: true }).click();
  await expect(config.getByRole("button", { name: "Excluir campo Tipo de instalação", exact: true })).toBeDisabled();
  await expect(config.getByRole("button", { name: "Remover opção Residencial", exact: true })).toBeDisabled();
});

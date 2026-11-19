import { expect, test, type Locator } from "@playwright/test";
import { pipelineParaEdicao, type DealDetail, type Pipeline, type PipelinePeopleResponse, type PipelineProcessProfile } from "@plugga/shared";

const pipelinesCriados: string[] = [];
test.afterEach(async ({ request, baseURL }) => {
  for (const id of pipelinesCriados.splice(0)) {
    const resposta = await request.post(`/api/pipelines/${id}/arquivar`, { headers: { origin: baseURL! } });
    expect(resposta.ok()).toBe(true);
  }
});

async function retangulosDosCampos(regiao: Locator) {
  return regiao.locator("dl > div").evaluateAll((elementos) =>
    elementos.map((elemento) => {
      const rect = elemento.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    }),
  );
}

function assertSemSobreposicao(campos: Awaited<ReturnType<typeof retangulosDosCampos>>, contexto: string) {
  expect(campos.length, `${contexto}: deveria ter pelo menos um campo`).toBeGreaterThan(0);
  for (const campo of campos) {
    expect(campo.bottom - campo.top, `${contexto}: campo colapsado`).toBeGreaterThan(10);
    expect(campo.right - campo.left, `${contexto}: campo sem espaço horizontal`).toBeGreaterThan(10);
  }
  for (const [indice, campo] of campos.entries()) {
    for (const outro of campos.slice(indice + 1)) {
      const sobrepoe = campo.left < outro.right && campo.right > outro.left && campo.top < outro.bottom && campo.bottom > outro.top;
      expect(sobrepoe, `${contexto}: dois campos estão sobrepostos`).toBe(false);
    }
  }
}

test("visão geral identifica a etapa atual e mantém os campos legíveis com e sem pendências Solar", async ({ page, request, baseURL }) => {
  test.setTimeout(90_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const headers = { origin: baseURL! };
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  const criar = async <T>(url: string, data: object): Promise<T> => {
    const resposta = await request.post(url, { headers, data });
    expect(resposta.ok(), await resposta.text()).toBe(true);
    return resposta.json();
  };

  const comum = await criar<Pipeline>("/api/pipelines", {
    companyId: "plugga", name: `Resumo layout comum ${Date.now()}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["Entrada", "Proposta"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })), tags: [], lossReasons: [],
  });
  pipelinesCriados.push(comum.id);
  const negocioComum = await criar<DealDetail>("/api/leads", {
    pipelineId: comum.id, stageId: comum.stages[0]!.id, ownerId: pessoas.people[0]!.id, title: "Negócio comum de layout",
    lead: { personType: "pj", name: "Lead comum de layout", email: "layout-comum@teste.local", phone: "92999990001", origin: "indicacao" },
  });

  await page.goto(`/comercial/pipelines?pipeline=${comum.id}`);
  const ficha = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await page.getByRole("button", { name: "Ver lead Lead comum de layout", exact: true }).click();
  const etapaAtual = ficha.getByRole("list", { name: "Etapas do negócio" }).locator('[aria-current="step"]');
  await expect(etapaAtual).toContainText("Entrada");
  const resumoComum = ficha.getByRole("region", { name: "Resumo comercial" });
  await expect(resumoComum.locator("dl > div")).toHaveCount(4);
  await expect(resumoComum.locator("dl > div").last()).toContainText("Origem do lead");
  await expect(resumoComum.locator("dl > div").last()).toContainText("Indicação");
  await expect(ficha.getByText("(92) 99999-0001")).toHaveCount(1);
  await expect(ficha.getByRole("link", { name: "Ligar para Lead comum de layout" })).toHaveAttribute("href", "tel:92999990001");
  await expect(ficha.getByText("Solicitação / dor", { exact: true })).toHaveCount(0);
  await expect(ficha.getByText("Solução indicada", { exact: true })).toHaveCount(0);
  await expect(ficha.getByText("Impedimento", { exact: true })).toHaveCount(0);

  for (const largura of [1440, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    assertSemSobreposicao(await retangulosDosCampos(resumoComum), `pipeline comum, ${largura}px, Resumo comercial`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await ficha.getByRole("list", { name: "Etapas do negócio" }).getByRole("button", { name: "Proposta", exact: true }).click();
  await expect(etapaAtual).toContainText("Proposta");
  await expect.poll(async () => {
    const detalhe = await (await request.get(`/api/leads/${negocioComum.id}`)).json() as DealDetail;
    return detalhe.stageId;
  }).toBe(comum.stages[1]!.id);
  const anotacao = ficha.getByRole("textbox", { name: "Adicionar anotação" });
  await anotacao.fill("Anotação sintética do resumo");
  await ficha.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(anotacao).toHaveValue("");
  await expect.poll(async () => {
    const detalhe = await (await request.get(`/api/leads/${negocioComum.id}`)).json() as DealDetail;
    return detalhe.lead.notes;
  }).toBe("Anotação sintética do resumo");
  await ficha.getByRole("button", { name: "Fechar", exact: true }).click();

  const campo = (name: string, type: "select" | "number", options: string[] = []) => ({ name, type, options: options.map((name) => ({ name })), showOnCard: false, showInList: true });
  let solar = await criar<Pipeline>("/api/pipelines", {
    companyId: "plugga", name: `Resumo layout solar ${Date.now()}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["Atendimento", "Qualificação", "Cotações/Proposta", "O.S de Visita Técnica", "Documentos"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })),
    tags: [], lossReasons: [],
    fields: [campo("Tipo de instalação", "select", ["Residencial", "Comercial", "Rural"]), campo("Consumo mensal (kWh)", "number"), campo("Tipo de telhado", "select", ["Laje", "Solo"]), campo("Área disponível (m²)", "number"), campo("Potência estimada (kWp)", "number")],
  });
  pipelinesCriados.push(solar.id);
  const etapas = solar.stages!;
  const fields = solar.fields!;
  const processProfile: PipelineProcessProfile = { key: "solar_commercial", version: 1, bindings: {
    installationType: { fieldId: fields[0]!.id, options: { residential: fields[0]!.options[0]!.id, commercial: fields[0]!.options[1]!.id, rural: fields[0]!.options[2]!.id } },
    averageConsumptionKwh: { fieldId: fields[1]!.id }, roofType: { fieldId: fields[2]!.id }, availableAreaM2: { fieldId: fields[3]!.id }, estimatedPowerKwp: { fieldId: fields[4]!.id },
  } };
  const associacao = await request.put(`/api/pipelines/${solar.id}`, { headers, data: { ...pipelineParaEdicao(solar), processProfile } });
  expect(associacao.status()).toBe(200);
  solar = await associacao.json();

  const ativacao = await request.post(`/api/pipelines/${solar.id}/processo-solar/ativacao`, { headers, data: { stages: {
    atendimento: etapas[0]!.id, qualificacao: etapas[1]!.id, proposta: etapas[2]!.id, visita: etapas[3]!.id, documentos: etapas[4]!.id, validacaoKit: null,
  } } });
  expect(ativacao.ok(), await ativacao.text()).toBe(true);

  const negocioSolar = await criar<DealDetail>("/api/leads", {
    pipelineId: solar.id, stageId: etapas[0]!.id, ownerId: pessoas.people[0]!.id, title: "Negócio Solar de layout",
    lead: { personType: "pj", name: "Lead Solar de layout", email: "layout-solar@teste.local", phone: "92999990002", origin: "site" },
  });
  // A pendência de Qualificação só existe quando o papel do processo é "qualificacao"
  // (confirmado via GET /leads/:id/processo-solar); em Atendimento as pendências vêm vazias.
  const mudaEtapa = await request.post(`/api/leads/${negocioSolar.id}/etapa`, { headers, data: { stageId: etapas[1]!.id, version: negocioSolar.version, origin: "quadro" } });
  expect(mudaEtapa.ok(), await mudaEtapa.text()).toBe(true);
  // Confirma no servidor (não só confia na resposta do POST) que a pendência já está visível antes
  // de abrir a tela — sob carga paralela, ler a UI direto na sequência é uma corrida.
  await expect.poll(async () => {
    const situacao = await (await request.get(`/api/leads/${negocioSolar.id}/processo-solar`, { headers })).json();
    return { role: situacao.role, pendencias: situacao.pendencies?.length ?? 0 };
  }, { timeout: 15_000 }).toEqual({ role: "qualificacao", pendencias: 1 });

  await page.goto(`/comercial/pipelines?pipeline=${solar.id}`);
  await page.getByRole("button", { name: "Ver lead Lead Solar de layout", exact: true }).click();
  await expect(etapaAtual).toContainText("Qualificação");
  const resumoSolar = ficha.getByRole("region", { name: "Resumo comercial" });
  await expect(resumoSolar.locator("dl > div")).toHaveCount(4);
  const pendencias = ficha.getByRole("region", { name: "Resumo do negócio" });
  const situacaoPendente = await (await request.get(`/api/leads/${negocioSolar.id}/processo-solar`, { headers })).json();
  await expect(pendencias).toContainText(situacaoPendente.pendencies[0].message, { timeout: 15_000 });
  for (const largura of [1440, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    assertSemSobreposicao(await retangulosDosCampos(resumoSolar), `pipeline Solar com pendência, ${largura}px, Resumo comercial`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await ficha.getByRole("tab", { name: "Projetos", exact: true }).click();
  await ficha.getByRole("button", { name: "Novo projeto", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Novo projeto", exact: true });
  await modal.locator("#projeto-instalacao").click();
  await page.getByRole("option", { name: "Residencial", exact: true }).click();
  await modal.getByLabel(/Consumo médio \(kWh\)/).fill("500");
  await modal.getByLabel(/Unidade consumidora \(UC\)/).fill("000222-0");
  await modal.locator('input[type="file"]').setInputFiles({
    name: "conta-layout-sintetica.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a3sAAAAASUVORK5CYII=", "base64"),
  });
  await expect(modal.getByRole("button", { name: "Remover conta-layout-sintetica.png", exact: true }).locator("xpath=..")).toContainText("Anexada");
  const criacao = page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().endsWith(`/api/leads/${negocioSolar.id}/projetos-solares`));
  await modal.getByRole("button", { name: "Criar projeto", exact: true }).click();
  expect((await criacao).status()).toBe(201);
  await ficha.getByRole("tab", { name: "Visão geral", exact: true }).click();

  await expect(resumoSolar.locator("dl > div")).toHaveCount(4);
  await expect(resumoSolar).toContainText("500 kWh/mês");
  await expect(pendencias).not.toContainText(situacaoPendente.pendencies[0].message);
  for (const largura of [1440, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    assertSemSobreposicao(await retangulosDosCampos(resumoSolar), `pipeline Solar sem pendência, ${largura}px, Resumo comercial`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await ficha.getByRole("button", { name: "Fechar", exact: true }).click();
});

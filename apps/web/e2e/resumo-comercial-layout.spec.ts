import { expect, test, type Locator } from "@playwright/test";
import { pipelineParaEdicao, type DealDetail, type Pipeline, type PipelinePeopleResponse, type PipelineProcessProfile } from "@plugga/shared";

const pipelinesCriados: string[] = [];
test.afterEach(async ({ request, baseURL }) => {
  for (const id of pipelinesCriados.splice(0)) {
    const resposta = await request.post(`/api/pipelines/${id}/arquivar`, { headers: { origin: baseURL! } });
    expect(resposta.ok()).toBe(true);
  }
});

/** Retângulos das linhas do dl (um por `div` filho direto), na ordem em que aparecem no DOM. */
async function retangulosDasLinhas(regiao: Locator): Promise<{ top: number; bottom: number }[]> {
  return regiao.locator("dl > div").evaluateAll((elementos) =>
    elementos.map((elemento) => {
      const rect = elemento.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }),
  );
}

/**
 * Nenhuma linha pode sobrepor a seguinte. Em vez de só "top crescente" (que não pegaria uma caixa
 * alta demais invadindo a próxima), exige: altura real renderizada (>10px, descarta caixa colapsada)
 * e o fim de cada linha (bottom) antes ou exatamente no início da próxima (top) — a mesma condição
 * medida ao vivo (getBoundingClientRect) que comprovou o defeito do QA e a correção, nos dois
 * cartões, nas 3 larguras/cenários.
 */
function assertSemSobreposicao(linhas: { top: number; bottom: number }[], contexto: string) {
  expect(linhas.length, `${contexto}: deveria ter pelo menos uma linha`).toBeGreaterThan(0);
  for (const linha of linhas) {
    expect(linha.bottom - linha.top, `${contexto}: linha com altura suspeita (colapsada?)`).toBeGreaterThan(10);
  }
  for (let i = 1; i < linhas.length; i++) {
    expect(linhas[i]!.top, `${contexto}: linha ${i} deveria começar depois da linha ${i - 1}`).toBeGreaterThan(linhas[i - 1]!.top);
    expect(linhas[i]!.top, `${contexto}: linha ${i} sobrepõe a linha ${i - 1}`).toBeGreaterThanOrEqual(linhas[i - 1]!.bottom);
  }
}

test("resumo comercial: linhas do subgrid nunca se sobrepõem, com telefone/origem em qualquer pipeline e Solar com/sem pendências", async ({ page, request, baseURL }) => {
  test.setTimeout(90_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const headers = { origin: baseURL! };
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  const criar = async <T>(url: string, data: object): Promise<T> => {
    const resposta = await request.post(url, { headers, data });
    expect(resposta.ok(), await resposta.text()).toBe(true);
    return resposta.json();
  };

  // --- Pipeline comum (não-Solar): Telefone + Origem do lead, 2 linhas, nos mesmos dt/dd. ---
  const comum = await criar<Pipeline>("/api/pipelines", {
    companyId: "plugga", name: `Resumo layout comum ${Date.now()}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [],
  });
  pipelinesCriados.push(comum.id);
  await criar<DealDetail>("/api/leads", {
    pipelineId: comum.id, stageId: comum.stages[0]!.id, ownerId: pessoas.people[0]!.id, title: "Negócio comum de layout",
    lead: { personType: "pj", name: "Lead comum de layout", email: "layout-comum@teste.local", phone: "92999990001", origin: "indicacao" },
  });

  await page.goto(`/comercial/pipelines?pipeline=${comum.id}`);
  const ficha = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await page.getByRole("button", { name: "Ver lead Lead comum de layout", exact: true }).click();
  const resumoComum = ficha.getByRole("region", { name: "Resumo comercial" });
  await expect(resumoComum.locator("dl > div")).toHaveCount(2);
  await expect(resumoComum.locator("dl > div").nth(0)).toContainText("Telefone");
  await expect(resumoComum.locator("dl > div").nth(0)).toContainText("(92) 99999-0001");
  await expect(resumoComum.locator("dl > div").nth(1)).toContainText("Origem do lead");
  await expect(resumoComum.locator("dl > div").nth(1)).toContainText("Indicação");
  // Rodapé de telefone (.contatosRodape) foi removido: o número aparece uma única vez, no cartão.
  await expect(ficha.getByText("(92) 99999-0001")).toHaveCount(1);
  await expect(ficha.getByText("Solicitação / dor", { exact: true })).toHaveCount(0);
  await expect(ficha.getByText("Solução indicada", { exact: true })).toHaveCount(0);
  await expect(ficha.getByText("Impedimento", { exact: true })).toHaveCount(0);

  for (const largura of [1440, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    assertSemSobreposicao(await retangulosDasLinhas(resumoComum), `pipeline comum, ${largura}px, Resumo comercial`);
    assertSemSobreposicao(await retangulosDasLinhas(ficha.getByRole("region", { name: "Indicadores do negócio" })), `pipeline comum, ${largura}px, Indicadores`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await ficha.getByRole("button", { name: "Fechar", exact: true }).click();

  // --- Pipeline Solar ativado: com pendência (sem projeto) soma 4 linhas; sem pendência (projeto completo) soma 3. ---
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
  const resumoSolar = ficha.getByRole("region", { name: "Resumo comercial" });
  // Sem projeto, na Qualificação: a pendência aparece — Telefone, Origem do lead, Projeto Solar, Para avançar.
  // Timeout maior que o padrão: sob carga paralela, a consulta de pendências do cartão (fetch
  // assíncrono próprio) pode demorar mais que os 5s default para resolver.
  await expect(resumoSolar.locator("dl > div")).toHaveCount(4, { timeout: 15_000 });
  await expect(resumoSolar.locator("dl > div").nth(3)).toContainText("Para avançar");
  const indicadoresSolar = ficha.getByRole("region", { name: "Indicadores do negócio" });
  for (const largura of [1440, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    assertSemSobreposicao(await retangulosDasLinhas(resumoSolar), `pipeline Solar com pendência, ${largura}px, Resumo comercial`);
    assertSemSobreposicao(await retangulosDasLinhas(indicadoresSolar), `pipeline Solar com pendência, ${largura}px, Indicadores`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Projeto completo (tipo, consumo, UC e conta) elimina a pendência: Telefone, Origem do lead, Projeto Solar.
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

  await expect(resumoSolar.locator("dl > div")).toHaveCount(3);
  await expect(resumoSolar.getByText("Para avançar", { exact: true })).toHaveCount(0);
  for (const largura of [1440, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    assertSemSobreposicao(await retangulosDasLinhas(resumoSolar), `pipeline Solar sem pendência, ${largura}px, Resumo comercial`);
    assertSemSobreposicao(await retangulosDasLinhas(indicadoresSolar), `pipeline Solar sem pendência, ${largura}px, Indicadores`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await ficha.getByRole("button", { name: "Fechar", exact: true }).click();
});

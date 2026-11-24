import { expect, test, type Page } from "@playwright/test";
import type { CreateClientResponse } from "@plugga/shared";

import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Ordens de serviço da Engenharia (PLU-345): o ciclo inteiro pela tela, com
 * dados sintéticos. Nova O.S. (empresa e cliente obrigatórios), agendar, check-in
 * antes do dia (pede confirmação), laudo que exige foto, pedir material e o termo
 * assinado à mão, que conclui a O.S.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.214" }, contextOptions: { reducedMotion: "reduce" } });
const DEPOIS_DA_ACAO = { timeout: 15_000 };
const ficha = (page: Page) => page.locator("dialog[open]").first();
/** PNG de 1 px: a API confere o tipo pelo conteúdo. */
const FOTO = { name: "campo-e2e.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGeoBwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };

/** Dia de Manaus daqui a `dias`, como dd/mm/aaaa. */
function diaFuturo(dias: number): string {
  const d = new Date(Date.now() - 4 * 3_600_000 + dias * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

test("O.S. vai de aberta a concluída: agenda, check-in, laudo com foto, material e termo", async ({ page, request, baseURL }) => {
  test.slow(); // o ciclo inteiro, com uma ida à API por passo
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36).toUpperCase();
  const nomeDoCliente = `Cliente OS ${sufixo} (sintético)`;
  const descricao = `Limpeza dos módulos ${marcaDaExecucao()} ${sufixo} (sintético)`;

  const cliente = await request.post("/api/clientes", { headers: { origin: baseURL! }, data: { personType: "pj", name: nomeDoCliente, email: `os-${sufixo.toLowerCase()}@teste.local` } });
  expect(cliente.ok()).toBeTruthy();
  expect(((await cliente.json()) as CreateClientResponse).client.id).toBeTruthy();

  // 1. Nova O.S.: empresa, tipo, cliente, o que fazer e prazo são obrigatórios.
  await page.goto("/engenharia/ordens-de-servico");
  await page.getByRole("button", { name: "Nova O.S." }).first().click();
  const nova = page.getByRole("dialog", { name: "Nova O.S." });
  await nova.getByRole("button", { name: "Criar O.S." }).click();
  await expect(nova.getByText("Erro: escolha a empresa.")).toBeVisible();
  await expect(nova.getByText("Erro: escolha o cliente.")).toBeVisible();
  await nova.getByRole("combobox", { name: /^Empresa/ }).click();
  await page.getByRole("option", { name: "Waze Energia" }).click();
  await nova.getByRole("combobox", { name: /^Tipo/ }).click();
  await page.getByRole("option", { name: "Manutenção" }).click();
  await nova.getByRole("searchbox", { name: /Cliente/ }).fill(`OS ${sufixo}`);
  await nova.getByRole("button", { name: new RegExp(nomeDoCliente.replace(/[()]/g, "\\$&")) }).click();
  await nova.getByRole("textbox", { name: /O que precisa ser feito/ }).fill(descricao);
  await nova.getByRole("textbox", { name: /^Prazo/ }).fill(diaFuturo(5));
  await nova.getByRole("button", { name: "Criar O.S." }).click();

  await expect(ficha(page).getByRole("heading", { name: `Manutenção · ${nomeDoCliente}` })).toBeVisible(DEPOIS_DA_ACAO);
  expect(new URL(page.url()).searchParams.get("os")).toBeTruthy();

  // 2. Agendar para amanhã: técnico, data e horário.
  await ficha(page).getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(ficha(page).getByText("Erro: escolha o técnico.")).toBeVisible();
  await ficha(page).getByRole("combobox", { name: /^Técnico/ }).click();
  await page.getByRole("option").first().click();
  await ficha(page).getByRole("textbox", { name: /^Data/ }).fill(diaFuturo(1));
  await ficha(page).getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(ficha(page).getByText("O.S. agendada.")).toBeVisible(DEPOIS_DA_ACAO);

  // 3. Check-in antes do dia agendado: pede a confirmação e remarca para agora.
  await ficha(page).getByRole("button", { name: "Fazer check-in" }).click();
  const antecipado = page.getByRole("dialog", { name: "Check-in antes do dia agendado" });
  await expect(antecipado).toBeVisible(DEPOIS_DA_ACAO);
  await antecipado.getByRole("button", { name: "Fazer check-in agora" }).click();
  await expect(ficha(page).getByText("Check-in feito: a O.S. está em campo.")).toBeVisible(DEPOIS_DA_ACAO);

  // 4. Pedir material: vira pedido de compra em Suprimentos, ligado à O.S.
  await ficha(page).getByRole("tab", { name: /^Material/ }).click();
  await ficha(page).getByRole("button", { name: "Pedir material" }).click();
  const material = page.getByRole("dialog", { name: "Pedir material" });
  await material.getByLabel("Título").fill(`Conectores ${marcaDaExecucao()} ${sufixo} (sintético)`);
  await material.getByLabel(/^Material 1/).fill("Conector MC4 (sintético)");
  await material.getByLabel(/^Quantidade/).fill("4");
  await material.getByRole("textbox", { name: /Entrega desejada/ }).fill(diaFuturo(3));
  await material.getByRole("button", { name: "Pedir material" }).click();
  await expect(ficha(page).getByText(/^Material pedido em Compras/)).toBeVisible(DEPOIS_DA_ACAO);
  await expect(ficha(page).getByText(`Conectores ${marcaDaExecucao()} ${sufixo} (sintético)`)).toBeVisible();

  // 5. Laudo: sem foto não registra; com a foto, sim.
  await ficha(page).getByRole("tab", { name: /^Visão geral/ }).click();
  await ficha(page).getByRole("textbox", { name: /^Encontrado/ }).fill("Sujeira nos módulos (sintético)");
  await ficha(page).getByRole("textbox", { name: /^Feito/ }).fill("Limpeza completa (sintético)");
  await ficha(page).getByRole("button", { name: "Registrar laudo" }).click();
  await expect(ficha(page).getByText("Envie ao menos uma foto do campo antes de registrar o laudo.")).toBeVisible();
  await ficha(page).locator("input[type=file]").setInputFiles(FOTO);
  await expect(ficha(page).getByText("Foto enviada.")).toBeVisible(DEPOIS_DA_ACAO);
  await expect(ficha(page).getByRole("tab", { name: "Evidências 1" })).toBeVisible();
  await ficha(page).getByRole("tab", { name: /^Visão geral/ }).click();
  await ficha(page).getByRole("textbox", { name: /^Encontrado/ }).fill("Sujeira nos módulos (sintético)");
  await ficha(page).getByRole("textbox", { name: /^Feito/ }).fill("Limpeza completa (sintético)");
  await ficha(page).getByRole("button", { name: "Registrar laudo" }).click();
  await expect(ficha(page).getByText("Laudo registrado: falta o termo do cliente.")).toBeVisible(DEPOIS_DA_ACAO);

  // 6. Termo: sem assinatura não conclui; assinado à mão no quadro, conclui.
  await ficha(page).getByLabel(/^Nome de quem assina/).fill("Ana Souza (sintético)");
  await ficha(page).getByLabel(/^Documento/).fill("123.456.789-01");
  await ficha(page).getByRole("button", { name: "Concluir com o termo" }).click();
  await expect(ficha(page).getByText("Erro: o cliente precisa assinar no quadro.")).toBeVisible();
  const quadro = ficha(page).getByRole("img", { name: /Assinatura do cliente/ });
  // O erro leva o foco ao quadro, que está abaixo da dobra.
  await expect(quadro).toBeFocused();
  await quadro.scrollIntoViewIfNeeded();
  const caixa = (await quadro.boundingBox())!;
  await page.mouse.move(caixa.x + 40, caixa.y + 90);
  await page.mouse.down();
  for (const [x, y] of [[90, 50], [140, 110], [200, 60], [260, 100]] as const) await page.mouse.move(caixa.x + x, caixa.y + y, { steps: 4 });
  await page.mouse.up();
  await expect(ficha(page).getByRole("img", { name: "Assinatura: assinado à mão pelo cliente" })).toBeVisible();
  await ficha(page).getByRole("button", { name: "Concluir com o termo" }).click();
  await expect(ficha(page).getByText("O.S. concluída: o termo assinado ficou guardado em PDF.")).toBeVisible(DEPOIS_DA_ACAO);
  await expect(ficha(page).getByRole("link", { name: "Termo em PDF" })).toBeVisible();

  // 7. Na lista, a O.S. aparece como concluída.
  await page.goto(`/engenharia/ordens-de-servico?visao=lista&situacao=concluida&busca=${encodeURIComponent(sufixo)}`);
  const linha = page.getByRole("row", { name: new RegExp(nomeDoCliente.replace(/[()]/g, "\\$&")) });
  await expect(linha).toContainText("Concluída");
});

/** Cria uma O.S. já em Laudo pela API (o caminho pela tela está no teste acima) e devolve o id. */
async function ordemEmLaudo(request: import("@playwright/test").APIRequestContext, baseURL: string, sufixo: string, descricao: string): Promise<string> {
  const headers = { origin: baseURL };
  const cliente = await request.post("/api/clientes", { headers, data: { personType: "pj", name: `Cliente termo ${sufixo} (sintético)`, email: `termo-${sufixo.toLowerCase()}@teste.local` } });
  expect(cliente.ok()).toBeTruthy();
  const { client } = (await cliente.json()) as CreateClientResponse;
  const hoje = new Date(Date.now() - 4 * 3_600_000);
  const dia = (n: number) => new Date(hoje.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const criada = await request.post("/api/engenharia/ordens-de-servico", { headers, data: { empresa: "plugga", tipo: "visita_tecnica", clienteId: client.id, descricao, prazo: dia(5) } });
  expect(criada.ok(), await criada.text()).toBeTruthy();
  const { id } = (await criada.json()) as { id: string };
  const opcoes = (await (await request.get("/api/engenharia/ordens-de-servico/opcoes")).json()) as { tecnicos: { id: string }[] };
  const acao = async (data: object) => { const r = await request.post(`/api/engenharia/ordens-de-servico/${id}/acoes`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); };
  await acao({ acao: "agendar", tecnicoId: opcoes.tecnicos[0]!.id, data: dia(1), horario: "09:00" });
  await acao({ acao: "check_in", confirmarAntecipado: true });
  const foto = await request.post(`/api/engenharia/ordens-de-servico/${id}/fotos`, { headers, multipart: { arquivo: FOTO } });
  expect(foto.ok(), await foto.text()).toBeTruthy();
  await acao({ acao: "registrar_laudo", encontrado: "Medição do telhado (sintético)", feito: "Fotos e medidas (sintético)" });
  return id;
}

test("termo por Enter com o nome digitado; editar a O.S.; PDF assinado à parte conclui outra", async ({ page, request, baseURL }) => {
  test.slow();
  await bloquearTerceiros(page);
  const sufixo = `${Date.now().toString(36).toUpperCase()}T`;
  const id = await ordemEmLaudo(request, baseURL!, sufixo, `Visita ${marcaDaExecucao()} ${sufixo} (sintético)`);

  // Editar: o tipo e o equipamento mudam; empresa, cliente e origem ficam.
  await page.goto(`/engenharia/ordens-de-servico?os=${id}`);
  await ficha(page).getByRole("button", { name: "Editar" }).click();
  const editar = page.getByRole("dialog", { name: /^Editar OS-/ });
  await expect(editar.getByRole("combobox", { name: /^Empresa/ })).toBeDisabled();
  await editar.getByLabel("Fabricante").fill("Growatt (sintético)");
  await editar.getByRole("button", { name: "Salvar" }).click();
  await expect(ficha(page).getByText("O.S. atualizada.")).toBeVisible(DEPOIS_DA_ACAO);
  await ficha(page).getByRole("tab", { name: /^Equipamento/ }).click();
  await expect(ficha(page).getByText("Growatt (sintético)")).toBeVisible();

  // Enter no quadro assina com o nome digitado; sem nome, pede o nome antes.
  await ficha(page).getByRole("tab", { name: /^Visão geral/ }).click();
  const quadro = ficha(page).getByRole("img", { name: /Assinatura do cliente/ });
  await quadro.focus();
  await page.keyboard.press("Enter");
  await expect(ficha(page).getByText("Erro: digite o nome de quem assina para assinar com ele.")).toBeVisible();
  await ficha(page).getByLabel(/^Nome de quem assina/).fill("Bruno Lima (sintético)");
  await ficha(page).getByLabel(/^Documento/).fill("98.765.432-1");
  await quadro.focus();
  await page.keyboard.press("Enter");
  await expect(ficha(page).getByRole("img", { name: "Assinatura: assinado com o nome Bruno Lima (sintético)" })).toBeVisible();
  await ficha(page).getByRole("button", { name: "Concluir com o termo" }).click();
  await expect(ficha(page).getByText("O.S. concluída: o termo assinado ficou guardado em PDF.")).toBeVisible(DEPOIS_DA_ACAO);
  await expect(ficha(page).getByText(/termo assinado por Bruno Lima \(sintético\)/)).toBeVisible();

  // A alternativa: o PDF assinado à parte também conclui.
  const outra = await ordemEmLaudo(request, baseURL!, `${sufixo}B`, `Visita ${marcaDaExecucao()} ${sufixo}B (sintético)`);
  await page.goto(`/engenharia/ordens-de-servico?os=${outra}`);
  await ficha(page).getByLabel("Termo assinado em PDF").setInputFiles({ name: "termo-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
  await expect(ficha(page).getByText("O.S. concluída com o termo assinado em PDF.")).toBeVisible(DEPOIS_DA_ACAO);
});

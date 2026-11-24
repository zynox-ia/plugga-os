import { expect as expectPadrao, test, type Page } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";
import { marcaDaExecucao } from "./support/execucao";

/**
 * Compras (PLU-328): o caminho feliz pela tela, da criação à conclusão, com
 * dados sintéticos. Cada ação é a que a API permite na etapa (acoesPermitidas).
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.228" } });

// Cada ação vai à API e recarrega a tela; com a API de desenvolvimento ocupada uma ação passa de 3 s.
// O fluxo tem uma dezena delas, então o teste e as esperas têm folga, sem mudar o que é verificado.
const expect = expectPadrao.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

const PDF = { name: "cotacao-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") };

function diaFuturo(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

const ficha = (page: Page) => page.locator("dialog[open]").first();

test("pedido de compra vai de Pedido gerado a Concluído pela ficha", async ({ page, baseURL }) => {
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36);
  // A marca da execução: o globalTeardown apaga ao final o que este spec criou.
  const marca = marcaDaExecucao();
  const fornecedor = await page.request.post("/api/suprimentos/fornecedores", { data: { nome: `Fornecedor ${marca} ${sufixo} (sintético)`, categoria: "material_eletrico" }, headers: { origin: new URL(baseURL!).origin } });
  expect(fornecedor.status(), await fornecedor.text()).toBe(201);
  const { nome: nomeDoFornecedor } = (await fornecedor.json()) as { nome: string };

  await page.goto("/suprimentos/compras");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const novo = page.getByRole("dialog", { name: "Novo pedido de compra" });
  await novo.getByRole("radio", { name: "Waze Energia" }).click();
  await novo.getByLabel("Título").fill(`Cabos ${marca} ${sufixo} (sintético)`);
  await novo.getByRole("radio", { name: "Interno" }).click();
  await novo.getByLabel("Descrição do item 1").fill("Cabo de teste 6 mm");
  await novo.getByLabel("Quantidade do item 1").fill("1.234,5");
  await novo.getByRole("textbox", { name: /Entrega desejada/ }).fill(diaFuturo(20));
  await novo.getByLabel("Valor orçado").fill("2.000,00");
  await novo.getByRole("button", { name: "Criar pedido" }).click();

  await expect(ficha(page).getByRole("heading", { name: `Cabos ${marca} ${sufixo} (sintético)` })).toBeVisible();
  await expect(ficha(page).getByText("O que falta para avançar")).toBeVisible();

  await ficha(page).getByRole("button", { name: "Iniciar análise de estoque" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Pedido em análise de estoque.");
  await ficha(page).getByRole("button", { name: /Não, precisa comprar/ }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toContainText("Cotações");

  await ficha(page).getByRole("button", { name: "Adicionar cotação" }).click();
  const cotacao = page.getByRole("dialog", { name: "Adicionar cotação" });
  await cotacao.getByRole("combobox").first().click();
  await page.getByRole("option", { name: nomeDoFornecedor }).click();
  await cotacao.getByLabel("Valor").fill("1.890,50");
  await cotacao.getByLabel("Prazo de entrega (dias úteis)").fill("4");
  await cotacao.locator("input[type=file]").setInputFiles(PDF);
  await cotacao.getByRole("button", { name: "Registrar cotação" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Cotação registrada.");

  await ficha(page).getByRole("tab", { name: /Cotações/ }).click();
  await ficha(page).getByRole("button", { name: "Escolher como vencedora" }).click();
  await expect(ficha(page).getByText("Vencedora", { exact: true })).toBeVisible();
  await ficha(page).getByRole("tab", { name: "Visão geral" }).click();
  await expect(ficha(page).getByText("R$ 109,50 abaixo")).toBeVisible();

  await ficha(page).getByRole("button", { name: "Enviar para aprovação" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Pedido enviado para aprovação.");
  await ficha(page).getByRole("button", { name: "Aprovar compra" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Compra aprovada.");
  // A aprovação gera a conta a pagar no Financeiro (PLU-341): a ficha mostra o vínculo, já aprovada.
  const conta = ficha(page).getByRole("link", { name: /^CP-\d{4,} no Financeiro$/ });
  await expect(conta).toHaveAttribute("href", /^\/financeiro\/lancamentos\?lancamento=[0-9a-f-]{36}$/);
  await expect(conta.locator("xpath=..")).toContainText("Aprovada");

  await ficha(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(ficha(page).getByText("Erro: escolha a forma de pagamento.")).toBeVisible();
  await ficha(page).getByRole("radio", { name: "PIX" }).click();
  await ficha(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Pagamento registrado.");

  await expect(ficha(page).getByLabel("Valor faturado")).toHaveValue("1.890,50");
  await ficha(page).getByRole("button", { name: "Confirmar recebimento" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Recebimento confirmado: aquisição concluída.");
  await expect(ficha(page).getByRole("region", { name: "Aquisição concluída" })).toContainText("R$ 1.890,50 faturado");

  await ficha(page).getByRole("tab", { name: "Linha do tempo" }).click();
  await expect(ficha(page).getByText("confirmou o recebimento", { exact: false })).toBeVisible();
});

/**
 * O Financeiro decide sobre o pedido que Compras conduziu: o gerente aprova, o
 * membro paga. Nenhum dos dois cria pedido nem mexe nas etapas de Compras.
 * Usa as contas de exemplo do seed (SEED_SAMPLE_TEAM), como o e2e de negócios.
 */
test("o gerente do Financeiro aprova e o membro do Financeiro paga", async ({ page, browser, baseURL }) => {
  await bloquearTerceiros(page);
  const origin = new URL(baseURL!).origin;
  const sufixo = Date.now().toString(36);
  // A marca da execução: o globalTeardown apaga ao final o que este spec criou.
  const marca = marcaDaExecucao();
  const json = async (r: Awaited<ReturnType<typeof page.request.post>>) => { expect(r.ok(), await r.text()).toBeTruthy(); return r.json(); };

  // Compras (admin) leva o pedido até Aprovação pela API.
  const fornecedor = await json(await page.request.post("/api/suprimentos/fornecedores", { data: { nome: `Fornecedor Fin ${marca} ${sufixo} (sintético)`, categoria: "material_eletrico" }, headers: { origin } }));
  const pedido = await json(await page.request.post("/api/suprimentos/compras/pedidos", { headers: { origin }, data: { empresa: "plugga", titulo: `Aprovação ${marca} ${sufixo} (sintético)`, destino: "interno", itens: [{ descricao: "Disjuntor de teste", quantidade: "3", unidade: "un" }], prazoEntregaDesejado: "2030-12-10" } }));
  const acao = (corpo: object) => page.request.post(`/api/suprimentos/compras/pedidos/${pedido.id}/acoes`, { headers: { origin }, data: corpo }).then(json);
  await acao({ acao: "iniciar_analise" });
  await acao({ acao: "decidir_estoque", origem: "aquisicao" });
  const cotado = await json(await page.request.post(`/api/suprimentos/compras/pedidos/${pedido.id}/cotacoes`, { headers: { origin }, multipart: { fornecedorId: fornecedor.id, valor: "300.00", arquivo: PDF } }));
  await acao({ acao: "selecionar_cotacao", cotacaoId: cotado.cotacoes[0].id });
  await acao({ acao: "enviar_para_aprovacao" });

  // As contas de exemplo do seed usam a senha local do admin (na CI, a mesma de SEED_ADMIN_PASSWORD);
  // contra o dev, com o usuário próprio dos e2e, E2E_SAMPLE_PASSWORD informa a delas.
  async function comoFinanceiro(email: string, ip: string) {
    const contexto = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": ip } });
    const pagina = await contexto.newPage();
    await bloquearTerceiros(pagina);
    const login = await pagina.request.post("/api/auth/login", { headers: { origin }, data: { email, password: process.env.E2E_SAMPLE_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "local_only_change_me" } });
    expect(login.ok(), `login de ${email} (precisa de SEED_SAMPLE_TEAM=true no seed)`).toBeTruthy();
    await pagina.goto(`/suprimentos/compras?pedido=${pedido.id}`);
    await expect(ficha(pagina).getByRole("heading", { name: `Aprovação ${marca} ${sufixo} (sintético)` })).toBeVisible();
    // Abre a tela, mas não cria pedido nem edita o pedido de Compras.
    await expect(pagina.getByRole("button", { name: "Novo pedido" })).toHaveCount(0);
    await expect(ficha(pagina).getByRole("button", { name: "Editar" })).toHaveCount(0);
    return { contexto, pagina };
  }

  const gerente = await comoFinanceiro("gerente.financeiro@plugga.local", "203.0.113.229");
  // A barra mostra Suprimentos › Compras para quem é só do Financeiro (a ficha aberta deixa o resto inerte, por isso o DOM).
  await expect(gerente.pagina.locator(".nav-item[aria-current=page]", { hasText: "Compras" })).toBeAttached();
  await expect(ficha(gerente.pagina).getByRole("button", { name: "Revisar cotações" })).toBeVisible();
  await ficha(gerente.pagina).getByRole("button", { name: "Aprovar compra" }).click();
  await expect(ficha(gerente.pagina).locator(".aviso--sucesso")).toHaveText("Compra aprovada.");
  await gerente.contexto.close();

  const membro = await comoFinanceiro("financeiro.membro.e2e@plugga.local", "203.0.113.230");
  await expect(ficha(membro.pagina).getByRole("button", { name: "Aprovar compra" })).toHaveCount(0);
  await ficha(membro.pagina).getByRole("radio", { name: "PIX" }).click();
  await ficha(membro.pagina).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(ficha(membro.pagina).locator(".aviso--sucesso")).toHaveText("Pagamento registrado.");
  // Confirmar o recebimento é de Compras: o membro do Financeiro não vê o botão.
  await expect(ficha(membro.pagina).getByRole("button", { name: "Confirmar recebimento" })).toHaveCount(0);
  await membro.contexto.close();
});

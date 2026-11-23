import { expect, test, type Page } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Estoque (PLU-333): o fluxo do material com dados sintéticos. Pela tela: criar
 * o item e dar entrada. Pelo pedido de compra (as ações que a ficha do pedido
 * dispara): atender pelo estoque reserva, e o recebimento converte a reserva
 * em saída. De volta à tela, a ficha e as movimentações mostram cada passo.
 */

// O fluxo, não a animação: com movimento reduzido (que o app respeita) os modais não ficam "instáveis" sob carga.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.229" }, contextOptions: { reducedMotion: "reduce" } });
// Cada ação do pedido espera a API e o refresh da ficha; com a máquina carregada, 5 s não bastam.
const DEPOIS_DA_ACAO = { timeout: 15_000 };

const ficha = (page: Page) => page.locator("dialog[open]").first();
const PDF = { name: "cotacao-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") };
/** O nome sintético tem parênteses: escapa para usar em RegExp. */
const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function diaFuturo(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Novo pedido da Waze, destino interno, com um item vinculado ao item de estoque `nome`; a ficha do pedido fica aberta. */
async function criarPedidoVinculado(page: Page, sufixo: string, nome: string, quantidade: string) {
  await page.goto("/suprimentos/compras");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const novo = page.getByRole("dialog", { name: "Novo pedido de compra" });
  await novo.getByRole("radio", { name: "Waze Energia" }).click();
  await novo.getByLabel("Título").fill(`Material E2E ${sufixo} (sintético)`);
  await novo.getByRole("radio", { name: "Interno" }).click();
  await novo.getByRole("combobox", { name: /Estoque do item 1/ }).click();
  const busca = page.getByRole("searchbox", { name: /Buscar em Estoque do item 1/ });
  if (await busca.count()) await busca.fill(sufixo);
  await page.getByRole("option", { name: new RegExp(literal(nome)) }).click();
  await expect(novo.getByLabel("Descrição do item 1")).toHaveValue(nome);
  await novo.getByLabel("Quantidade do item 1").fill(quantidade);
  await novo.getByRole("textbox", { name: /Entrega desejada/ }).fill(diaFuturo(10));
  await novo.getByRole("button", { name: "Criar pedido" }).click();
  await expect(ficha(page).getByRole("heading", { name: `Material E2E ${sufixo} (sintético)` })).toBeVisible(DEPOIS_DA_ACAO);
}

test("item novo recebe entrada, é reservado por um pedido e baixado no recebimento", async ({ page }) => {
  test.slow(); // fluxo longo, de Estoque a Compras e de volta
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36).toUpperCase();
  const nome = `Conector E2E ${sufixo} (sintético)`;

  // 1. Novo item: a Empresa é obrigatória.
  await page.goto("/suprimentos/estoque");
  await page.getByRole("button", { name: "Novo item" }).click();
  const novo = page.getByRole("dialog", { name: "Novo item de estoque" });
  await novo.getByRole("button", { name: "Cadastrar item" }).click();
  await expect(novo.getByText("Erro: escolha a empresa do item (Plugga ou Waze Energia).")).toBeVisible();
  await novo.getByRole("radio", { name: "Waze Energia" }).click();
  await novo.getByLabel("Descrição").fill(nome);
  await novo.getByRole("combobox", { name: /Categoria/ }).click();
  await page.getByRole("option", { name: "Material elétrico" }).click();
  await novo.getByLabel("Código").fill(`E2E-${sufixo}`);
  await novo.getByLabel("Estoque mínimo").fill("10");
  await novo.getByRole("button", { name: "Cadastrar item" }).click();

  await expect(ficha(page).getByRole("heading", { name: nome })).toBeVisible(DEPOIS_DA_ACAO);
  const itemId = new URL(page.url()).searchParams.get("item");
  expect(itemId).toBeTruthy();

  // 2. Entrada pela ficha, com quantidade digitada em pt-BR.
  await ficha(page).getByRole("button", { name: "Registrar entrada" }).click();
  const mov = page.getByRole("dialog", { name: "Registrar movimentação" });
  await expect(mov.getByRole("combobox", { name: /Item/ })).toContainText(nome);
  await mov.getByLabel(/Quantidade/).fill("1.050");
  await mov.getByLabel(/Custo unitário/).fill("9,50");
  await expect(mov.getByText("Disponível depois")).toBeVisible();
  await mov.getByLabel(/Quantidade/).fill("50");
  await mov.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.locator(".aviso--sucesso")).toHaveText(`Entrada registrada: ${nome}.`);
  await expect(ficha(page).getByText("Disponível para novos pedidos")).toBeVisible();
  await expect(ficha(page).locator("strong", { hasText: /^50 un$/ }).first()).toBeVisible();

  // 3. Pedido de compra com o item vinculado ao estoque (Novo pedido), atendido pelo estoque: reserva 12.
  await criarPedidoVinculado(page, sufixo, nome, "12");
  await ficha(page).getByRole("button", { name: "Iniciar análise de estoque" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Pedido em análise de estoque.", DEPOIS_DA_ACAO);
  await ficha(page).getByRole("button", { name: /Sim, atender pelo estoque/ }).click();
  await expect(ficha(page).getByRole("button", { name: "Confirmar recebimento" })).toBeVisible(DEPOIS_DA_ACAO);

  await page.goto(`/suprimentos/estoque?item=${itemId}`);
  await expect(ficha(page).getByRole("heading", { name: nome })).toBeVisible(DEPOIS_DA_ACAO);
  const reservas = ficha(page).getByRole("region", { name: "Reservas" });
  await expect(reservas.getByText("12 un")).toBeVisible();
  await expect(ficha(page).getByRole("group", { name: "Saldo do item" })).toContainText("12 un");
  await expect(ficha(page).locator("strong", { hasText: /^38 un$/ }).first()).toBeVisible();

  // 4. Recebimento: a reserva vira saída.
  await reservas.getByRole("link", { name: "Abrir pedido" }).click();
  await ficha(page).getByRole("button", { name: "Confirmar recebimento" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toContainText("Recebimento confirmado", DEPOIS_DA_ACAO);

  await page.goto(`/suprimentos/estoque?visao=movimentacoes&item_mov=${itemId}`);
  const lista = page.locator("#estoque-conteudo");
  await expect(lista.getByRole("button", { name: new RegExp(`^Saída de ${nome.replace(/[()]/g, "\\$&")}, −12 un`) })).toBeVisible();
  await expect(lista.getByRole("button", { name: new RegExp(`^Reserva de ${nome.replace(/[()]/g, "\\$&")}, 12 un`) })).toBeVisible();
  await expect(lista.getByRole("button", { name: new RegExp(`^Entrada de ${nome.replace(/[()]/g, "\\$&")}, \\+50 un`) })).toBeVisible();

  // A linha abre o detalhe também pelo teclado.
  await lista.getByRole("button", { name: new RegExp(`^Saída de`) }).focus();
  await page.keyboard.press("Enter");
  const detalhe = page.getByRole("dialog", { name: new RegExp(`^Saída · ${nome.replace(/[()]/g, "\\$&")}`) });
  await expect(detalhe.getByText("Movimentação registrada não se edita")).toBeVisible();
  await detalhe.getByRole("button", { name: "Ver item" }).click();
  await expect(ficha(page).getByRole("group", { name: "Saldo do item" })).toContainText("38 un");
  await expect(ficha(page).getByText(/Nenhuma reserva/)).toBeVisible();
});

test("Registrar movimentação: a empresa filtra o item e trocar a empresa limpa o item; data impossível ou futura é bloqueada", async ({ page }) => {
  await bloquearTerceiros(page);
  await page.goto("/suprimentos/estoque");
  await page.getByRole("button", { name: "Registrar movimentação" }).click();
  const mov = page.getByRole("dialog", { name: "Registrar movimentação" });
  await expect(mov.getByRole("combobox", { name: /Item/ })).toBeDisabled();

  await mov.getByRole("combobox", { name: /Empresa/ }).click();
  await page.getByRole("option", { name: "Waze Energia" }).click();
  await mov.getByRole("combobox", { name: /Item/ }).click();
  const opcoes = page.getByRole("listbox", { name: "Item" }).getByRole("option");
  const total = await opcoes.count();
  test.skip(total === 0, "sem itens da Waze no banco local");
  await opcoes.first().click();
  await expect(mov.getByText("Disponível depois")).toBeVisible();

  await mov.getByRole("combobox", { name: /Empresa/ }).click();
  await page.getByRole("option", { name: "Plugga" }).click();
  await expect(mov.getByRole("combobox", { name: /Item/ })).toContainText("Selecione o item");
  await expect(mov.getByText("Disponível depois")).toBeHidden();

  const data = mov.getByRole("textbox", { name: /Data/ });
  await data.fill("31/02/2026");
  await data.blur();
  await expect(mov.locator(".ui-field-error").first()).toBeVisible();
  const amanha = new Date(Date.now() + 2 * 86_400_000);
  await data.fill(`${String(amanha.getUTCDate()).padStart(2, "0")}/${String(amanha.getUTCMonth() + 1).padStart(2, "0")}/${amanha.getUTCFullYear()}`);
  await data.blur();
  await expect(data).toHaveAttribute("aria-invalid", "true");
});

test("aquisição de item vinculado dá entrada no estoque no recebimento", async ({ page, baseURL }) => {
  test.slow(); // as 7 etapas da aquisição
  await bloquearTerceiros(page);
  const origem = { origin: new URL(baseURL!).origin };
  const sufixo = Date.now().toString(36).toUpperCase();
  const nome = `Disjuntor E2E ${sufixo} (sintético)`;
  const item = await page.request.post("/api/suprimentos/estoque/itens", { headers: origem, data: { empresa: "waze", codigo: `E2E-${sufixo}`, nome, categoria: "material_eletrico", unidade: "un", estoqueMinimo: "0" } });
  expect(item.status(), await item.text()).toBe(201);
  const { id: itemId } = (await item.json()) as { id: string };
  const fornecedor = await page.request.post("/api/suprimentos/fornecedores", { headers: origem, data: { nome: `Fornecedor E2E ${sufixo} (sintético)`, categoria: "material_eletrico" } });
  expect(fornecedor.status(), await fornecedor.text()).toBe(201);
  const { nome: nomeDoFornecedor } = (await fornecedor.json()) as { nome: string };

  await criarPedidoVinculado(page, sufixo, nome, "5");
  await ficha(page).getByRole("button", { name: "Iniciar análise de estoque" }).click();
  await ficha(page).getByRole("button", { name: /Não, precisa comprar/ }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toContainText("Cotações");
  await ficha(page).getByRole("button", { name: "Adicionar cotação" }).click();
  const cotacao = page.getByRole("dialog", { name: "Adicionar cotação" });
  await cotacao.getByRole("combobox").first().click();
  await page.getByRole("option", { name: nomeDoFornecedor }).click();
  await cotacao.getByLabel("Valor").fill("190,00");
  await cotacao.getByLabel("Prazo de entrega (dias úteis)").fill("2");
  await cotacao.locator("input[type=file]").setInputFiles(PDF);
  await cotacao.getByRole("button", { name: "Registrar cotação" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Cotação registrada.");
  await ficha(page).getByRole("tab", { name: /Cotações/ }).click();
  await ficha(page).getByRole("button", { name: "Escolher como vencedora" }).click();
  await ficha(page).getByRole("tab", { name: "Visão geral" }).click();
  await ficha(page).getByRole("button", { name: "Enviar para aprovação" }).click();
  await ficha(page).getByRole("button", { name: "Aprovar compra" }).click();
  await ficha(page).getByRole("radio", { name: "PIX" }).click();
  await ficha(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Pagamento registrado.", DEPOIS_DA_ACAO);

  const entrada = ficha(page).getByRole("group", { name: `Entrada de ${nome}` });
  await expect(entrada.getByLabel(/Quantidade recebida/)).toHaveValue("5");
  await ficha(page).getByRole("button", { name: "Confirmar recebimento" }).click();
  await expect(entrada.getByText("Erro: informe o custo, como 9,50.")).toBeVisible();
  await entrada.getByLabel(/Custo unitário/).fill("38,00");
  await ficha(page).getByRole("button", { name: "Confirmar recebimento" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Recebimento confirmado: aquisição concluída.", DEPOIS_DA_ACAO);

  await page.goto(`/suprimentos/estoque?item=${itemId}`);
  await expect(ficha(page).getByRole("group", { name: "Saldo do item" })).toContainText("5 un");
  await expect(ficha(page).getByRole("group", { name: "Saldo do item" })).toContainText("R$ 190,00 pelo custo médio");
});

import { expect, test, type Page } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Estoque (PLU-333): o fluxo do material com dados sintéticos. Pela tela: criar
 * o item e dar entrada. Pelo pedido de compra (as ações que a ficha do pedido
 * dispara): atender pelo estoque reserva, e o recebimento converte a reserva
 * em saída. De volta à tela, a ficha e as movimentações mostram cada passo.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.229" } });

const ficha = (page: Page) => page.locator("dialog[open]").first();

function diaFuturo(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

test("item novo recebe entrada, é reservado por um pedido e baixado no recebimento", async ({ page, baseURL }) => {
  await bloquearTerceiros(page);
  const origem = { origin: new URL(baseURL!).origin };
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

  await expect(ficha(page).getByRole("heading", { name: nome })).toBeVisible();
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

  // 3. Pedido de compra com o item vinculado, atendido pelo estoque: reserva 12.
  const pedido = await page.request.post("/api/suprimentos/compras/pedidos", {
    headers: origem,
    data: { empresa: "waze", titulo: `Reposição E2E ${sufixo} (sintético)`, destino: "interno", itens: [{ descricao: nome, quantidade: "12", unidade: "un", itemDeEstoqueId: itemId }], prazoEntregaDesejado: diaFuturo(10) },
  });
  expect(pedido.status(), await pedido.text()).toBe(201);
  const { id: pedidoId } = (await pedido.json()) as { id: string };
  for (const acao of [{ acao: "iniciar_analise" }, { acao: "decidir_estoque", origem: "estoque" }]) {
    const r = await page.request.post(`/api/suprimentos/compras/pedidos/${pedidoId}/acoes`, { headers: origem, data: acao });
    expect(r.status(), await r.text()).toBeLessThan(300);
  }

  await page.goto(`/suprimentos/estoque?item=${itemId}`);
  await expect(ficha(page).getByRole("heading", { name: nome })).toBeVisible();
  const reservas = ficha(page).getByRole("region", { name: "Reservas" });
  await expect(reservas.getByText("12 un")).toBeVisible();
  await expect(ficha(page).getByRole("group", { name: "Saldo do item" })).toContainText("12 un");
  await expect(ficha(page).locator("strong", { hasText: /^38 un$/ }).first()).toBeVisible();

  // 4. Recebimento: a reserva vira saída.
  const recebido = await page.request.post(`/api/suprimentos/compras/pedidos/${pedidoId}/acoes`, { headers: origem, data: { acao: "confirmar_recebimento" } });
  expect(recebido.status(), await recebido.text()).toBeLessThan(300);

  await page.goto(`/suprimentos/estoque?visao=movimentacoes&item_mov=${itemId}`);
  const lista = page.locator("#estoque-conteudo");
  await expect(lista.getByRole("button", { name: new RegExp(`^Saída de ${nome.replace(/[()]/g, "\\$&")}, −12 un`) })).toBeVisible();
  await expect(lista.getByRole("button", { name: new RegExp(`^Reserva de ${nome.replace(/[()]/g, "\\$&")}, 12 un`) })).toBeVisible();
  await expect(lista.getByRole("button", { name: new RegExp(`^Entrada de ${nome.replace(/[()]/g, "\\$&")}, \\+50 un`) })).toBeVisible();

  await lista.getByRole("button", { name: new RegExp(`^Saída de`) }).click();
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

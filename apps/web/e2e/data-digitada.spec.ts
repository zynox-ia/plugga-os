import { expect, test, type Page } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * PLU-352: data digitada que não vale (fora do min/max) nunca segue com a última
 * data válida. O envio para no campo; corrigida a data, o envio leva a nova.
 * Uma tela de cada módulo (o Financeiro está no financeiro.spec, "Pago em").
 * Os POSTs são interceptados e respondidos com 503: nada é gravado.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.248" }, contextOptions: { reducedMotion: "reduce" } });
test.beforeEach(async ({ page }) => { await bloquearTerceiros(page); });

function dia(deslocamento: number): { texto: string; iso: string } {
  const d = new Date(Date.now() + deslocamento * 86_400_000);
  const [ano, mes, dd] = [String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")];
  return { texto: `${dd}/${mes}/${ano}`, iso: `${ano}-${mes}-${dd}` };
}

/** Intercepta o POST de `caminho`, guarda os corpos e responde 503. */
async function interceptar(page: Page, caminho: string): Promise<Record<string, unknown>[]> {
  const corpos: Record<string, unknown>[] = [];
  await page.route((url) => url.pathname === caminho, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    corpos.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, json: { codigo: "SERVICO_INDISPONIVEL", mensagem: "Teste sintético: nada gravado." } });
  });
  return corpos;
}

test("Compras: entrega desejada no passado não segue com a data anterior", async ({ page }) => {
  const corpos = await interceptar(page, "/api/suprimentos/compras/pedidos");
  await page.goto("/suprimentos/compras");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const novo = page.getByRole("dialog", { name: "Novo pedido de compra" });
  await novo.getByRole("radio", { name: "Waze Energia" }).click();
  await novo.getByLabel("Título").fill("Pedido sintético da data digitada");
  await novo.getByRole("radio", { name: "Interno" }).click();
  await novo.getByLabel("Descrição do item 1").fill("Item sintético");
  await novo.getByLabel("Quantidade do item 1").fill("1");
  const prazo = novo.getByRole("textbox", { name: /Entrega desejada/ });
  await prazo.fill(dia(20).texto);
  await prazo.fill(dia(-3).texto);
  await novo.getByRole("button", { name: "Criar pedido" }).click();
  await expect(novo.getByText(/Escolha uma data a partir de/)).toBeVisible();
  await expect(prazo).toBeFocused();
  expect(corpos).toHaveLength(0);

  // O calendário continua corrigindo a data: "Hoje" preenche o campo e tira o erro.
  await novo.getByRole("button", { name: "Abrir calendário de Entrega desejada" }).click();
  await page.getByRole("dialog", { name: "Calendário de Entrega desejada" }).getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(novo.getByText(/Escolha uma data a partir de/)).toHaveCount(0);
  const hoje = await prazo.inputValue();
  await novo.getByRole("button", { name: "Criar pedido" }).click();
  await expect.poll(() => corpos.length).toBe(1);
  expect(corpos[0]).toMatchObject({ prazoEntregaDesejado: hoje.split("/").reverse().join("-") });

  // E a data digitada válida também segue.
  await prazo.fill(dia(15).texto);
  await novo.getByRole("button", { name: "Criar pedido" }).click();
  await expect.poll(() => corpos.length).toBe(2);
  expect(corpos[1]).toMatchObject({ prazoEntregaDesejado: dia(15).iso });
});

test("Estoque: data futura na movimentação não segue com a data anterior", async ({ page }) => {
  const corpos = await interceptar(page, "/api/suprimentos/estoque/movimentacoes");
  await page.goto("/suprimentos/estoque");
  await page.getByRole("button", { name: "Registrar movimentação" }).click();
  const mov = page.getByRole("dialog", { name: "Registrar movimentação" });
  await mov.getByRole("combobox", { name: /Empresa/ }).click();
  await page.getByRole("option", { name: "Waze Energia" }).click();
  await mov.getByRole("combobox", { name: /Item/ }).click();
  const opcoes = page.getByRole("listbox", { name: "Item" }).getByRole("option");
  test.skip(await opcoes.count() === 0, "sem itens da Waze no banco local");
  await opcoes.first().click();
  await mov.getByRole("combobox", { name: /Tipo/ }).click();
  await page.getByRole("option", { name: "Entrada", exact: true }).click();
  await mov.getByLabel(/Quantidade/).fill("1");
  await mov.getByLabel(/Custo unitário/).fill("9,50");
  const data = mov.getByRole("textbox", { name: /Data/ });
  const hoje = await data.inputValue();
  await data.fill(dia(5).texto);
  await mov.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(mov.getByText(/Escolha uma data até/)).toBeVisible();
  await expect(data).toBeFocused();
  expect(corpos).toHaveLength(0);

  await data.fill(hoje);
  await mov.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect.poll(() => corpos.length).toBe(1);
  expect(corpos[0]).toMatchObject({ data: hoje.split("/").reverse().join("-") });
});

test("CRM: nascimento futuro no cadastro não vira data vazia nem a anterior", async ({ page }) => {
  const corpos = await interceptar(page, "/api/clientes");
  await page.goto("/clientes");
  await page.getByRole("button", { name: "+ Novo cliente" }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo cliente" });
  await dialogo.getByRole("radio", { name: "Pessoa física" }).click();
  await dialogo.getByLabel("Nome completo *").fill("Cliente sintético da data digitada");
  await dialogo.getByLabel("E-mail", { exact: true }).fill("data-digitada@teste.local");
  const nascimento = dialogo.getByRole("textbox", { name: /Data de nascimento/ });
  await nascimento.fill("15/03/1990");
  await nascimento.fill(dia(10).texto);
  await dialogo.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(dialogo.getByText(/Escolha uma data até/)).toBeVisible();
  await expect(nascimento).toBeFocused();
  expect(corpos).toHaveLength(0);

  await nascimento.fill("20/04/1991");
  await dialogo.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect.poll(() => corpos.length).toBe(1);
  expect(corpos[0]).toMatchObject({ birthDate: "1991-04-20" });
});

import { expect, test, type Page } from "@playwright/test";

const MUTATION_TIMEOUT_MS = 15_000;

// Documentos da faixa sintética do projeto (scripts/dados-sinteticos.mjs: CNPJ 99999…, CPF 999999…),
// gerados a cada execução com dígito verificador válido.
const algarismo = () => Math.floor(Math.random() * 10);
function digitoVerificador(base: number[], pesos: number[]): number {
  const resto = base.reduce((soma, d, i) => soma + d * pesos[i]!, 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
}
function gerarCnpj(): string {
  const base = [9, 9, 9, 9, 9, ...Array.from({ length: 7 }, algarismo)];
  const d1 = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, digitoVerificador([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])].join("");
}
function gerarCpf(): string {
  const base = [9, 9, 9, 9, 9, 9, ...Array.from({ length: 3 }, algarismo)];
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, digitoVerificador([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])].join("");
}

async function cadastrar(page: Page, dados: { tipo?: "Pessoa física"; nome: string; documento?: string; telefone?: string; email?: string }) {
  await page.goto("/clientes");
  await page.getByRole("button", { name: "+ Novo cliente" }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo cliente" });
  if (dados.tipo) await dialogo.getByRole("radio", { name: dados.tipo }).click();
  await dialogo.getByLabel(dados.tipo ? "Nome completo *" : "Nome *").fill(dados.nome);
  if (dados.documento) await dialogo.getByLabel(dados.tipo ? "CPF" : "CNPJ", { exact: true }).fill(dados.documento);
  if (dados.telefone) await dialogo.getByLabel("Telefone", { exact: true }).fill(dados.telefone);
  if (dados.email) await dialogo.getByLabel("E-mail", { exact: true }).fill(dados.email);
  await dialogo.getByRole("button", { name: "Cadastrar cliente" }).click();
  const ficha = page.getByRole("dialog", { name: `Ficha de ${dados.nome}` });
  await expect(ficha.getByRole("heading", { name: dados.nome, exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
  return ficha;
}

test.describe("Clientes — cadastro único (PLU-268)", () => {
  test("busca sem correspondência mostra o estado vazio, não dado simulado", async ({ page }) => {
    await page.goto("/clientes?q=zzz-sem-correspondencia-zzz");
    await expect(page.getByText("Nenhum cliente encontrado para a busca.")).toBeVisible();
  });

  test("exige telefone ou e-mail e cadastra prospect PJ sem documento", async ({ page }) => {
    const nome = `Cliente E2E ${Date.now()}`;
    await page.goto("/clientes");
    await page.getByRole("button", { name: "+ Novo cliente" }).click();
    const dialogo = page.getByRole("dialog", { name: "Novo cliente" });
    await dialogo.getByLabel("Nome *").fill(nome);
    await dialogo.getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(dialogo.getByRole("alert")).toHaveText("Confira os campos destacados.");

    await dialogo.getByLabel("Telefone", { exact: true }).fill("(92) 99999-0001");
    await dialogo.getByRole("button", { name: "Cadastrar cliente" }).click();

    const ficha = page.getByRole("dialog", { name: `Ficha de ${nome}` });
    await expect(ficha.getByText("sem documento", { exact: false })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await expect(page).toHaveURL(/[?&]cliente=/);

    // O mesmo endereço reabre a mesma ficha (link compartilhável).
    await page.goto(page.url());
    await expect(page.getByRole("dialog", { name: `Ficha de ${nome}` }).getByRole("heading", { name: nome, exact: true })).toBeVisible();
  });

  test("adiciona contatos a um cliente PJ e troca o principal", async ({ page }) => {
    const ficha = await cadastrar(page, { nome: `Cliente E2E Contatos ${Date.now()}`, email: `e2e-${Date.now()}@teste.local` });

    await ficha.getByRole("tab", { name: /Contatos/ }).click();
    await ficha.getByLabel("Nome do contato *").fill("Juliana Prado");
    await ficha.getByLabel("Papel").selectOption("decisor");
    await ficha.getByRole("button", { name: "Salvar contato" }).click();
    const juliana = ficha.getByRole("article", { name: "Contato Juliana Prado" });
    await expect(juliana.getByText("Principal", { exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });

    await ficha.getByRole("button", { name: "+ Adicionar contato" }).click();
    await ficha.getByLabel("Nome do contato *").fill("Rodrigo Lima");
    await ficha.getByRole("button", { name: "Salvar contato" }).click();
    const rodrigo = ficha.getByRole("article", { name: "Contato Rodrigo Lima" });
    await rodrigo.getByRole("button", { name: "Tornar principal" }).click();
    await expect(rodrigo.getByText("Principal", { exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await expect(juliana.getByText("Principal", { exact: true })).toHaveCount(0);
  });

  test("bloqueia CNPJ repetido e oferece abrir a ficha existente", async ({ page }) => {
    const cnpj = gerarCnpj();
    const nome = `Cliente E2E CNPJ ${Date.now()}`;
    await cadastrar(page, { nome, documento: cnpj, email: `e2e-cnpj-${Date.now()}@teste.local` });

    await page.goto("/clientes");
    await page.getByRole("button", { name: "+ Novo cliente" }).click();
    const dialogo = page.getByRole("dialog", { name: "Novo cliente" });
    await dialogo.getByLabel("CNPJ", { exact: true }).fill(cnpj);
    await dialogo.getByLabel("Nome *").focus();
    await expect(dialogo.getByRole("status").filter({ hasText: "Já existe um cliente com este CNPJ" })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await expect(dialogo.getByRole("link", { name: "Abrir a ficha" })).toBeVisible();
  });

  test("pessoa física não tem aba Contatos e aparece com CPF mascarado na lista", async ({ page }) => {
    const nome = `Cliente E2E PF ${Date.now()}`;
    const ficha = await cadastrar(page, { tipo: "Pessoa física", nome, documento: gerarCpf(), email: `e2e-pf-${Date.now()}@teste.local` });
    await expect(ficha.getByRole("tab", { name: /Contatos/ })).toHaveCount(0);

    await page.goto(`/clientes?q=${encodeURIComponent(nome)}`);
    const linha = page.getByRole("table", { name: "Clientes cadastrados" }).getByRole("row").filter({ hasText: nome });
    await expect(linha.getByRole("cell", { name: /^•••\.\d{3}\.\d{3}-••$/ })).toBeVisible();
  });

  test("inativa e reativa um cliente pela ficha", async ({ page }) => {
    const ficha = await cadastrar(page, { nome: `Cliente E2E Status ${Date.now()}`, telefone: "(92) 99999-0002" });

    await ficha.getByRole("button", { name: "Inativar" }).click();
    await expect(ficha.getByText("Inativo", { exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });

    await ficha.getByRole("button", { name: "Reativar" }).click();
    await expect(ficha.getByText("Ativo", { exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
  });
});

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { CreateClientResponse, Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

/**
 * Movimento de entrada (PLU-325, GSAP): a entrada roda uma vez por montagem,
 * nada volta a animar ao filtrar ou mover cartão, o modal sai animado sem
 * quebrar Esc nem o foco, e com movimento reduzido nada é animado.
 */
// A suíte principal roda com movimento reduzido (playwright.config.ts); aqui o
// movimento volta, porque é a animação que está sob teste.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

let pipeline: Pipeline;
async function criar<T>(request: APIRequestContext, origin: string, caminho: string, data: object): Promise<T> {
  const resposta = await request.post(caminho, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}
type Tocado = HTMLElement & { _gsap?: unknown };
/** Elementos que o GSAP animou (ele guarda `_gsap` no alvo). */
const tocados = (page: Page) => page.locator("main").evaluate((main) => [...main.querySelectorAll<Tocado>("*")].filter((el) => el._gsap).length);
/** Desses, os que ainda têm opacity/transform inline, isto é, em plena entrada. */
const emEntrada = (page: Page) => page.locator("main").evaluate((main) =>
  [...main.querySelectorAll<Tocado>("*")].filter((el) => el._gsap && /opacity|transform/.test(el.getAttribute("style") ?? "")).length);
/** Registra, a partir de agora, toda mudança de estilo que pareça uma entrada nova. */
const vigiar = (page: Page) => page.evaluate(() => {
  const registro: string[] = [];
  (window as unknown as { entradas: string[] }).entradas = registro;
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      const estilo = (m.target as HTMLElement).getAttribute("style") ?? "";
      if (/opacity: 0|translate\(|translate3d|scale\(/.test(estilo)) registro.push(estilo);
    }
  }).observe(document.querySelector("main")!, { attributes: true, attributeFilter: ["style"], subtree: true });
});
const entradas = (page: Page) => page.evaluate(() => (window as unknown as { entradas: string[] }).entradas);

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const marca = Date.now();
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  pipeline = await criar<Pipeline>(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Movimento E2E ${marca}`, description: null,
    valueLabel: "Investimento", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: Array.from({ length: 3 }, (_, i) => ({ name: `Etapa ${i + 1}`, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })),
    tags: [], lossReasons: [], members: [],
  });
  const { client } = await criar<CreateClientResponse>(request, baseURL!, "/api/clientes", {
    personType: "pj", name: `Cliente sintético movimento ${marca}`, email: `movimento-${marca}@teste.local`,
  });
  for (let i = 0; i < 12; i++) await criar<Deal>(request, baseURL!, "/api/leads", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, clientId: client.id,
    ownerId: pessoas.people[0]!.id, title: `Lead movimento ${i}`, value: "1000", tagIds: [],
    lead: { personType: "pj", name: `Lead movimento ${i}`, email: `movimento-lead-${marca}-${i}@teste.local` },
  });
});
test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("o quadro entra uma vez e não volta a animar ao filtrar nem ao mover um cartão", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const corpo = page.getByRole("region", { name: "Negócios em Etapa 1", exact: true });
  await expect(corpo.getByRole("article")).toHaveCount(12);
  // A entrada termina, limpa os estilos e marca o bloco como pronto.
  await expect(page.locator(".quadro-area-colunas[data-plg-pronto]")).toHaveCount(1);
  await expect.poll(() => emEntrada(page)).toBe(0);
  await expect(page.locator("[data-plg-aguarda]")).toHaveCount(0);

  await vigiar(page);
  const busca = page.getByRole("searchbox", { name: "Buscar negócios" });
  await busca.fill("nada-com-este-nome");
  await expect(corpo.getByRole("article")).toHaveCount(0);
  await busca.fill("");
  await expect(corpo.getByRole("article")).toHaveCount(12);
  // O servidor recusa: o cartão vai para a Etapa 2 e volta, sem persistir.
  await page.route("**/api/leads/*/etapa", (rota) => rota.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Recusado no teste" }) }));
  await corpo.locator("[data-cartao-id]").first().getByRole("button", { name: /^Ações de/ }).click();
  await page.getByRole("menuitem", { name: "Etapa 2" }).click();
  // O Next tem o próprio anunciador de rota com role=alert; o filtro pega o aviso da tela.
  await expect(page.getByRole("alert").filter({ hasText: "Recusado no teste" })).toBeVisible();
  await expect(corpo.getByRole("article")).toHaveCount(12);
  expect(await entradas(page)).toEqual([]);
});

test("o modal sai animado com Esc, fecha de fato e devolve o foco", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const ver = page.getByRole("region", { name: "Negócios em Etapa 1", exact: true }).getByRole("button", { name: /^Ver lead/ }).first();
  await ver.click();
  const dialogo = page.getByRole("dialog", { name: "Detalhes do lead" });
  await expect(dialogo).toBeVisible();
  await expect.poll(() => dialogo.evaluate((el) => el.getAttribute("style") ?? "")).not.toMatch(/opacity/);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.modal--saindo")).toHaveCount(1);
  await expect(dialogo).toHaveCount(0);
  await expect(ver).toBeFocused();
});

test("com movimento reduzido nada entra animado e o conteúdo aparece direto", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  await expect(page.getByRole("region", { name: "Negócios em Etapa 1", exact: true }).getByRole("article")).toHaveCount(12);
  expect(await tocados(page)).toBe(0);
  await expect(page.locator("[data-plg-aguarda]")).toHaveCount(0);
  await page.getByRole("region", { name: "Negócios em Etapa 1", exact: true }).getByRole("button", { name: /^Ver lead/ }).first().click();
  const dialogo = page.getByRole("dialog", { name: "Detalhes do lead" });
  await expect(dialogo).toBeVisible();
  expect(await dialogo.evaluate((el) => el.getAttribute("style") ?? "")).not.toMatch(/opacity|transform/);
  await page.keyboard.press("Escape");
  await expect(dialogo).toHaveCount(0);
  await expect(page.locator("dialog.modal--saindo")).toHaveCount(0);
});

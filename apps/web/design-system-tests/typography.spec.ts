import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "plugga_session", value: "simulada", url: baseURL! }]);
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
});

test("tipografia compartilha a quebra balanceada e a altura de linha fora do catálogo", async ({ context, page }) => {
  await context.clearCookies();
  await page.goto("/login");
  await expect(page.locator("body")).toHaveCSS("text-wrap-style", "balance");
  const subtitle = page.locator(".auth-form-subtitle");
  await expect(subtitle).toBeVisible();
  const leading = await subtitle.evaluate((element) => {
    const style = getComputedStyle(element);
    return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
  });
  expect(leading).toBeCloseTo(1.5, 2);
});

test("escala mantém o ritmo de leitura e não transborda em telas pequenas", async ({ page }) => {
  await page.goto("/design-system?item=typography");
  await page.evaluate(() => document.fonts.ready);
  const expectedLeading = [1.2, 1.3, 1.4, 1.5, 1.4, 1.5];
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const samples = page.locator(".ds-type-row > span");
    await expect(samples).toHaveCount(expectedLeading.length);
    for (const [index, leading] of expectedLeading.entries()) {
      const sample = samples.nth(index);
      await expect(sample).toHaveCSS("text-wrap-style", "balance");
      const metrics = await sample.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          leading: parseFloat(style.lineHeight) / parseFloat(style.fontSize),
          overflow: element.scrollWidth - element.clientWidth,
        };
      });
      expect(metrics.leading).toBeCloseTo(leading, 2);
      expect(metrics.overflow).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("texto de leitura distribui as linhas sem deixar uma última linha isolada", async ({ page }) => {
  await page.goto("/design-system?item=typography");
  await page.evaluate(() => document.fonts.ready);
  const paragraph = page.locator(".ds-type-reading > p").first();
  await expect(paragraph).toBeVisible();
  const lines = await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).filter((rect) => rect.width > 0).map((rect) => rect.width);
  });
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.length).toBeLessThanOrEqual(6);
  expect(Math.min(...lines) / Math.max(...lines)).toBeGreaterThan(0.7);
});

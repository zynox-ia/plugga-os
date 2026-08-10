import type { Page } from "@playwright/test";

/**
 * Corta as requisições de terceiros das telas de autenticação.
 *
 * A tela de login carrega uma animação 3D da Spline num `iframe` de tela cheia
 * (`AuthCard` → `.spline-container`). Ela é decorativa e já tem
 * `pointer-events: none`, mas custa caro em navegador headless: o compositor
 * fica ocupado desenhando a cena com `mix-blend-mode: luminosity` por cima da
 * página inteira, e o clique do Playwright para de responder no passo em que ele
 * confere se o botão recebe o ponteiro — o log morre depois de "done scrolling"
 * e o teste estoura por timeout.
 *
 * Fora disso, e-mail e senha preenchem normalmente: o problema aparece só no
 * clique, que é o único passo que depende de um quadro renderizado.
 *
 * Vale por si, mesmo sem o travamento: e2e que depende de CDN de terceiro falha
 * quando a rede da CI oscila, e o que está sendo testado é o nosso login.
 */
export async function bloquearTerceiros(page: Page): Promise<void> {
  await page.route(/https?:\/\/(my\.)?spline\.design\//, (route) => route.abort());
}

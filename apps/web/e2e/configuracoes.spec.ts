import { expect, test } from "@playwright/test";

test("deep link pessoal permite trocar abas pelo mouse e teclado", async ({ page }) => {
  await page.goto("/configuracoes?aba=seguranca");
  const perfil = page.getByRole("tab", { name: "Perfil & Seguran\u00e7a", exact: true });
  const notificacoes = page.getByRole("tab", { name: "Notifica\u00e7\u00f5es", exact: true });
  await expect(perfil).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Senha Atual", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Senha Atual", { exact: true })).toHaveValue("");
  await notificacoes.click();
  await expect(notificacoes).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Notifica\u00e7\u00f5es");
  await expect(page.getByRole("button", { name: "Salvar prefer\u00eancias" })).toBeDisabled();
  await notificacoes.press("ArrowLeft");
  await expect(perfil).toBeFocused();
  await expect(perfil).toHaveAttribute("aria-selected", "true");
  await perfil.press("ArrowRight");
  await expect(notificacoes).toBeFocused();
  await expect(notificacoes).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(notificacoes).toHaveAttribute("aria-selected", "true");
});

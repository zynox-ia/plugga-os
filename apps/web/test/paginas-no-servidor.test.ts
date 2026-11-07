import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { podeAbrirPagina } from "../app/lib/acesso-paginas.ts";

const app = fileURLToPath(new URL("../app/", import.meta.url));
const publicas = new Set(["/login", "/auth/accept-invite", "/auth/reset", "/privacidade", "/termos"]);
const arquivos = readdirSync(app, { recursive: true, withFileTypes: true })
  .filter((arquivo) => arquivo.isFile() && arquivo.name === "page.tsx")
  .map((arquivo) => join(arquivo.parentPath, arquivo.name));

test("inventário de páginas exige regra e guarda no servidor, sem depender só do middleware", () => {
  for (const arquivo of arquivos) {
    const rota = `/${relative(app, arquivo).replaceAll("\\", "/").replace(/\/?page\.tsx$/, "")}`;
    if (publicas.has(rota)) continue;
    const codigo = readFileSync(arquivo, "utf8");
    if (rota === "/design-system") {
      const layout = readFileSync(join(app, "design-system/layout.tsx"), "utf8");
      assert.match(layout, /await exigirPagina\("\/design-system"\)/);
    } else {
      assert.match(codigo, /await exigirPagina\(/, rota);
      const leitura = codigo.search(/\bfetch[A-Z]\w*\(/);
      assert.ok(leitura === -1 || codigo.indexOf("await exigirPagina(") < leitura, `guard deve preceder leitura: ${rota}`);
    }
    assert.equal(podeAbrirPagina({ plataforma: "desenvolvedor", departamentos: [] }, rota), true, `sem regra: ${rota}`);
  }
});

test("Configurações só pré-carrega Equipe depois de verificar a seção do usuário", () => {
  const pagina = readFileSync(join(app, "configuracoes/page.tsx"), "utf8");
  assert.match(pagina, /configuracoesParaAcesso\(usuario\.acesso\)/);
  assert.match(pagina, /veEquipe \? await fetchEquipe\(\) : null/);
});

test("cockpit global não é enviado no HTML de membros e gerentes de departamento", () => {
  const pagina = readFileSync(join(app, "page.tsx"), "utf8");
  assert.match(pagina, /if \(usuario\.acesso\.plataforma === null\)\s*\{\s*return <PlaceholderScreen/);
  assert.ok(pagina.indexOf("if (usuario.acesso.plataforma === null)") < pagina.indexOf("await fetchHealth()"));
});

test("Configura\u00e7\u00f5es autoriza integra\u00e7\u00f5es e jobs antes de consultar e preserva erros", () => {
  const pagina = readFileSync(join(app, "configuracoes/page.tsx"), "utf8");
  assert.match(pagina, /veIntegracoes \? fetchIntegrations\(\) : null/);
  assert.match(pagina, /veIntegracoes \? fetchEmailStatus\(\) : null/);
  assert.match(pagina, /veJobs \? fetchJobs\(\) : null/);
  assert.match(pagina, /erroIntegracoes=/);
  assert.match(pagina, /erroJobs=/);
  assert.doesNotMatch(pagina, /FALLBACK_|estado === "erro" \? .*dados/);
});

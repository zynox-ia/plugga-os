import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BALDES_DE_SISTEMA, baldesDeNegocio } from "./baldes.js";

/**
 * O compose cria os baldes no primeiro `up`. Se a lista dele ficar para trás do
 * cadastro, o primeiro upload de um departamento novo falha com "NoSuchBucket"
 * em produção. Este teste prende as duas listas uma na outra.
 */
describe("compose.yaml provisiona todos os baldes", () => {
  const compose = readFileSync(resolve(__dirname, "../../../../../compose.yaml"), "utf-8");
  const inicio = compose.indexOf("  rustfs-provisiona:");
  const bloco = compose.slice(inicio, compose.indexOf("\n  # ---", inicio));

  it("encontra o serviço de provisionamento", () => {
    expect(inicio).toBeGreaterThan(-1);
  });

  it.each([...baldesDeNegocio(), ...Object.values(BALDES_DE_SISTEMA)])("cria %s", (balde) => {
    // O corpus aceita sobrescrita por CORPUS_BUCKET; o valor padrão é o do cadastro.
    const nome = balde === BALDES_DE_SISTEMA.corpus ? String.raw`\$\{CORPUS_BUCKET:-${balde}\}` : balde;
    // Não pode vir seguido de mais nome: plugga-financeiro não vale por plugga-financeiro-x.
    expect(bloco).toMatch(new RegExp(String.raw`${nome}(?![\w-])`));
  });

  it("provisiona o balde unico configuravel", () => {
    expect(bloco).toContain("STORAGE_BUCKET: ${STORAGE_BUCKET:-plugga-arquivos}");
  });

  it("entrega a API o mesmo balde configurado no provisionador", () => {
    const api = compose.slice(compose.indexOf("\n  api:"), compose.indexOf("\n  web:"));
    const balde = bloco.match(/^\s+STORAGE_BUCKET: (.+)$/m)?.[1];
    expect(balde).toBe("${STORAGE_BUCKET:-plugga-arquivos}");
    expect(api).toContain(`STORAGE_BUCKET: ${balde}`);
  });
});

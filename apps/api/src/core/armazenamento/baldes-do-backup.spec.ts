import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BALDES_DE_SISTEMA, baldesDeNegocio } from "./baldes.js";

const ARQUIVO = path.resolve(__dirname, "../../../../../ops/backup/baldes.txt");

function lista(): string[] {
  return readFileSync(ARQUIVO, "utf8")
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "" && !linha.startsWith("#"));
}

/** T050: o backup externo copia exatamente os baldes de negócio e o corpus. */
describe("ops/backup/baldes.txt", () => {
  it("lista todos os baldes de negócio e o corpus de faturas", () => {
    expect([...lista()].sort()).toEqual([...baldesDeNegocio(), BALDES_DE_SISTEMA.corpus].sort());
  });

  it("não inclui o balde do backup local (evita recursão)", () => {
    expect(lista()).not.toContain(BALDES_DE_SISTEMA.backups);
  });

  it("não repete balde", () => {
    expect(new Set(lista()).size).toBe(lista().length);
  });
});

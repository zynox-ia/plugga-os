import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ensurePrismaClient } from "../scripts/ensure-prisma-client.mjs";

let directory;
let options;
let generate;
const contents = 'generator client {\n  provider = "prisma-client-js"\n}\n';

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "plugga-prisma-check-"));
  const generatedDir = path.join(directory, "client");
  mkdirSync(generatedDir);
  options = { schemaPath: path.join(directory, "schema.prisma"), generatedDir, clientVersion: "6.15.0", cliVersion: "6.15.0", platform: "win32" };
  writeFileSync(options.schemaPath, contents);
  writeFileSync(path.join(generatedDir, "schema.prisma"), contents.replace(/\n/g, "\r\n"));
  writeFileSync(path.join(generatedDir, "package.json"), JSON.stringify({ version: "6.15.0" }));
  for (const file of ["index.js", "index.d.ts", "default.js", "query_engine-windows.dll.node"]) writeFileSync(path.join(generatedDir, file), "// generated");
  generate = vi.fn(() => ({ status: 0 }));
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("não toca no cliente atualizado enquanto a API pode estar usando a DLL", () => {
  expect(ensurePrismaClient(options, generate)).toBe(0);
  expect(generate).not.toHaveBeenCalled();
});

it("gera quando o schema muda", () => {
  writeFileSync(options.schemaPath, `${contents}\nmodel Example { id Int @id }`);
  expect(ensurePrismaClient(options, generate)).toBe(0);
  expect(generate).toHaveBeenCalledOnce();
});

it("aceita o alinhamento de campos feito pelo generator", () => {
  writeFileSync(options.schemaPath, contents.replace("provider =", "provider    ="));
  ensurePrismaClient(options, generate);
  expect(generate).not.toHaveBeenCalled();
});

it("preserva diferenças de espaços dentro de valores do schema", () => {
  writeFileSync(options.schemaPath, `${contents}\nmodel Example { id String @id @default("a  b") }`);
  writeFileSync(path.join(options.generatedDir, "schema.prisma"), `${contents}\nmodel Example { id String @id @default("a b") }`);
  ensurePrismaClient(options, generate);
  expect(generate).toHaveBeenCalledOnce();
});

it("gera quando muda a versão instalada", () => {
  options.clientVersion = options.cliVersion = "6.16.0";
  ensurePrismaClient(options, generate);
  expect(generate).toHaveBeenCalledOnce();
});

it.each(["index.js", "index.d.ts", "default.js", "schema.prisma", "package.json", "query_engine-windows.dll.node"])("repara cliente incompleto sem %s", (file) => {
  rmSync(path.join(options.generatedDir, file));
  ensurePrismaClient(options, generate);
  expect(generate).toHaveBeenCalledOnce();
});

it("gera em instalação sem cliente", () => {
  ensurePrismaClient({ ...options, generatedDir: null }, generate);
  expect(generate).toHaveBeenCalledOnce();
});

it("não esconde falha de geração nem erro ao iniciar o Prisma", () => {
  options.generatedDir = null;
  expect(ensurePrismaClient(options, () => ({ status: 1 }))).toBe(1);
  expect(ensurePrismaClient(options, () => ({ status: null }))).toBe(1);
  expect(() => ensurePrismaClient(options, () => ({ error: new Error("EPERM") }))).toThrow("EPERM");
});

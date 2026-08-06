import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

import { createAppConfig } from "./index.mjs";

const apiDirectory = fileURLToPath(new URL("../../../apps/api/", import.meta.url));
const eslint = new ESLint({
  cwd: apiDirectory,
  overrideConfig: createAppConfig({ app: "api" }),
  overrideConfigFile: true,
});

async function lintImport(filePath, importPath = "../prisma/prisma.service") {
  const [result] = await eslint.lintText(
    `import { PrismaService } from "${importPath}";\nvoid PrismaService;\n`,
    { filePath },
  );

  return result.messages;
}

test("API services cannot import PrismaService directly", async () => {
  const messages = await lintImport("src/example/example.service.ts");

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.ruleId, "no-restricted-imports");
  assert.match(messages[0]?.message ?? "", /only repository implementations/);
});

test("API repositories may import PrismaService", async () => {
  const messages = await lintImport("src/example/prisma-example.repository.ts");

  assert.deepEqual(messages, []);
});

test("PrismaModule may register its local PrismaService provider", async () => {
  const messages = await lintImport(
    "src/prisma/prisma.module.ts",
    "./prisma.service",
  );

  assert.deepEqual(messages, []);
});

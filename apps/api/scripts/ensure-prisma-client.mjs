import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
// O generator realinha os campos. Ignorar apenas espaços fora de strings/comentários;
// valores como @default("a  b") precisam continuar diferentes de @default("a b").
const schema = (file) => JSON.stringify(readFileSync(file, "utf8").replace(/\r\n/g, "\n")
  .match(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|[a-zA-Z_][a-zA-Z_0-9]*|\S/g));

/** Layout do generator prisma-client-js usado neste projeto (schema único). */
export function clientIsCurrent({ schemaPath, generatedDir, clientVersion, cliVersion, platform = process.platform }) {
  if (!generatedDir || clientVersion !== cliVersion) return false;
  try {
    return json(path.join(generatedDir, "package.json")).version === clientVersion
      && schema(schemaPath) === schema(path.join(generatedDir, "schema.prisma"))
      && (platform !== "win32" || existsSync(path.join(generatedDir, "query_engine-windows.dll.node")))
      && ["index.js", "index.d.ts", "default.js"].every((file) => existsSync(path.join(generatedDir, file)));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return false;
    throw error;
  }
}

export function ensurePrismaClient(options, generate) {
  if (clientIsCurrent(options)) return 0;
  // Falhas de geração continuam falhando a verificação; nunca aceitar cliente antigo.
  const result = generate();
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function main() {
  const clientPackage = require.resolve("@prisma/client/package.json");
  let generatedDir = null;
  try {
    generatedDir = path.dirname(createRequire(clientPackage).resolve(".prisma/client/package.json"));
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
  }
  return ensurePrismaClient({
    schemaPath: path.join(apiDir, "prisma/schema.prisma"),
    generatedDir,
    clientVersion: json(clientPackage).version,
    cliVersion: json(require.resolve("prisma/package.json")).version,
  }, () => spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "generate"], {
    cwd: apiDir,
    stdio: "inherit",
    env: process.env,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

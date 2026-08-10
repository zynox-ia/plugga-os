import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const standaloneAppDirectory = path.join(appDirectory, ".next/standalone/apps/web");
const serverPath = path.join(standaloneAppDirectory, "server.js");

function copyRuntimeDirectory(source, destination) {
  if (!existsSync(source)) {
    throw new Error(`Standalone runtime asset not found: ${source}`);
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}

if (!existsSync(serverPath)) {
  throw new Error("Standalone server not found. Run the web build before starting it.");
}

// `next build` deixa static/public fora da árvore standalone; o Dockerfile os
// copia para estes mesmos destinos. Repetir a montagem aqui faz o E2E executar
// o artefato que realmente vai para o container, inclusive os chunks do client.
copyRuntimeDirectory(
  path.join(appDirectory, ".next/static"),
  path.join(standaloneAppDirectory, ".next/static"),
);
copyRuntimeDirectory(
  path.join(appDirectory, "public"),
  path.join(standaloneAppDirectory, "public"),
);

process.env.HOSTNAME ??= "0.0.0.0";
process.env.PORT ??= "3000";

await import(pathToFileURL(serverPath).href);

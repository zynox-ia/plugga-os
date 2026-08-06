import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRootEnvPath = path.resolve(scriptDir, "../../../.env");
dotenv.config({ path: monorepoRootEnvPath });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for local Prisma operations");
}

const parsed = new URL(databaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "postgres"]);
if (parsed.protocol !== "postgresql:" || !localHosts.has(parsed.hostname)) {
  throw new Error("Refusing Prisma write: Block A only permits a local PostgreSQL database");
}

const result = spawnSync("prisma", process.argv.slice(2), {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;

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

// Hostname local não prova banco local. Esta máquina mantém túneis SSH para a
// VPS, e por eles `127.0.0.1:5432` é o Postgres de produção — com o mesmo
// endereço que o contêiner de desenvolvimento teria. A checagem acima, sozinha,
// aprovava `migrate dev` (que recria esquema) contra produção e ainda imprimia
// "only permits a local database": pior que não ter guarda, porque dá confiança.
//
// A porta é o que separa os dois mundos nesta máquina, então é nela que a regra
// pega. O stack local sobe deslocado (POSTGRES_PORT), as portas padrão ficam
// para os túneis, e nenhuma escrita passa por uma porta que possa ser túnel.
//
// A regra vale só para o laço de retorno. Dentro do contêiner o endereço é
// `postgres:5432` — nome de rede do Compose, que nenhum túnel alcança — e é
// assim que o ops/deploy.sh migra produção, de propósito e com backup antes.
const PORTAS_DE_TUNEL = new Set(["5432", "6379", "1025", "8025", "9000", "9001"]);
const porta = parsed.port || "5432";
const pelaMaquinaDoDesenvolvedor = parsed.hostname !== "postgres";
if (pelaMaquinaDoDesenvolvedor && PORTAS_DE_TUNEL.has(porta)) {
  throw new Error(
    `Recusando escrita do Prisma: a porta ${porta} de 127.0.0.1 é reservada aos ` +
      `túneis SSH para a VPS, então este endereço pode ser o banco de PRODUÇÃO. ` +
      `O stack local do Compose sobe em POSTGRES_PORT=55432; aponte a DATABASE_URL ` +
      `para lá. Se a intenção é mesmo migrar produção, use db:migrate:deploy pelo ` +
      `./ops/publicar.sh, que faz backup antes.`,
  );
}

const result = spawnSync("prisma", process.argv.slice(2), {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;

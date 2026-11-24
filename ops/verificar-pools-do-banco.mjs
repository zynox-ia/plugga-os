// Confere os três pools do banco (runtime, auth e jobs) com o MESMO validador que a
// API roda no boot (apps/api/src/prisma/validar-papel-banco.ts), antes de o deploy
// subir a aplicação. Roda dentro da imagem nova da API, com as URLs do compose:
//
//   docker compose run --rm --no-deps -T api node --input-type=module - < ops/verificar-pools-do-banco.mjs
//
// O pool de jobs é conferido mesmo com JOBS_ENABLED=false: ligar os jobs depois não
// pode ser a primeira vez que o login dele é testado. Não lê dados, não concede nada
// e nunca imprime URL, usuário nem senha.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const POOLS = [
  ["runtime", "DATABASE_URL", "plugga_runtime"],
  ["auth", "AUTH_DATABASE_URL", "plugga_auth_runtime"],
  ["jobs", "JOBS_DATABASE_URL", "plugga_jobs_runtime"],
];

const modulo = await import(pathToFileURL(resolve("dist/prisma/validar-papel-banco.js")).href);
const validarPapelBanco = modulo.validarPapelBanco ?? modulo.default?.validarPapelBanco;
const { PrismaClient } = await import("@prisma/client");

let reprovados = 0;
for (const [pool, variavel, grupo] of POOLS) {
  const url = process.env[variavel]?.trim();
  if (!url) {
    console.error(`✗ pool ${pool}: ${variavel} ausente no contêiner.`);
    reprovados++;
    continue;
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await validarPapelBanco(prisma, grupo);
    console.log(`✓ pool ${pool}: o login atende ao isolamento do grupo ${grupo}.`);
  } catch (erro) {
    // A mensagem do validador não leva credencial; a do Prisma pode levar o host.
    const motivo = erro instanceof Error && erro.message.startsWith("O papel do pool") ? erro.message : `não foi possível validar o pool ${grupo}.`;
    console.error(`✗ pool ${pool}: ${motivo}`);
    reprovados++;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (reprovados > 0) {
  console.error(`${reprovados} pool(s) reprovado(s): a aplicação não sobe com estes logins. Veja ops/GUIA.md, "Publicar em produção".`);
  process.exitCode = 1;
}

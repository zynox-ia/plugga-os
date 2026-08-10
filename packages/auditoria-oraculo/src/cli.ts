/**
 * `node src/cli.ts gerar` regrava o manifesto; `verificar` confere a árvore.
 *
 * Regravar é uma decisão, não um conserto: só faz sentido quando o pacote
 * normativo foi trocado de propósito, e o commit precisa dizer qual aprovação
 * autorizou.
 */
import { writeFile } from "node:fs/promises";

import { caminhoDoManifesto } from "./oraculo.ts";
import {
  descreverProblema,
  gerarManifesto,
  lerManifesto,
  serializarManifesto,
  verificarManifesto,
} from "./manifesto.ts";

async function gerar(): Promise<number> {
  const manifesto = await gerarManifesto();
  await writeFile(caminhoDoManifesto, serializarManifesto(manifesto), "utf8");
  console.log(`manifesto regravado: ${manifesto.totalDeArquivos} arquivos`);
  return 0;
}

async function verificar(): Promise<number> {
  const problemas = await verificarManifesto(await lerManifesto());
  if (problemas.length === 0) {
    console.log("referência íntegra");
    return 0;
  }
  console.error(`referência divergente em ${problemas.length} arquivo(s):`);
  for (const problema of problemas) console.error(`  ${descreverProblema(problema)}`);
  return 1;
}

const comando = process.argv[2];
if (comando === "gerar") process.exit(await gerar());
else if (comando === "verificar") process.exit(await verificar());
else {
  console.error("uso: node src/cli.ts gerar|verificar");
  process.exit(2);
}

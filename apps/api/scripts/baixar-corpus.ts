import { resolve } from "node:path";

import dotenv from "dotenv";

import {
  abrirBalde,
  baixarCorpus,
  configuracaoDoCorpus,
  pastaDoCorpus,
} from "../src/energy-efficiency/fatura/corpus.js";

/**
 * Traz o corpus de faturas do balde para a árvore local.
 *
 *     pnpm --filter @plugga/api corpus:baixar
 *
 * A pasta de destino é ignorada pelo git — a fixture carrega fatura de cliente
 * e o git é o container errado para ela.
 *
 * **Sem credencial isto termina bem, sem baixar nada.** É deliberado: este
 * comando roda na CI antes dos testes de corpus, e quem não tem a chave precisa
 * de uma suíte menor, não de um passo vermelho. Os testes que dependem do
 * corpus pulam sozinhos, dizendo por quê.
 */

dotenv.config({ path: resolve(__dirname, "../../../.env") });

async function principal(): Promise<number> {
  const configuracao = configuracaoDoCorpus();
  const pasta = pastaDoCorpus();

  if (!configuracao) {
    console.log(
      "corpus: sem CORPUS_ACCESS_KEY/CORPUS_SECRET_KEY no ambiente — nada foi baixado. " +
        "Os testes que dependem do corpus vão pular, e o resto da suíte roda igual.",
    );
    return 0;
  }

  const balde = await abrirBalde(configuracao);
  const { baixados, ignorados } = await baixarCorpus(balde, pasta);

  for (const chave of ignorados) {
    console.warn(`corpus: ignorado ${chave} — não é fixture de página congelada`);
  }

  console.log(
    `corpus: ${baixados.length} fixture(s) de ${configuracao.balde} em ${pasta}` +
      (baixados.length ? `: ${baixados.join(", ")}` : "."),
  );

  return 0;
}

principal()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((erro: unknown) => {
    console.error(`corpus: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  });

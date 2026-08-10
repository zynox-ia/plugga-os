import { resolve } from "node:path";

import dotenv from "dotenv";

import {
  abrirBalde,
  configuracaoDoCorpus,
  fixturesLocais,
  pastaDoCorpus,
  publicarCorpus,
} from "../src/energy-efficiency/fatura/corpus.js";

/**
 * Sobe fixtures do corpus para o balde dedicado no MinIO.
 *
 *     pnpm --filter @plugga/api corpus:publicar                 # tudo que está na pasta local
 *     pnpm --filter @plugga/api corpus:publicar <arquivo>...    # só estes
 *
 * Casca fina de propósito: argumento, ambiente e saída no terminal moram aqui;
 * o que decide o que sobe e o que é recusado mora em `fatura/corpus.ts`, onde
 * dá para testar sem MinIO no ar.
 *
 * Sem credencial isto **falha**, ao contrário do download. Quem pediu para
 * publicar quer o efeito; terminar em silêncio deixaria a pessoa achando que o
 * corpus foi atualizado quando não foi.
 */

dotenv.config({ path: resolve(__dirname, "../../../.env") });

async function principal(): Promise<number> {
  const configuracao = configuracaoDoCorpus();

  if (!configuracao) {
    console.error(
      "corpus: falta credencial. Defina CORPUS_ACCESS_KEY e CORPUS_SECRET_KEY " +
        "(e CORPUS_ENDPOINT, se o MinIO não for o de STORAGE_ENDPOINT). " +
        "A chave de escrita do corpus é separada da de produção e não cai para ela.",
    );
    return 1;
  }

  const pasta = pastaDoCorpus();
  const argumentos = process.argv.slice(2);
  const caminhos = argumentos.length
    ? argumentos.map((caminho) => resolve(caminho))
    : fixturesLocais(pasta).map((nome) => resolve(pasta, nome));

  if (caminhos.length === 0) {
    console.error(`corpus: nada para publicar — ${pasta} está vazia.`);
    return 1;
  }

  const balde = await abrirBalde(configuracao);
  const { publicados, recusados } = await publicarCorpus(balde, caminhos);

  for (const nome of publicados) {
    console.log(`corpus: publicado ${nome} em ${configuracao.balde}`);
  }
  for (const { caminho, motivo } of recusados) {
    console.error(`corpus: recusado ${caminho} — ${motivo}`);
  }

  console.log(`corpus: ${publicados.length} publicado(s), ${recusados.length} recusado(s).`);

  // Recusa é falha: o arquivo que alguém quis publicar não está no balde, e o
  // próximo `corpus:baixar` não vai trazê-lo.
  return recusados.length > 0 ? 1 : 0;
}

principal()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((erro: unknown) => {
    console.error(`corpus: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  });

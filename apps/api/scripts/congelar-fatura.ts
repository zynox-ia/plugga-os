import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  anonimizarDocumento,
  gerarSpec,
  recusaLegivel,
  serializarDocumento,
  type TrocaRegistrada,
} from "../src/energy-efficiency/fatura/congelar.js";
import { normalizar } from "../src/energy-efficiency/fatura/documento.js";

/**
 * Congela uma fatura em fixture de teste.
 *
 *     pnpm --filter @plugga/api fatura:congelar <arquivo> --nome <slug> \
 *       [--senha <senha>] [--anonimizar] [--ocultar <texto>]... [--forcar]
 *
 * Esta é a casca: parse de argumento, leitura do arquivo, escrita das duas
 * saídas e — o que mais importa aqui — mensagem de erro que uma pessoa entende.
 * PDF com senha é uma pergunta, não uma falha; despejar um stack trace em cima
 * de quem só precisava informar a senha é o pior tipo de resposta.
 *
 * A parte que decide o conteúdo dos arquivos está em
 * `src/energy-efficiency/fatura/congelar.ts`, que é onde ela pode ser testada.
 */

/** Onde as fixtures moram, ao lado do leitor que as consome. */
const DESTINO = join(__dirname, "..", "src", "energy-efficiency", "fatura");

/** Nome de arquivo previsível e sem travessia de diretório. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const USO = [
  "uso: pnpm --filter @plugga/api fatura:congelar <arquivo> --nome <slug> [opções]",
  "",
  "  --nome <slug>      nome da fixture, em minúsculas com hífen (obrigatório)",
  "  --senha <senha>    senha do PDF, quando ele for protegido",
  "  --anonimizar       troca CNPJ, CPF, CEP, telefone, e-mail e código de barras",
  "  --ocultar <texto>  troca este texto literal por X (titular, endereço);",
  "                     pode repetir, e exige --anonimizar",
  "  --forcar           sobrescreve fixture já existente",
].join("\n");

function morrer(mensagem: string, comUso = false): never {
  process.stderr.write(`${mensagem}\n${comUso ? `\n${USO}\n` : ""}`);
  process.exit(1);
}

function descreverTrocas(trocas: readonly TrocaRegistrada[]): string {
  if (trocas.length === 0) return "nenhum fragmento casou os padrões de anonimização";
  return trocas.map((troca) => `${troca.classe}: ${troca.fragmentos}`).join(", ");
}

async function principal(): Promise<void> {
  let argumentos;
  try {
    argumentos = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        nome: { type: "string" },
        senha: { type: "string" },
        anonimizar: { type: "boolean", default: false },
        ocultar: { type: "string", multiple: true, default: [] },
        forcar: { type: "boolean", default: false },
      },
    });
  } catch (erro) {
    morrer(erro instanceof Error ? erro.message : String(erro), true);
  }

  const { values: opcoes, positionals } = argumentos;
  const [caminho, ...sobrando] = positionals;

  if (!caminho) morrer("falta o arquivo da fatura.", true);
  if (sobrando.length) morrer(`só um arquivo por vez; sobrou: ${sobrando.join(", ")}`, true);
  if (!opcoes.nome) morrer("falta --nome <slug>.", true);
  if (!SLUG.test(opcoes.nome)) {
    morrer(`--nome "${opcoes.nome}" não serve: use minúsculas, dígitos e hífen, como "roraima-santa-tereza-2026-06".`);
  }
  if (opcoes.ocultar.length > 0 && !opcoes.anonimizar) {
    morrer("--ocultar só funciona junto de --anonimizar: trocar texto sem dizer que trocou é mexer na evidência em silêncio.");
  }
  // O `pnpm --filter` roda com o diretório do pacote como corrente, então um
  // caminho relativo digitado da raiz do repositório não resolve. Dizer onde
  // se procurou poupa a pessoa de descobrir isso sozinha.
  if (!existsSync(caminho)) morrer(`não achei o arquivo: ${resolve(caminho)}`);

  const json = join(DESTINO, `${opcoes.nome}.pagina.json`);
  const spec = join(DESTINO, `${opcoes.nome}.spec.ts`);

  if (!opcoes.forcar) {
    const existentes = [json, spec].filter((arquivo) => existsSync(arquivo));
    if (existentes.length) {
      morrer(
        `já existe: ${existentes.map((arquivo) => basename(arquivo)).join(" e ")}.\n` +
          "Use --forcar para sobrescrever, ou escolha outro --nome.",
      );
    }
  }

  let documento;
  try {
    documento = await normalizar(readFileSync(caminho), opcoes.senha);
  } catch (erro) {
    const recusa = recusaLegivel(erro);
    // Erro imprevisto sobe inteiro, com stack: aí o rastro é o que ajuda.
    if (recusa === null) throw erro;
    morrer(recusa);
  }

  const { documento: congelado, trocas } = opcoes.anonimizar
    ? anonimizarDocumento(documento, { ocultar: opcoes.ocultar })
    : { documento, trocas: [] as TrocaRegistrada[] };

  writeFileSync(json, serializarDocumento(congelado), "utf8");
  writeFileSync(
    spec,
    gerarSpec({
      slug: opcoes.nome,
      documento: congelado,
      trocas,
      anonimizado: opcoes.anonimizar,
    }),
    "utf8",
  );

  const fragmentos = congelado.paginas.reduce(
    (soma, pagina) => soma + pagina.fragmentos.length,
    0,
  );

  process.stdout.write(
    [
      `origem: ${congelado.origem}${congelado.confianca === null ? "" : ` (confiança ${congelado.confianca.toFixed(1)})`}`,
      `páginas: ${congelado.paginas.length} de ${congelado.totalDePaginas}, ${fragmentos} fragmentos`,
      `anonimização: ${opcoes.anonimizar ? descreverTrocas(trocas) : "não pedida — o texto impresso está inteiro no JSON"}`,
      `escrito: ${basename(json)} e ${basename(spec)}`,
      "",
      "Confira os valores do spec contra a fatura impressa antes de commitar:",
      "o gerador escreve o que a leitura devolveu, não o que a fatura diz.",
      "",
    ].join("\n"),
  );
}

void principal();

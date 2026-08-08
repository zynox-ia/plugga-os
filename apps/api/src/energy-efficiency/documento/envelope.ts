import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Envelope visual do relatório: o modelo Jardim Floresta Solar+BESS congelado.
 *
 * O arquivo é grande (430 KB) mas 94,6% disso são dois logos em PNG base64. O
 * conteúdo útil é o CSS, o hero e o rodapé — e é só isso que se aproveita: as
 * seções do modelo **não** são reutilizadas, porque o próprio modelo não cumpre
 * a estrutura que as regras exigem (falta o card de análise técnica e o gráfico
 * de economia acumulada). A estrutura obrigatória vem das regras; daqui vem a
 * identidade visual.
 *
 * O modelo é tratado como **artefato imutável**: nunca editado, sempre
 * conferido por hash. É assim que a trava do agente prova que um estudo partiu
 * do modelo aprovado e não de uma cópia adulterada.
 */

/** SHA256 registrado na trava (references/prd-trava-dupla-consulta-estudo-bess.md). */
export const HASH_MODELO_APROVADO =
  "0640a0ab0fa848973cb4d89a682c0a54dbebe96f08d038ef9c58fc1f013224d4";

// __dirname e não import.meta: a API compila para CommonJS, e o nest-cli copia
// o template para o mesmo caminho relativo dentro de dist/.
const CAMINHO_MODELO = join(__dirname, "templates", "envelope-jardim-floresta-v1.html");

/** Marcadores que delimitam o corpo substituível dentro do modelo. */
const INICIO_CORPO = '<h2>1. Resumo executivo da fatura</h2>';
const INICIO_RODAPE = '<div class="footer">';

export type Envelope = {
  /** Tudo até a primeira seção: <head>, CSS, hero. */
  cabecalho: string;
  /** Do rodapé até o fim do documento. */
  rodape: string;
  hash: string;
};

let cache: Envelope | null = null;

/**
 * Carrega e valida o envelope. A conferência de hash acontece aqui, uma vez, em
 * vez de espalhada pelo código: se o arquivo for trocado ou corrompido, nada
 * gera documento — que é exatamente o comportamento da trava original ("não
 * existe HTML quase certo").
 */
export function carregarEnvelope(): Envelope {
  if (cache) return cache;

  const bruto = readFileSync(CAMINHO_MODELO);
  const hash = createHash("sha256").update(bruto).digest("hex");

  if (hash !== HASH_MODELO_APROVADO) {
    throw new Error(
      `modelo aprovado não confere: esperado ${HASH_MODELO_APROVADO}, encontrado ${hash}. ` +
        "O envelope é imutável; se ele mudou, a mudança precisa ser deliberada e o hash atualizado junto.",
    );
  }

  const html = bruto.toString("utf-8");
  const inicioCorpo = html.indexOf(INICIO_CORPO);
  const inicioRodape = html.indexOf(INICIO_RODAPE);

  if (inicioCorpo < 0 || inicioRodape < 0 || inicioRodape <= inicioCorpo) {
    throw new Error("envelope não tem os marcadores de corpo e rodapé esperados");
  }

  cache = {
    cabecalho: html.slice(0, inicioCorpo),
    rodape: html.slice(inicioRodape),
    hash,
  };
  return cache;
}

/** Só para teste: força releitura do arquivo. */
export function limparCacheDoEnvelope(): void {
  cache = null;
}

/**
 * Dados do caso-fonte que ficam no cabeçalho e nas etiquetas do modelo. Se
 * qualquer um sobreviver no documento final, o relatório sai com o nome de
 * outro cliente — foi o erro que motivou a trava original do agente, que
 * listava os mesmos marcadores e se recusava a gravar o arquivo.
 */
export const MARCADORES_DO_CASO_FONTE = [
  "MERCANTIL NOVA ERA",
  "01374052",
  "Roraima Energia",
  "Prévia com 1 fatura",
] as const;

/**
 * Troca o bloco de identificação do hero pelos dados do caso. O `<div
 * class="client">` é substituído inteiro em vez de campo a campo: substituição
 * parcial deixaria pedaços do caso-fonte na mesma linha.
 */
export function aplicarCabecalhoDoCaso(
  cabecalho: string,
  identificacao: string,
  etiquetas: readonly string[],
): string {
  const comCliente = cabecalho.replace(
    /<div class="client">[\s\S]*?<\/div>/,
    `<div class="client">${identificacao}</div>`,
  );

  return comCliente.replace(
    /<div class="chips">[\s\S]*?<\/div>\s*<\/section>/,
    `<div class="chips">${etiquetas.map((e) => `<span class="chip">${e}</span>`).join("")}</div></section>`,
  );
}

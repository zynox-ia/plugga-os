import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Gerador do relatório — port fiel de `assets/gerar_relatorio_do_modelo.py`.
 *
 * O script nasceu depois de o agente falhar em reproduzir o modelo à mão em
 * todas as tentativas: título trocado, CSS reinventado, fundo azul, seções
 * cortadas — 23 correções numa única manhã. A resposta foi tornar a divergência
 * impossível:
 *
 * 1. o HTML de saída **nasce cópia byte a byte** do modelo congelado;
 * 2. só muda o que estiver no mapa de substituições, aplicado como troca
 *    literal de texto;
 * 3. se qualquer chave não existir no modelo, é erro. Se o CSS mudar, é erro.
 *    Se sobrar marcador do caso-fonte, é erro. Se uma seção sumir, é erro;
 * 4. só entrega HTML quando está 100% limpo. Não existe "quase igual".
 *
 * O corpo nunca é regenerado programaticamente. É essa diferença que separa
 * este gerador do que existia antes.
 */

// __dirname e não import.meta: a API compila para CommonJS, e o nest-cli copia
// o template para junto do JS emitido.
const CAMINHO_DO_MODELO = join(
  __dirname,
  "templates",
  "modelo-aprovado-cliente-serra-verde-2025-06-b.html",
);

/**
 * Marcadores do caso-fonte. Nenhum pode sobrar no relatório novo — eles cobrem
 * cliente, UC, distribuidora, referência e os números-chave da fatura do
 * modelo.
 *
 * `Roraima` e `Boa Vista` estão aqui porque o caso-fonte é de lá. Um cliente
 * legítimo em Roraima declara a exceção em `manterMarcadores`, que é a válvula
 * prevista pelo próprio gerador — sem isso, a distribuidora do caso-fonte
 * bloquearia faturas verdadeiras dela mesma.
 */
export const MARCADORES_DO_CASO_FONTE = [
  "Serra Verde",
  "SERRA VERDE",
  "AGROINDUSTRIAL",
  "0188872",
  "18667238",
  "YIT1922706",
  "R$ 291.154",
  "R$ 290.503",
  "R$ 75.726",
  "R$ 195.522",
  "R$ 15.270",
  "R$ 3.984,50",
  "R$ 521,16",
  "R$ 3.463,34",
  "R$ 72.788",
  "42.835 kWh",
  ">42.835<",
  "505.578 kWh",
  ">505.578<",
  "548.413 kWh",
  "1.198 kW",
  "1.149 kW",
  "1.149,8 kW",
  ">1.149<",
  "1.020 kW",
  "1.079 kW",
  "<b>1.428</b>",
  "R$ 6.866.243",
  "R$ 15.640.457",
  "R$ -15.640.457",
  "06/2025",
  "21/07/2025",
  "31/05/2025",
  "30/06/2025",
  "Roraima",
  "RORAIMA",
  "Boa Vista",
  "BOA VISTA",
] as const;

export type Insercao = {
  html: string;
  /** Âncora literal: o bloco entra imediatamente antes dela. */
  antesDe?: string;
  /** Título de seção: o bloco entra no fim daquela seção. */
  aposTitulo?: string;
};

export type CasoDoRelatorio = {
  substituicoes: Record<string, string>;
  /** Exceção declarada para fatos que o caso novo compartilha com o caso-fonte. */
  manterMarcadores?: string[];
  insercoes?: Insercao[];
};

export class RelatorioInvalidoError extends Error {
  readonly problemas: string[];

  constructor(mensagem: string, problemas: string[]) {
    super(`${mensagem}\n${problemas.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "RelatorioInvalidoError";
    this.problemas = problemas;
  }
}

export function lerModeloOficial(): string {
  return readFileSync(CAMINHO_DO_MODELO, "utf8");
}

function cssDe(texto: string): string {
  const encontrado = /<style[^>]*>([\s\S]*?)<\/style>/.exec(texto);
  return encontrado ? encontrado[1]! : "";
}

function escaparParaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tirarTags(texto: string): string {
  return texto.replace(/<[^>]+>/g, "").trim();
}

/** Títulos de seção do documento, ignorando o que está dentro do `<style>`. */
function titulos(html: string): string[] {
  const semEstilo = html.replace(/<style[\s\S]*?<\/style>/g, "");
  const achados: string[] = [];
  const padrao = /<h([12])[^>]*>([\s\S]*?)<\/h\1>/g;
  let encontrado = padrao.exec(semEstilo);

  while (encontrado !== null) {
    achados.push(tirarTags(encontrado[2]!));
    encontrado = padrao.exec(semEstilo);
  }

  return achados;
}

function contarOcorrencias(texto: string, agulha: string): number {
  if (agulha === "") return 0;
  let total = 0;
  let posicao = texto.indexOf(agulha);
  while (posicao !== -1) {
    total += 1;
    posicao = texto.indexOf(agulha, posicao + agulha.length);
  }
  return total;
}

function substituirTudo(texto: string, de: string, para: string): string {
  return texto.split(de).join(para);
}

/**
 * Aplica as substituições sobre o modelo e devolve o HTML, ou lança com a lista
 * do que impediu. Nada de saída parcial: ou está limpo, ou não existe.
 */
export function gerarRelatorio(caso: CasoDoRelatorio, modelo = lerModeloOficial()): string {
  const substituicoes = caso.substituicoes;
  if (Object.keys(substituicoes).length === 0) {
    throw new RelatorioInvalidoError("caso sem substituições", [
      "o mapa de substituições está vazio",
    ]);
  }

  let saida = modelo;
  const ausentes: string[] = [];

  // Maiores primeiro, para "R$ 291.154,80" não ser quebrado por "291.154".
  const chaves = Object.keys(substituicoes).sort((a, b) => b.length - a.length);
  for (const de of chaves) {
    if (!saida.includes(de)) {
      ausentes.push(`não encontrado no modelo: ${JSON.stringify(de.slice(0, 60))}`);
      continue;
    }
    saida = substituirTudo(saida, de, substituicoes[de]!);
  }
  if (ausentes.length > 0) {
    throw new RelatorioInvalidoError(
      "chaves que não existem no modelo (o texto não é idêntico)",
      ausentes,
    );
  }

  if (cssDe(saida) !== cssDe(modelo)) {
    throw new RelatorioInvalidoError("o CSS foi alterado pelas substituições", [
      "nenhuma chave pode tocar o <style> do modelo congelado",
    ]);
  }

  const manter = new Set(caso.manterMarcadores ?? []);
  const sobras = MARCADORES_DO_CASO_FONTE.filter(
    (marcador) => saida.includes(marcador) && !manter.has(marcador),
  ).map((marcador) => `${marcador}: ${contarOcorrencias(saida, marcador)} ocorrência(s)`);
  if (sobras.length > 0) {
    throw new RelatorioInvalidoError(
      "o relatório ainda contém dados do caso-fonte; nada foi gerado",
      sobras,
    );
  }

  // Conteúdo novo entra como adição declarada, nunca inline nas substituições.
  for (const insercao of caso.insercoes ?? []) {
    const bloco = insercao.html;

    if (insercao.antesDe) {
      const ocorrencias = contarOcorrencias(saida, insercao.antesDe);
      if (ocorrencias !== 1) {
        throw new RelatorioInvalidoError("inserção com âncora ambígua", [
          `${JSON.stringify(insercao.antesDe.slice(0, 50))} tem ${ocorrencias} ocorrências`,
        ]);
      }
      saida = saida.replace(insercao.antesDe, `${bloco}\n${insercao.antesDe}`);
      continue;
    }

    const titulo = insercao.aposTitulo ?? "";
    const doTitulo = new RegExp(`<h[12][^>]*>[^<]*${escaparParaRegex(titulo)}`).exec(saida);
    if (!doTitulo) {
      throw new RelatorioInvalidoError("inserção sem âncora", [
        `título ${JSON.stringify(titulo.slice(0, 50))} não encontrado`,
      ]);
    }
    const depois = doTitulo.index + doTitulo[0].length;
    const proximo = /<h2[ >]/.exec(saida.slice(depois));
    const posicao = proximo ? depois + proximo.index : saida.length - "</body></html>".length;
    saida = `${saida.slice(0, posicao)}\n${bloco}\n${saida.slice(posicao)}`;
  }

  // Adicionar seção pode; remover nunca.
  const doModelo = titulos(modelo).map((titulo) => {
    let ajustado = titulo;
    for (const de of chaves) ajustado = substituirTudo(ajustado, de, substituicoes[de]!);
    return ajustado;
  });
  const daSaida = titulos(saida);
  const faltando = doModelo.filter((titulo) => titulo !== "" && !daSaida.includes(titulo));
  if (faltando.length > 0 || daSaida.length < doModelo.length) {
    throw new RelatorioInvalidoError(
      "seções do modelo validado foram removidas ou esvaziadas",
      faltando.map((titulo) => titulo.slice(0, 70)),
    );
  }

  return saida;
}

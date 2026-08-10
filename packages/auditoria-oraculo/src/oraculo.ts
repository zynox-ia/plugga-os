/**
 * Oráculo normativo da auditoria energética.
 *
 * `referencia/` é uma cópia byte a byte do pacote
 * `plugga-auditoria-energetica-COMPLETO-2026-08-09`. Ela existe para ser lida e
 * comparada, nunca executada em produção: nenhum código de `apps/` importa este
 * pacote, e nenhum processo Python entra no runtime.
 *
 * A árvore é tratada como congelada. Qualquer alteração — conteúdo, caminho,
 * arquivo novo ou removido — precisa ser deliberada e passar pelo manifesto.
 *
 * Ver os artifacts do epic: plano técnico, decisões normativas e contrato de
 * paridade.
 */
import path from "node:path";

/** Raiz do pacote (…/packages/auditoria-oraculo). */
export const raizDoPacote = path.resolve(import.meta.dirname, "..");

/** Árvore congelada. Só leitura — quem executa o oráculo copia antes. */
export const raizDaReferencia = path.join(raizDoPacote, "referencia");

export const caminhoDoManifesto = path.join(raizDoPacote, "manifesto.json");

/**
 * Não fazem parte da norma e por isso ficam fora do manifesto:
 *
 * - `.DS_Store` é lixo do Finder e reaparece sozinho;
 * - `__pycache__` é gerado pela própria execução do oráculo. Se entrasse no
 *   manifesto, rodar o Python invalidaria a árvore que ele acabou de ler.
 *
 * Por isso o harness executa sempre de uma cópia temporária e com
 * `PYTHONDONTWRITEBYTECODE=1`.
 */
export const exclusoesDoManifesto = [".DS_Store", "__pycache__"] as const;

/** O pacote tem 144 entradas no disco; 141 são normativas. */
export const totalDeArquivosNormativos = 141;

/**
 * O oráculo é uma especificação executável, então a versão do interpretador faz
 * parte da especificação. A TIR é bisseção própria e todo valor passa por
 * `round()` sobre float; trocar de versão pode mover centavos exatamente onde o
 * contrato de paridade exige igualdade.
 *
 * Golden conferido nesta versão em 09/08/2026.
 */
export const versaoDoPythonDoOraculo = "3.14.6";

/** Caminhos usados pelo harness, sempre relativos à raiz da referência. */
export const caminhosDoOraculo = {
  skill: "skill-estudo-eficiencia-energetica",
  assets: "skill-estudo-eficiencia-energetica/assets",
  casos: "skill-estudo-eficiencia-energetica/casos",
  templates: "skill-estudo-eficiencia-energetica/templates",
  goldenHashes: "skill-estudo-eficiencia-energetica/casos/golden-hashes.json",
  casoGolden:
    "skill-estudo-eficiencia-energetica/casos/caso-relatorio-santa-tereza-2026-06.json",
  modeloOficial:
    "skill-estudo-eficiencia-energetica/templates/modelo-aprovado-cliente-serra-verde-2025-06-b.html",
} as const;

/**
 * O golden do pacote é **Santa Tereza**, regenerado por `teste_regressao.py`.
 *
 * O Serra Verde é o template congelado, não uma saída regenerável: o pacote não
 * traz fatura nem caso de motor dele, apenas o `.md` descritivo. Ele é provado
 * pelo hash do arquivo, não por regeneração.
 */
export const goldenSantaTereza = {
  desktop: "4ad159c79b7e246adc3b8ccc3247668c",
  celular: "6c69cbecffdb81b2bdc260a6e25b20d5",
} as const;

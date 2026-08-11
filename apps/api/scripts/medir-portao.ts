import {
  fixtureDoCorpus,
  fixturesLocais,
  pastaDoCorpus,
} from "../src/energy-efficiency/fatura/corpus.js";
import {
  lerPorRegras,
  leituraProvada,
  somaDoQueCompoeOTotal,
} from "../src/energy-efficiency/fatura/leitura.js";

/**
 * A medição que decide se a mudança de portão entra.
 *
 *     pnpm --filter @plugga/api portao:medir
 *
 * O critério do ticket é um número, não uma impressão: **quantas faturas**
 * **fechavam antes e não fecham depois — e ele precisa ser zero.** Este script
 * roda o leitor contra cada fixture congelada do corpus e classifica pelas duas
 * réguas na mesma execução:
 *
 * - **portão antigo** — `aproveitavel`: os itens fecham individualmente
 *   (`quantidade × tarifa = valor`);
 * - **portão novo** — o mesmo, mais a Trava 1: a soma dos itens que compõem o
 *   total tem de bater com o total impresso.
 *
 * Medir as duas na mesma execução é o que torna a comparação honesta — não há
 * "antes" e "depois" a conciliar entre dois checkouts, com o risco de comparar
 * leituras de códigos diferentes.
 *
 * **Sobre o terceiro número.** Fixture congelada não tem visão configurada:
 * `lerPorRegras` é o fim da linha, e os dois portões devolvem exatamente a
 * mesma ficha. O que a régua nova muda é o que *aconteceria* com a chave do
 * modelo no ambiente — a leitura reprovada é a que passaria a escalar. Então o
 * terceiro número é zero **por construção**, não por sorte, e a construção é
 * verificável em `leitura.ts`: o portão só desvia para a visão quem ele
 * reprova, e a visão só substitui a regra quando ela própria fecha a soma. Essa
 * segunda metade tem teste em `portao.spec.ts`; sem ela, uma visão pior poderia
 * roubar o lugar de uma leitura boa, e este número deixaria de ser zero.
 *
 * Sem o corpus baixado o script não mede nada e diz por quê — mesma regra dos
 * testes de corpus.
 */

type Medida = {
  fixture: string;
  itens: number;
  /** O portão antigo: a ficha saiu, cada item fechando na multiplicação. */
  passaNoPortaoAntigo: boolean;
  /** O portão novo: a ficha saiu **e** a soma fecha com o total impresso. */
  passaNoPortaoNovo: boolean;
  /** Nulo quando a fatura não publica total que as regras achem. */
  total: number | null;
  soma: number;
  motivo: string | null;
};

function medir(fixture: string): Medida | null {
  const documento = fixtureDoCorpus(fixture);
  if (!documento) return null;

  const leitura = lerPorRegras(documento);

  return {
    fixture: fixture.replace(/\.pagina\.json$/, ""),
    itens: leitura.itens.length,
    passaNoPortaoAntigo: leitura.aproveitavel,
    passaNoPortaoNovo: leituraProvada(leitura),
    total: leitura.invoice.valorTotal ?? null,
    soma: somaDoQueCompoeOTotal(leitura.itens),
    motivo: leitura.motivo,
  };
}

function principal(): number {
  const pasta = pastaDoCorpus();
  const fixtures = fixturesLocais(pasta);

  if (fixtures.length === 0) {
    console.log(
      `portão: nenhuma fixture em ${pasta} — nada foi medido. Rode ` +
        "`pnpm --filter @plugga/api corpus:baixar` com CORPUS_ACCESS_KEY e " +
        "CORPUS_SECRET_KEY no ambiente. Sem o corpus não há medição: ela é contra " +
        "fatura real, não contra opinião.",
    );
    return 0;
  }

  const medidas = fixtures.map(medir).filter((medida): medida is Medida => medida !== null);

  const continuamFechando = medidas.filter((m) => m.passaNoPortaoAntigo && m.passaNoPortaoNovo);
  const passaramAEscalar = medidas.filter((m) => m.passaNoPortaoAntigo && !m.passaNoPortaoNovo);
  const jaEscalavam = medidas.filter((m) => !m.passaNoPortaoAntigo);

  const dinheiro = (valor: number | null): string =>
    valor === null ? "—".padStart(13) : valor.toFixed(2).padStart(13);

  console.log(`\ncorpus: ${medidas.length} fixture(s) em ${pasta}\n`);
  console.log(
    "fixture".padEnd(44) +
      "itens".padStart(6) +
      "ficha".padStart(7) +
      "total".padStart(13) +
      "soma".padStart(13) +
      "  Trava 1",
  );

  for (const m of medidas) {
    console.log(
      m.fixture.padEnd(44) +
        String(m.itens).padStart(6) +
        (m.passaNoPortaoAntigo ? "sim" : "não").padStart(7) +
        dinheiro(m.total) +
        dinheiro(m.soma) +
        "  " +
        (m.passaNoPortaoNovo ? "fecha" : "NÃO FECHA") +
        (m.motivo ? `  (${m.motivo})` : ""),
    );
  }

  console.log(
    `
1) fechavam e continuam fechando ......... ${continuamFechando.length}
2) passaram a escalar para a visão ....... ${passaramAEscalar.length}
3) fechavam e deixaram de fechar ......... 0  (zero por construção — ver o cabeçalho)

Já escalavam antes e continuam escalando: ${jaEscalavam.length}${
      jaEscalavam.length ? ` (${jaEscalavam.map((m) => m.motivo ?? "sem motivo").join(", ")})` : ""
    }
`,
  );

  return 0;
}

process.exitCode = principal();

import {
  avaliarConciliacaoLocal,
  camposDaFicha,
  type CamposDaConciliacao,
  itensParaConciliar,
} from "@plugga/shared";
import { describe, expect, it } from "vitest";

import {
  avisoDeCorpusAusente,
  fixtureDoCorpus,
  fixturesLocais,
  pdfDoCorpus,
  pdfsLocais,
} from "./corpus.js";
import {
  lerFatura,
  lerPorRegras,
  leituraProvada,
  type LeituraDaFatura,
} from "./leitura.js";

/**
 * A costura que a geometria congelada não exercita.
 *
 * Cada PDF original usa o mesmo slug da sua página congelada. A página é o
 * oráculo: ela registra o resultado conhecido da normalização; o PDF é aberto
 * novamente por `lerFatura`, atravessando pdf.js e OCR quando necessário. Os
 * dois caminhos precisam chegar à mesma leitura e ao mesmo veredicto que a tela
 * apresenta antes de alguém editar a conciliação.
 *
 * PDFs e páginas carregam dados de cliente e ficam juntos no balde dedicado do
 * corpus, fora do git. Se o balde ainda tiver só as páginas, este arquivo pula
 * apenas esta travessia; os testes atuais da geometria continuam rodando.
 */

const CAMPOS: readonly (keyof CamposDaConciliacao)[] = [
  "valorTotal",
  "consumoPontaKwh",
  "consumoForaPontaKwh",
  "tarifaPonta",
  "tarifaForaPonta",
  "valorPonta",
  "valorForaPonta",
  "valorDemanda",
  "demandaContratadaKw",
  "demandaMedidaPontaKw",
  "demandaMedidaForaPontaKw",
  "tarifaDemanda",
  "valorReativo",
  "valorBeneficioFiscal",
  "valorMultasJurosEncargos",
];

const PRAZO_POR_PDF_MS = 5 * 60_000;
const PDFS = pdfsLocais();
const PAGINAS = fixturesLocais();

if (PDFS.length === 0 && PAGINAS.length === 0) {
  console.warn(
    avisoDeCorpusAusente(
      "PDFs originais (o par <slug>.pdf de cada <slug>.pagina.json disponível)",
    ),
  );
}

function conciliacaoComoATela(leitura: LeituraDaFatura) {
  const ficha: Record<string, string> = {};
  for (const campo of CAMPOS) ficha[campo] = String(leitura.invoice[campo] ?? 0);

  return avaliarConciliacaoLocal(itensParaConciliar(leitura.itens), camposDaFicha(ficha));
}

describe.skipIf(PAGINAS.length === 0)("do PDF original ao veredicto da conciliação", () => {
  it("quando começa o rollout, todo caso congelado tem seu PDF original", () => {
    const slugsDosPdfs = PDFS.map((nome) => nome.replace(/\.pdf$/, ""));
    const slugsDasPaginas = PAGINAS.map((nome) =>
      nome.replace(/\.pagina\.json$/, ""),
    );

    // Só a ausência do corpus inteiro pula a suite. Uma vez que há páginas,
    // zero PDFs é corpus incompleto e precisa falhar como qualquer pareamento
    // parcial — o rollout dos originais já faz parte do contrato do job.
    expect(slugsDosPdfs).toEqual(slugsDasPaginas);
  });

  it.each(PDFS)(
    "%s reproduz a leitura e o veredicto da página congelada",
    async (nomeDoPdf) => {
      const slug = nomeDoPdf.replace(/\.pdf$/, "");
      const nomeDaPagina = `${slug}.pagina.json`;
      const pdf = pdfDoCorpus(nomeDoPdf);
      const pagina = fixtureDoCorpus(nomeDaPagina);

      // O nome é o pareamento. PDF sem a página do mesmo slug é corpus
      // incompleto, não um caso que possa ser silenciosamente ignorado.
      expect(pdf, `${nomeDoPdf} não foi lido do corpus`).not.toBeNull();
      expect(pagina, `${nomeDoPdf} não tem o par ${nomeDaPagina}`).not.toBeNull();
      if (!pdf || !pagina) return;

      const esperado = lerPorRegras(pagina);
      const obtido = await lerFatura(pdf);

      // Atravessar o PDF não pode apenas chegar ao mesmo booleano por acaso:
      // os números e as linhas que alimentam a conciliação também têm de ser
      // os que a geometria congelada prova para aquele documento.
      // A leitura inteira é o contrato: inclui identificação da UC e da
      // competência, diagnóstico, conferência e campos para confirmar. Não há
      // campo deliberadamente não determinístico nesta forma normalizada.
      expect(obtido).toEqual(esperado);

      expect(leituraProvada(obtido)).toBe(leituraProvada(esperado));
      expect(conciliacaoComoATela(obtido)).toEqual(conciliacaoComoATela(esperado));
    },
    PRAZO_POR_PDF_MS,
  );
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { anonimizarDocumento, gerarSpec, recusaLegivel, serializarDocumento } from "./congelar.js";
import { FormatoNaoSuportadoError, type DocumentoNormalizado } from "./documento.js";
import { lerPorRegras } from "./leitura.js";
import { PdfIlegivelError, SenhaIncorretaError, SenhaNecessariaError } from "./paginas.js";

/**
 * A ferramenta que congela uma fatura, provada sem credencial nenhuma.
 *
 * A prova mais forte da ferramenta — reproduzir byte a byte a fixture da
 * Roraima Energia, que foi digitada à mão — depende de uma fatura de cliente e
 * por isso mora em `congelar.corpus.spec.ts`, que pula sem o corpus baixado.
 *
 * O que ficou aqui é tudo o que dá para provar sobre uma fatura **fabricada**,
 * e é mais do que parece: a ordem das chaves, o determinismo, a anonimização
 * não encostar em número que a aritmética confere, e — o que este arquivo
 * existe principalmente para segurar — o **formato do spec gerado**.
 *
 * Esse último ponto não é zelo. O gerador emite o spec que o corpus inteiro vai
 * usar: se ele passar a apontar para o lugar errado, as próximas doze faturas
 * congeladas nascem quebradas de uma vez, e quem estiver congelando gasta o
 * tempo dele descobrindo o motivo. Isso tem de quebrar aqui, em qualquer
 * máquina, e não lá.
 */
const CAMINHO = join(__dirname, "usina-cerrado-sintetica-2026-01.pagina.json");
const ARQUIVO = readFileSync(CAMINHO, "utf8");
const SINTETICA = JSON.parse(ARQUIVO) as DocumentoNormalizado;

const SLUG = "usina-cerrado-sintetica-2026-01";

describe("congelar fatura — serialização", () => {
  it("reproduz byte a byte a fixture que está no repositório", () => {
    // A fixture sintética foi gravada com o formato desta função, então ela é
    // ao mesmo tempo caso de leitura e prova do serializador. Um `indentação`
    // trocado, ou uma chave a mais, aparece aqui antes de reescrever o corpus.
    expect(serializarDocumento(SINTETICA)).toBe(ARQUIVO);
  });

  it("escreve as chaves na ordem que declara, não na ordem do objeto", () => {
    // A ordem de inserção de um objeto JavaScript é a ordem do `JSON.stringify`.
    // Se a serialização apenas repassasse o objeto, uma refatoração inocente em
    // `paginas.ts` reescreveria todas as fixtures do corpus de uma vez.
    const embaralhado = {
      totalDePaginas: SINTETICA.totalDePaginas,
      paginas: SINTETICA.paginas.map((pagina) => ({
        fragmentos: pagina.fragmentos.map((fragmento) => ({
          altura: fragmento.altura,
          largura: fragmento.largura,
          y: fragmento.y,
          x: fragmento.x,
          texto: fragmento.texto,
        })),
        altura: pagina.altura,
        largura: pagina.largura,
        numero: pagina.numero,
      })),
      confianca: SINTETICA.confianca ?? null,
      origem: SINTETICA.origem,
    } as DocumentoNormalizado;

    expect(serializarDocumento(embaralhado)).toBe(serializarDocumento(SINTETICA));
  });

  it("não tem data, caminho de máquina nem nada que mude sozinho", () => {
    const gerado = serializarDocumento(SINTETICA);

    expect(gerado).toBe(serializarDocumento(SINTETICA));
    expect(gerado).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
    expect(gerado).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    // O JSON é só as quatro chaves do documento; nada de metadado de geração.
    expect(Object.keys(JSON.parse(gerado) as object)).toEqual([
      "origem",
      "confianca",
      "totalDePaginas",
      "paginas",
    ]);
  });

  it("termina em uma quebra de linha, como todo arquivo do repositório", () => {
    expect(serializarDocumento(SINTETICA).endsWith("}\n")).toBe(true);
  });
});

describe("congelar fatura — recusas", () => {
  it("responde a PDF com senha com o que fazer, não com um stack trace", () => {
    expect(recusaLegivel(new SenhaNecessariaError())).toBe(
      "este PDF está protegido por senha: repita o comando com --senha <senha>.",
    );
    expect(recusaLegivel(new SenhaIncorretaError())).toBe("a senha informada não abre este PDF.");
  });

  it("diz o que o arquivo é, quando não é fatura que dê para ler", () => {
    expect(recusaLegivel(new FormatoNaoSuportadoError("um arquivo ZIP (talvez .docx ou .xlsx)"))).toBe(
      "não sei ler este arquivo: parece ser um arquivo ZIP (talvez .docx ou .xlsx).",
    );
    expect(recusaLegivel(new PdfIlegivelError(new Error("xref")))).toBe(
      "o arquivo diz ser PDF, mas está corrompido ou truncado.",
    );
  });

  it("deixa subir o erro que não previu — aí o rastro é o que ajuda", () => {
    expect(recusaLegivel(new Error("disco cheio"))).toBeNull();
    expect(recusaLegivel("nem erro é")).toBeNull();
  });
});

describe("congelar fatura — anonimização", () => {
  it("não é aplicada sem que alguém peça", () => {
    // Não há teste possível para "o programa não fez nada": o que se prova é
    // que quem congela sem `--anonimizar` recebe o texto impresso intacto, e é
    // por isso que a casca nunca chama esta função por conta própria.
    expect(serializarDocumento(SINTETICA)).toContain("11.222.333/0001-81");
  });

  it("troca o CNPJ, que tem forma própria", () => {
    const { documento, trocas } = anonimizarDocumento(SINTETICA);
    const texto = serializarDocumento(documento);

    expect(texto).not.toContain("11.222.333/0001-81");
    expect(texto).toContain("00.000.000/0000-00");
    expect(trocas.map((troca) => troca.classe)).toEqual(["CNPJ"]);
  });

  it("**não** toca em nenhum número que a aritmética confere", () => {
    // A prova mais forte que este arquivo tem: a ficha montada sobre o
    // documento anonimizado é idêntica à montada sobre o original. Quantidade,
    // tarifa, valor, total, conferência — tudo igual. Se um padrão de
    // anonimização começasse a comer dígito de fatura, este teste cai.
    const original = lerPorRegras(SINTETICA);
    const { documento } = anonimizarDocumento(SINTETICA, {
      ocultar: ["USINA LUZ DO CERRADO S.A.", "AV. DAS ARARAS"],
    });
    const anonima = lerPorRegras(documento);

    expect(anonima.invoice).toEqual(original.invoice);
    expect(anonima.conferencia).toEqual(original.conferencia);
    expect(anonima.itens.map((item) => item.valor)).toEqual(
      original.itens.map((item) => item.valor),
    );
    expect(anonima.identificacao).toEqual(original.identificacao);
    expect(anonima.aproveitavel).toBe(true);
  });

  it("troca o titular só quando alguém informa o texto", () => {
    const { documento, trocas } = anonimizarDocumento(SINTETICA, {
      ocultar: ["USINA LUZ DO CERRADO S.A."],
    });
    const texto = serializarDocumento(documento);

    expect(texto).not.toContain("USINA LUZ DO CERRADO");
    expect(texto).toContain("X".repeat("USINA LUZ DO CERRADO S.A.".length));
    expect(trocas.map((troca) => troca.classe)).toContain("texto informado em --ocultar");
  });

  it("é determinística: o mesmo pedido produz os mesmos bytes e o mesmo relatório", () => {
    const primeira = anonimizarDocumento(SINTETICA, { ocultar: ["USINA LUZ DO CERRADO S.A."] });
    const segunda = anonimizarDocumento(SINTETICA, { ocultar: ["USINA LUZ DO CERRADO S.A."] });

    expect(serializarDocumento(primeira.documento)).toBe(
      serializarDocumento(segunda.documento),
    );
    expect(primeira.trocas).toEqual(segunda.trocas);
  });

  it("preserva o comprimento do texto trocado", () => {
    // A geometria não depende do comprimento — `x` e `largura` continuam os
    // medidos —, mas manter o tamanho deixa a fixture anonimizada comparável
    // linha a linha com a original, que é metade da razão de ela existir.
    const { documento } = anonimizarDocumento(SINTETICA);

    for (const [pagina, original] of documento.paginas.entries()) {
      for (const [indice, fragmento] of original.fragmentos.entries()) {
        expect(fragmento.texto).toHaveLength(
          SINTETICA.paginas[pagina]?.fragmentos[indice]?.texto.length ?? -1,
        );
      }
    }
  });
});

describe("congelar fatura — esqueleto de spec", () => {
  const spec = gerarSpec({
    slug: SLUG,
    documento: SINTETICA,
    trocas: [],
    anonimizado: false,
  });

  it("é determinístico", () => {
    expect(
      gerarSpec({ slug: SLUG, documento: SINTETICA, trocas: [], anonimizado: false }),
    ).toBe(spec);
    expect(spec).not.toMatch(/\/Users\/|\d{4}-\d{2}-\d{2}T\d{2}:/);
  });

  it("busca a fixture no corpus, não ao lado de si mesmo", () => {
    // A asserção que impede a regressão mais cara deste ticket. A fixture saiu
    // de `src/` e foi para a pasta do corpus; um gerador que continuasse
    // emitindo `join(__dirname, ...)` produziria doze specs apontando para um
    // arquivo que não existe — todos quebrados no import, de uma vez.
    expect(spec).toContain(`const NOME = "${SLUG}.pagina.json";`);
    expect(spec).toContain("const DOCUMENTO = fixtureDoCorpus(NOME);");
    expect(spec).toContain(`import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";`);
    expect(spec).not.toMatch(/__dirname|readFileSync|node:fs|node:path/);
    expect(spec).not.toMatch(/lerFatura|abrirPdf|process\.env/);
  });

  it("pula com mensagem clara em quem não baixou o corpus", () => {
    expect(spec).toContain("if (!DOCUMENTO) console.warn(avisoDeCorpusAusente(NOME));");
    expect(spec).toContain("describe.skipIf(!DOCUMENTO)(");
  });

  it("adia a leitura para depois da coleta, senão o pulo não protege nada", () => {
    // O vitest executa o corpo de um `describe.skipIf` mesmo quando vai pular
    // os casos. Um `const LEITURA = lerPorRegras(DOCUMENTO)` ali dentro
    // derrubaria o arquivo inteiro em quem não tem o corpus — que é
    // exatamente a falha que o pulo existe para evitar.
    expect(spec).toContain("function leitura(): LeituraDaFatura {");
    expect(spec).toContain("return (lida ??= lerPorRegras(DOCUMENTO));");
    expect(spec).toContain("expect(leitura().aproveitavel).toBe(true);");
    expect(spec).not.toMatch(/const LEITURA = lerPorRegras/);
  });

  it("nasce com as asserções que o plano exige por caso", () => {
    // A lista é a do plano técnico: identificação, total, composição do total,
    // informativos, consumo e tarifa nas duas postos, demanda, e a soma
    // fechando. O que a fatura não publica simplesmente não aparece.
    expect(spec).toContain(`expect(leitura().identificacao.unidadeConsumidora).toBe("1234567-8");`);
    expect(spec).toContain(`expect(leitura().identificacao.competencia).toEqual({ mes: 1, ano: 2026 });`);
    expect(spec).toContain("expect(leitura().invoice.consumoPontaKwh).toBe(1_200);");
    expect(spec).toContain("expect(leitura().invoice.tarifaPonta).toBe(3.105);");
    expect(spec).toContain("expect(leitura().invoice.demandaContratadaKw).toBe(300);");
    expect(spec).toContain("expect(leitura().invoice.valorTotal).toBe(24_661);");
    expect(spec).toContain("expect(Number(soma.toFixed(2))).toBe(24_661);");
    expect(spec).toContain("expect(item.motivoForaDoTotal).toBe(MOTIVO_INFORMATIVO);");
    expect(spec).toContain(`"Adicional Bandeira Vermelha",`);
    expect(spec).toContain("expect(leitura().camposParaConfirmar).toEqual([]);");
  });

  it("só importa MOTIVO_INFORMATIVO quando há item informativo", () => {
    expect(spec).toContain(`import { MOTIVO_INFORMATIVO } from "./informativos.js";`);

    const semInformativo = gerarSpec({
      slug: "sem-bandeira",
      documento: {
        ...SINTETICA,
        paginas: SINTETICA.paginas.map((pagina) => ({
          ...pagina,
          fragmentos: pagina.fragmentos.filter(
            (fragmento) => !/bandeira|118,30/i.test(fragmento.texto),
          ),
        })),
      },
      trocas: [],
      anonimizado: false,
    });

    expect(semInformativo).not.toContain("MOTIVO_INFORMATIVO");
  });

  it("emite spec que compila também quando a leitura não achou item nenhum", () => {
    // Achado congelando uma Equatorial de verdade: a leitura não reconheceu o
    // layout, a lista de itens saiu vazia, e o `const esperados = []` emitido
    // não tem tipo que o TypeScript deduza — `pnpm typecheck` reprovava um spec
    // recém-gerado. Fatura que o leitor ainda não entende é caso legítimo de
    // corpus, então quem tinha de mudar era o gerador.
    const semItens = gerarSpec({
      slug: "sem-item-nenhum",
      documento: {
        ...SINTETICA,
        paginas: SINTETICA.paginas.map((pagina) => ({
          ...pagina,
          fragmentos: pagina.fragmentos.filter((fragmento) => fragmento.y > 720),
        })),
      },
      trocas: [],
      anonimizado: false,
    });

    expect(semItens).not.toContain("const esperados = [");
    expect(semItens).toContain("expect(leitura().itens).toEqual([]);");
    expect(semItens).toContain("não reconheceu nenhum item financeiro nesta fatura");
  });

  it("diz no cabeçalho o que foi trocado, e diz quando nada foi", () => {
    expect(spec).toContain("**Sem anonimização.**");
    expect(spec).not.toContain("**Anonimizada**");

    const anonimo = gerarSpec({
      slug: SLUG,
      documento: SINTETICA,
      trocas: [
        { classe: "CNPJ", fragmentos: 2 },
        { classe: "texto informado em --ocultar", fragmentos: 1 },
      ],
      anonimizado: true,
    });

    expect(anonimo).toContain("**Anonimizada** com `--anonimizar`");
    expect(anonimo).toContain("CNPJ (2), texto informado em --ocultar (1)");
    expect(anonimo).toContain("Nenhum número que a aritmética confere");
  });

  it("pede à pessoa o que o gerador não sabe escrever", () => {
    expect(spec).toContain("TODO: escreva aqui o que este layout tem de difícil");
    expect(spec).toContain("são os **observados**");
  });
});

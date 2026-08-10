import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { anonimizarDocumento, gerarSpec, recusaLegivel, serializarDocumento } from "./congelar.js";
import { FormatoNaoSuportadoError, type DocumentoNormalizado } from "./documento.js";
import { lerPorRegras } from "./leitura.js";
import { PdfIlegivelError, SenhaIncorretaError, SenhaNecessariaError } from "./paginas.js";

/**
 * A ferramenta que congela uma fatura, provada contra o único caso que já
 * existia congelado à mão.
 *
 * A prova que interessa não é "o programa roda": é que ele **reproduz o
 * trabalho manual**. `roraima-santa-tereza-2026-06.pagina.json` foi digitado a
 * partir da fatura, revisado, e é o que sustenta `roraima.spec.ts`. Se a
 * ferramenta produzisse um arquivo diferente, ou o formato mudaria — invalidando
 * o único teste de regressão contra documento real — ou a ferramenta estaria
 * errada. Aqui se mostra que produz o mesmo byte.
 *
 * O PDF de origem não entra no repositório: é fatura de cliente. Então o teste
 * ataca pelo outro lado — o JSON commitado **é** um `DocumentoNormalizado`
 * válido, e reserializá-lo tem de devolver o próprio arquivo. Fora daqui, a
 * ida completa (PDF → JSON) foi rodada à mão sobre o PDF original e produziu
 * exatamente este arquivo, com a única diferença registrada abaixo.
 */
const CAMINHO_MANUAL = join(__dirname, "roraima-santa-tereza-2026-06.pagina.json");
const MANUAL = readFileSync(CAMINHO_MANUAL, "utf8");
const DOCUMENTO = JSON.parse(MANUAL) as DocumentoNormalizado;

/**
 * A única diferença entre o arquivo manual e o que a ferramenta escreve.
 *
 * `confianca` é campo de `DocumentoNormalizado` e vale `null` quando o texto
 * veio da camada do PDF — foi por ser sempre nulo naquele caso que quem digitou
 * o arquivo o omitiu. A ferramenta o escreve sempre: numa fatura digitalizada
 * ele é a confiança média do reconhecimento óptico, e omiti-lo jogaria fora a
 * medida de quanto se pode acreditar naquele texto.
 */
const LINHA_DA_CONFIANCA = ` "confianca": null,\n`;

describe("congelar fatura — serialização", () => {
  it("reproduz byte a byte a fixture que foi feita à mão", () => {
    const gerado = serializarDocumento(DOCUMENTO);

    expect(gerado).toContain(LINHA_DA_CONFIANCA);
    expect(gerado.replace(LINHA_DA_CONFIANCA, "")).toBe(MANUAL);
  });

  it("escreve as chaves na ordem que declara, não na ordem do objeto", () => {
    // A ordem de inserção de um objeto JavaScript é a ordem do `JSON.stringify`.
    // Se a serialização apenas repassasse o objeto, uma refatoração inocente em
    // `paginas.ts` reescreveria todas as fixtures do corpus de uma vez.
    const embaralhado = {
      totalDePaginas: DOCUMENTO.totalDePaginas,
      paginas: DOCUMENTO.paginas.map((pagina) => ({
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
      confianca: DOCUMENTO.confianca ?? null,
      origem: DOCUMENTO.origem,
    } as DocumentoNormalizado;

    expect(serializarDocumento(embaralhado)).toBe(serializarDocumento(DOCUMENTO));
  });

  it("não tem data, caminho de máquina nem nada que mude sozinho", () => {
    const gerado = serializarDocumento(DOCUMENTO);

    expect(gerado).toBe(serializarDocumento(DOCUMENTO));
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
    expect(serializarDocumento(DOCUMENTO).endsWith("}\n")).toBe(true);
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
    expect(serializarDocumento(DOCUMENTO)).toContain("02.341.470/0001-44");
  });

  it("troca CNPJ e CEP, que têm forma própria", () => {
    const { documento, trocas } = anonimizarDocumento(DOCUMENTO);
    const texto = serializarDocumento(documento);

    expect(texto).not.toContain("02.341.470/0001-44");
    expect(texto).toContain("00.000.000/0000-00");
    expect(texto).not.toContain("69.301-160");
    expect(texto).toContain("00.000-000");
    expect(trocas.map((troca) => troca.classe)).toEqual([
      "CNPJ",
      "CEP",
      "linha digitável / código de barras",
    ]);
  });

  it("zera a linha digitável, que é instrumento de pagamento", () => {
    // `00190.00009 01274.283009 09017.200172 3 15190017463670` é um boleto
    // pagável, e traz dentro o CNPJ e o total. Deixá-la numa fixture commitada
    // seria publicar a conta de um cliente num repositório.
    const { documento } = anonimizarDocumento(DOCUMENTO);
    const texto = serializarDocumento(documento);

    expect(texto).not.toContain("00190.00009 01274.283009");
    expect(texto).toContain("00000.00000 00000.000000");
  });

  it("**não** toca em nenhum número que a aritmética confere", () => {
    // A prova mais forte que este arquivo tem: a ficha montada sobre o
    // documento anonimizado é idêntica à montada sobre o original. Quantidade,
    // tarifa, valor, total, conferência — tudo igual. Se um padrão de
    // anonimização começasse a comer dígito de fatura, este teste cai.
    const original = lerPorRegras(DOCUMENTO);
    const { documento } = anonimizarDocumento(DOCUMENTO, {
      ocultar: ["MERCANTIL NOVA ERA LTDA", "SAO SEBASTIAO"],
    });
    const anonima = lerPorRegras(documento);

    expect(anonima.invoice).toEqual(original.invoice);
    expect(anonima.conferencia).toEqual(original.conferencia);
    expect(anonima.demandaComplementoValor).toBe(original.demandaComplementoValor);
    expect(anonima.itens.map((item) => item.valor)).toEqual(
      original.itens.map((item) => item.valor),
    );
    expect(anonima.identificacao).toEqual(original.identificacao);
    expect(anonima.aproveitavel).toBe(true);
  });

  it("troca o titular só quando alguém informa o texto", () => {
    const { documento, trocas } = anonimizarDocumento(DOCUMENTO, {
      ocultar: ["MERCANTIL NOVA ERA LTDA"],
    });
    const texto = serializarDocumento(documento);

    expect(texto).not.toContain("MERCANTIL NOVA ERA");
    expect(texto).toContain("X".repeat("MERCANTIL NOVA ERA LTDA".length));
    expect(trocas.map((troca) => troca.classe)).toContain("texto informado em --ocultar");
  });

  it("é determinística: o mesmo pedido produz os mesmos bytes e o mesmo relatório", () => {
    const primeira = anonimizarDocumento(DOCUMENTO, { ocultar: ["MERCANTIL NOVA ERA LTDA"] });
    const segunda = anonimizarDocumento(DOCUMENTO, { ocultar: ["MERCANTIL NOVA ERA LTDA"] });

    expect(serializarDocumento(primeira.documento)).toBe(
      serializarDocumento(segunda.documento),
    );
    expect(primeira.trocas).toEqual(segunda.trocas);
  });

  it("preserva o comprimento do texto trocado", () => {
    // A geometria não depende do comprimento — `x` e `largura` continuam os
    // medidos —, mas manter o tamanho deixa a fixture anonimizada comparável
    // linha a linha com a original, que é metade da razão de ela existir.
    const { documento } = anonimizarDocumento(DOCUMENTO);

    for (const [pagina, original] of documento.paginas.entries()) {
      for (const [indice, fragmento] of original.fragmentos.entries()) {
        expect(fragmento.texto).toHaveLength(
          DOCUMENTO.paginas[pagina]?.fragmentos[indice]?.texto.length ?? -1,
        );
      }
    }
  });
});

describe("congelar fatura — esqueleto de spec", () => {
  const spec = gerarSpec({
    slug: "roraima-santa-tereza-2026-06",
    documento: DOCUMENTO,
    trocas: [],
    anonimizado: false,
  });

  it("é determinístico", () => {
    expect(
      gerarSpec({
        slug: "roraima-santa-tereza-2026-06",
        documento: DOCUMENTO,
        trocas: [],
        anonimizado: false,
      }),
    ).toBe(spec);
    expect(spec).not.toMatch(/\/Users\/|\d{4}-\d{2}-\d{2}T\d{2}:/);
  });

  it("lê a fixture pelo nome, sem abrir binário nem chamar rede", () => {
    expect(spec).toContain(`readFileSync(join(__dirname, "roraima-santa-tereza-2026-06.pagina.json"), "utf8")`);
    expect(spec).toContain("const LEITURA = lerPorRegras(DOCUMENTO);");
    expect(spec).not.toMatch(/lerFatura|abrirPdf|process\.env/);
  });

  it("nasce com as asserções que o plano exige por caso", () => {
    // A lista é a do plano técnico: identificação, total, composição do total,
    // informativos, consumo e tarifa nas duas postos, demanda, e a soma
    // fechando. O que a fatura não publica simplesmente não aparece.
    expect(spec).toContain(`expect(LEITURA.identificacao.distribuidora).toBe("RORAIMA ENERGIA");`);
    expect(spec).toContain(`expect(LEITURA.identificacao.unidadeConsumidora).toBe("01939890");`);
    expect(spec).toContain(`expect(LEITURA.identificacao.competencia).toEqual({ mes: 6, ano: 2026 });`);
    expect(spec).toContain("expect(LEITURA.invoice.consumoPontaKwh).toBe(17_419);");
    expect(spec).toContain("expect(LEITURA.invoice.tarifaPonta).toBe(2.689175);");
    expect(spec).toContain("expect(LEITURA.invoice.consumoForaPontaKwh).toBe(183_153);");
    expect(spec).toContain("expect(LEITURA.invoice.demandaContratadaKw).toBe(500);");
    expect(spec).toContain("expect(LEITURA.invoice.demandaMedidaPontaKw).toBe(367);");
    expect(spec).toContain("expect(LEITURA.invoice.valorTotal).toBe(174_636.7);");
    expect(spec).toContain("expect(LEITURA.demandaComplementoValor).toBe(2_947.28);");
    expect(spec).toContain("expect(Number(soma.toFixed(2))).toBe(174_636.7);");
    expect(spec).toContain("expect(item.motivoForaDoTotal).toBe(MOTIVO_INFORMATIVO);");
    expect(spec).toContain(`"Adicional Bandeira Amarela",`);
    expect(spec).toContain("expect(LEITURA.camposParaConfirmar).toEqual([]);");
  });

  it("só importa MOTIVO_INFORMATIVO quando há item informativo", () => {
    expect(spec).toContain(`import { MOTIVO_INFORMATIVO } from "./informativos.js";`);

    const semInformativo = gerarSpec({
      slug: "sem-bandeira",
      documento: {
        ...DOCUMENTO,
        paginas: DOCUMENTO.paginas.map((pagina) => ({
          ...pagina,
          fragmentos: pagina.fragmentos.filter(
            (fragmento) => !/bandeira/i.test(fragmento.texto),
          ),
        })),
      },
      trocas: [],
      anonimizado: false,
    });

    expect(semInformativo).not.toContain("MOTIVO_INFORMATIVO");
  });

  it("diz no cabeçalho o que foi trocado, e diz quando nada foi", () => {
    expect(spec).toContain("**Sem anonimização.**");
    expect(spec).not.toContain("**Anonimizada**");

    const anonimo = gerarSpec({
      slug: "roraima-santa-tereza-2026-06",
      documento: DOCUMENTO,
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

  it("avisa no cabeçalho quando o caso congelado não é um caso bom", () => {
    // Uma fatura da qual só sobrou o cabeçalho: identificação sim, itens não.
    const truncado: DocumentoNormalizado = {
      ...DOCUMENTO,
      paginas: DOCUMENTO.paginas.map((pagina) => ({
        ...pagina,
        fragmentos: pagina.fragmentos.filter((fragmento) => fragmento.y > 700),
      })),
    };

    const aviso = gerarSpec({
      slug: "truncado",
      documento: truncado,
      trocas: [],
      anonimizado: false,
    });

    expect(aviso).toContain("**não fechou a ficha**");
    expect(aviso).toContain("não fecha a ficha sozinha, e diz pelo nome o que faltou");
  });

  it("escreve a soma observada, não a desejada, quando a leitura não fecha o total", () => {
    // Sem a linha do consumo fora ponta, a soma dos itens deixa de alcançar o
    // total impresso. Congelar o total aqui geraria um spec que nasce vermelho.
    const semForaPonta: DocumentoNormalizado = {
      ...DOCUMENTO,
      paginas: DOCUMENTO.paginas.map((pagina) => ({
        ...pagina,
        fragmentos: pagina.fragmentos.filter(
          (fragmento) => !/114\.646,81|183153/.test(fragmento.texto),
        ),
      })),
    };

    const leitura = lerPorRegras(semForaPonta);
    const soma = Number(
      leitura.itens
        .filter((item) => item.compoeTotal)
        .reduce((total, item) => total + item.valor, 0)
        .toFixed(2),
    );

    expect(soma).not.toBe(leitura.invoice.valorTotal);

    const gerado = gerarSpec({
      slug: "sem-fora-ponta",
      documento: semForaPonta,
      trocas: [],
      anonimizado: false,
    });

    expect(gerado).toContain("não alcança o total");
    expect(gerado).toContain("Não o ajuste para fechar");
    expect(gerado).not.toContain("expect(Number(soma.toFixed(2))).toBe(174_636.7);");
  });

  it("pede à pessoa o que o gerador não sabe escrever", () => {
    expect(spec).toContain("TODO: escreva aqui o que este layout tem de difícil");
    expect(spec).toContain("são os **observados**");
  });
});

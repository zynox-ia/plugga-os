import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { anonimizarDocumento, gerarSpec, serializarDocumento } from "./congelar.js";
import { avisoDeCorpusAusente, pastaDoCorpus } from "./corpus.js";
import type { DocumentoNormalizado } from "./documento.js";
import { lerPorRegras } from "./leitura.js";

/**
 * A ferramenta de congelar, provada contra o único caso que já existia
 * congelado à mão.
 *
 * A prova que interessa não é "o programa roda": é que ele **reproduz o
 * trabalho manual**. `roraima-santa-tereza-2026-06.pagina.json` foi digitado a
 * partir da fatura, revisado, e é o que sustenta `roraima.corpus.spec.ts`. Se a
 * ferramenta produzisse um arquivo diferente, ou o formato mudaria —
 * invalidando a regressão contra documento real — ou a ferramenta estaria
 * errada. Aqui se mostra que produz o mesmo byte.
 *
 * O teste ataca pelo lado do JSON, não do PDF: o arquivo congelado **é** um
 * `DocumentoNormalizado` válido, e reserializá-lo tem de devolver ele mesmo. A
 * ida completa (PDF → JSON) foi rodada à mão sobre o PDF original e produziu
 * exatamente este arquivo, com a única diferença registrada abaixo.
 *
 * A fixture é fatura de cliente e não vive no git: ela vem do balde do corpus
 * por `corpus:baixar`. Sem ela, este arquivo pula inteiro — o que a ferramenta
 * dá para provar sobre fatura fabricada está em `congelar.spec.ts` e roda em
 * qualquer máquina.
 */
const NOME = "roraima-santa-tereza-2026-06.pagina.json";
const CAMINHO = join(pastaDoCorpus(), NOME);
const MANUAL = existsSync(CAMINHO) ? readFileSync(CAMINHO, "utf8") : null;

if (!MANUAL) console.warn(avisoDeCorpusAusente(NOME));

/**
 * O documento, lido no primeiro caso que o pedir — nunca na coleta.
 *
 * O vitest executa o corpo de um `describe.skipIf` mesmo quando vai pular os
 * casos, e este arquivo deriva coisas da fixture ali dentro. Adiar é o que faz
 * o pulo de fato proteger quem não baixou o corpus.
 */
let lido: DocumentoNormalizado | null = null;
function doc(): DocumentoNormalizado {
  if (!MANUAL) throw new Error(`${NOME} não está no corpus local`);
  return (lido ??= JSON.parse(MANUAL) as DocumentoNormalizado);
}

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

const SLUG = "roraima-santa-tereza-2026-06";

describe.skipIf(!MANUAL)("congelar fatura — serialização contra a fixture manual", () => {
  it("reproduz byte a byte a fixture que foi feita à mão", () => {
    const gerado = serializarDocumento(doc());

    expect(gerado).toContain(LINHA_DA_CONFIANCA);
    expect(gerado.replace(LINHA_DA_CONFIANCA, "")).toBe(MANUAL);
  });
});

describe.skipIf(!MANUAL)("congelar fatura — anonimização de fatura real", () => {
  it("troca CNPJ e CEP, que têm forma própria", () => {
    const { documento, trocas } = anonimizarDocumento(doc());
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
    // pagável, e traz dentro o CNPJ e o total. Ele sai zerado de qualquer
    // fixture anonimizada — e é uma das razões de a fixture inteira não morar
    // no git, onde não haveria como revogar nada depois.
    const { documento } = anonimizarDocumento(doc());
    const texto = serializarDocumento(documento);

    expect(texto).not.toContain("00190.00009 01274.283009");
    expect(texto).toContain("00000.00000 00000.000000");
  });

  it("**não** toca em nenhum número que a aritmética confere", () => {
    const original = lerPorRegras(doc());
    const { documento } = anonimizarDocumento(doc(), {
      ocultar: ["MERCANTIL NOVA ERA LTDA", "SAO SEBASTIAO"],
    });
    const anonima = lerPorRegras(documento);

    expect(anonima.invoice).toEqual(original.invoice);
    expect(anonima.conferencia).toEqual(original.conferencia);
    expect(anonima.demandaComplementoValor).toBe(original.demandaComplementoValor);
    expect(anonima.identificacao).toEqual(original.identificacao);
    expect(anonima.aproveitavel).toBe(true);
  });
});

describe.skipIf(!MANUAL)("congelar fatura — esqueleto de spec sobre fatura real", () => {
  let gerado: string | null = null;
  const spec = (): string =>
    (gerado ??= gerarSpec({ slug: SLUG, documento: doc(), trocas: [], anonimizado: false }));

  it("escreve os valores observados nesta fatura", () => {
    expect(spec()).toContain(
      `expect(leitura().identificacao.distribuidora).toBe("RORAIMA ENERGIA");`,
    );
    expect(spec()).toContain(`expect(leitura().identificacao.unidadeConsumidora).toBe("01939890");`);
    expect(spec()).toContain(
      `expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });`,
    );
    expect(spec()).toContain("expect(leitura().invoice.consumoPontaKwh).toBe(17_419);");
    expect(spec()).toContain("expect(leitura().invoice.tarifaPonta).toBe(2.689175);");
    expect(spec()).toContain("expect(leitura().invoice.consumoForaPontaKwh).toBe(183_153);");
    expect(spec()).toContain("expect(leitura().invoice.demandaContratadaKw).toBe(500);");
    expect(spec()).toContain("expect(leitura().invoice.demandaMedidaPontaKw).toBe(367);");
    expect(spec()).toContain("expect(leitura().invoice.valorTotal).toBe(174_636.7);");
    expect(spec()).toContain("expect(leitura().demandaComplementoValor).toBe(2_947.28);");
    expect(spec()).toContain("expect(Number(soma.toFixed(2))).toBe(174_636.7);");
    expect(spec()).toContain(`"Adicional Bandeira Amarela",`);
  });

  it("avisa no cabeçalho quando o caso congelado não é um caso bom", () => {
    // Uma fatura da qual só sobrou o cabeçalho: identificação sim, itens não.
    const truncado: DocumentoNormalizado = {
      ...doc(),
      paginas: doc().paginas.map((pagina) => ({
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
      ...doc(),
      paginas: doc().paginas.map((pagina) => ({
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

    const emitido = gerarSpec({
      slug: "sem-fora-ponta",
      documento: semForaPonta,
      trocas: [],
      anonimizado: false,
    });

    expect(emitido).toContain("não alcança o total");
    expect(emitido).toContain("Não o ajuste para fechar");
    expect(emitido).not.toContain("expect(Number(soma.toFixed(2))).toBe(174_636.7);");
  });
});

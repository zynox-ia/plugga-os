import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { DocumentoNormalizado } from "./documento.js";
import { MOTIVO_INFORMATIVO } from "./informativos.js";
import { lerItens } from "./itens.js";
import { lerPorRegras } from "./leitura.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";

/**
 * A regressão do leitor que roda em qualquer máquina, sem credencial e sem rede.
 *
 * O corpus de verdade — fatura de cliente, com o dado inteiro — mora no balde
 * do MinIO, fora do git, e chega por `corpus:baixar`. Isso resolve o container
 * errado, mas cria uma dependência operacional: quem clona sem a chave, e a CI
 * quando o runner da VPS está fora, ficariam **sem nenhuma** regressão de
 * leitura. Esta fixture é o piso que impede isso.
 *
 * Ela é fabricada, não anonimizada, e a diferença importa. Anonimizar uma
 * fatura real produziria um documento que parece prova e não é: os campos que o
 * relatório entrega ao cliente estariam degradados, e o teste passaria a
 * afirmar algo mais fraco do que aparenta. Aqui não há cliente nenhum —
 * emitente, CNPJ, unidade consumidora e valores foram inventados, e a fixture
 * declara isso no nome.
 *
 * O que ela prova é o caminho inteiro das regras sobre a geometria que a
 * distribuidora imprime de verdade:
 *
 * - **fatura de duas colunas**, em que a linha impressa de largura inteira cola
 *   o cabeçalho da unidade na tabela de itens — o defeito que a Roraima Energia
 *   revelou, e o único que já tinha regressão determinística;
 * - **a aritmética julga**: os quatro itens com quantidade fecham na
 *   multiplicação, e a soma fecha com o total impresso;
 * - **bandeira informativa**, provada pela própria soma e não pelo rótulo;
 * - **os dois campos que se lê por posição na folha** — valor total embaixo do
 *   cabeçalho da coluna, demanda contratada rotulada na linha.
 *
 * O que ela **não** substitui é a variedade: seis distribuidoras, digitalização,
 * layout torto. Isso é o corpus, e continua sendo.
 */
const DOCUMENTO = JSON.parse(
  readFileSync(join(__dirname, "usina-cerrado-sintetica-2026-01.pagina.json"), "utf8"),
) as DocumentoNormalizado;

const PAGINAS = DOCUMENTO.paginas;

const TOTAL_IMPRESSO = 24_661;

describe("fixture sintética — leitor sem credencial nenhuma", () => {
  it("não carrega dado de cliente: a fixture é fabricada e diz isso", () => {
    // A guarda que sustenta esta fixture morar no git. Se um dia alguém
    // substituir o conteúdo por uma fatura de verdade "só para testar", é aqui
    // que o repositório reclama, antes de o dado virar histórico permanente.
    const texto = readFileSync(
      join(__dirname, "usina-cerrado-sintetica-2026-01.pagina.json"),
      "utf8",
    );

    expect(texto).toContain("USINA LUZ DO CERRADO S.A.");
    expect(DOCUMENTO.origem).toBe("texto_direto");
  });

  it("a leitura de largura inteira cola as colunas, e por isso não basta", () => {
    const linhas = linhasImpressas(PAGINAS);

    expect(
      linhas.some((linha) => /GRUPO A.*Consumo Ponta 1\.200 kWh/.test(linha)),
    ).toBe(true);

    // E o estrago é real, não estético: o rótulo lido carrega o cabeçalho junto,
    // então o item não casa com nenhum campo da ficha.
    const rotulos = lerItens(linhas).map((item) => item.rotulo);
    expect(rotulos).not.toContain("Consumo Ponta");
    expect(rotulos.some((rotulo) => rotulo.startsWith("GRUPO A"))).toBe(true);
  });

  it("o corte por coluna separa a tabela de itens do cabeçalho da unidade", () => {
    const linhas = linhasPorColuna(PAGINAS);

    expect(linhas).toContain("Consumo Ponta 1.200 kWh a 3,105000");
    expect(linhas).toContain("3.726,00");
    expect(linhas).toContain("Contribuição de Iluminação Pública (COSIP)");
    expect(linhas.some((linha) => /GRUPO A.*Consumo Ponta/.test(linha))).toBe(false);
  });

  it("lê os quatro itens com quantidade, tarifa e valor", () => {
    const itens = lerItens(linhasPorColuna(PAGINAS));

    for (const esperado of [
      { rotulo: "Consumo Ponta", quantidade: 1_200, unidade: "kWh", tarifa: 3.105, valor: 3_726 },
      {
        rotulo: "Consumo F/Ponta",
        quantidade: 18_000,
        unidade: "kWh",
        tarifa: 0.7125,
        valor: 12_825,
      },
      { rotulo: "Demanda Ponta", quantidade: 150, unidade: "kW", tarifa: 28.4, valor: 4_260 },
      { rotulo: "Demanda F/Ponta", quantidade: 300, unidade: "kW", tarifa: 12.15, valor: 3_645 },
    ]) {
      const achado = itens.find((item) => item.rotulo === esperado.rotulo);
      expect(achado, `item ausente: ${esperado.rotulo}`).toBeDefined();
      expect(achado).toMatchObject(esperado);
    }
  });

  it("a fatura é aproveitável sozinha, e sem nada para confirmar", () => {
    const leitura = lerPorRegras(DOCUMENTO);

    expect(leitura.aproveitavel).toBe(true);
    expect(leitura.motivo).toBeNull();
    expect(leitura.camposParaConfirmar).toEqual([]);

    expect(leitura.identificacao.unidadeConsumidora).toBe("1234567-8");
    expect(leitura.identificacao.competencia).toEqual({ mes: 1, ano: 2026 });

    expect(leitura.invoice).toMatchObject({
      consumoPontaKwh: 1_200,
      tarifaPonta: 3.105,
      consumoForaPontaKwh: 18_000,
      tarifaForaPonta: 0.7125,
      demandaMedidaPontaKw: 150,
      demandaMedidaForaPontaKw: 300,
      // Lidos por posição na folha, não por proximidade de texto.
      valorTotal: TOTAL_IMPRESSO,
      demandaContratadaKw: 300,
    });
  });

  it("a aritmética de cada item fecha, e a soma fecha com o total impresso", () => {
    const leitura = lerPorRegras(DOCUMENTO);

    expect(leitura.conferencia.divergentes).toBe(0);
    expect(leitura.conferencia.confirmados).toBe(4);

    const soma = leitura.itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(TOTAL_IMPRESSO);
  });

  it("a bandeira é lida, marcada como informativa e nunca removida", () => {
    const leitura = lerPorRegras(DOCUMENTO);
    const bandeira = leitura.itens.find((item) => /bandeira/i.test(item.rotulo));

    expect(bandeira?.valor).toBe(118.3);
    expect(bandeira?.compoeTotal).toBe(false);
    expect(bandeira?.motivoForaDoTotal).toBe(MOTIVO_INFORMATIVO);

    // A prova é a soma, não o rótulo: com a bandeira dentro, o total estoura.
    const comBandeira = leitura.itens.reduce((total, item) => total + item.valor, 0);
    expect(Number(comBandeira.toFixed(2))).not.toBe(TOTAL_IMPRESSO);
  });
});

import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";

/**
 * Equatorial Pará — Rodrigues Colchões 06/2026, a fatura sem unidade consumidora.
 *
 * O terceiro layout que a leitura não abre, e o mais completo dos três em
 * matéria do que dá errado: é o **único caso do corpus em que nem a unidade
 * consumidora sai** — `identificacao.unidadeConsumidora` é `null`. O número
 * está impresso, `3.001.042.013-90`, e é o mesmo que o caso golden registra;
 * o que falta é **rótulo**. Ele aparece solto num bloco de cabeçalho, sem
 * "Unidade Consumidora" nem "Número da UC" ao lado, e `identificacao.ts` acha
 * a UC pelo rótulo, nunca pela forma — o que é a decisão certa: uma corrida de
 * dígitos com pontuação, sem rótulo, é indistinguível de uma inscrição
 * estadual ou de um código de barras.
 *
 * A tabela de itens tem a mesma doença do DANF3E da Energisa por outro
 * caminho: "Consumo Ponta (kWh) 2.015,02 4,077295 3,021150 567,15 1.561,01
 * 8.215,83 PIS 39.983,22 1,5185 607,14" mistura, na mesma linha impressa, os
 * seis números do item **e** três do quadro de tributos, que fica à direita.
 * A quantidade vem com separador de milhar e vírgula decimal (`2.015,02`, um
 * consumo em kWh escrito como dinheiro), a unidade vem entre parênteses no
 * rótulo em vez de depois da quantidade, e há duas tarifas — com e sem
 * tributos — antes do valor. Nenhuma dessas formas casa `itens.ts`.
 *
 * O total, ao contrário do DANF3E, **está** ao alcance: o corte por coluna
 * produz o segmento `"51.737,00"`, e a linha impressa "06/2026 18/07/2026 R$
 * 51.737,00" traz junto a referência e o vencimento. É por isso que a
 * competência 06/2026 sai certa aqui, e por acaso: é o primeiro `MM/AAAA` da
 * página, e nesta fatura o primeiro é o certo.
 *
 * **Conferido** contra o caso golden `fatura-rodrigues`: total 51.737,00,
 * consumo de ponta 2.015 kWh = 8.215,83, fora ponta 33.702 kWh = 19.139,06,
 * demanda ativa 163 kW = 9.854,99, ultrapassagem 93 kW = 11.243,50, adicional de
 * bandeira 908,63 e COSIP 2.374,99. Todos conferem com o impresso, e nenhum é
 * lido hoje.
 *
 * O ticket esperava que esta fatura viesse digitalizada e observou que ela veio
 * com camada de texto. Veio mesmo — e não adiantou.
 *
 * Fixture gerada por `pnpm --filter @plugga/api fatura:congelar`. O caso vive
 * aqui como a geometria da página, não como PDF: os fragmentos com posição são
 * o que a leitura consome, e congelá-los torna o teste determinístico sem
 * depender do arquivo original.
 *
 * **A fixture não está no git.** Ela é fatura de cliente, com o dado inteiro,
 * e git é container permanente, replicado em todo clone e sem revogação — o
 * JSON mora no balde do corpus no MinIO e chega por `corpus:baixar`. Sem a
 * chave, este arquivo inteiro é pulado com a mensagem que explica o porquê.
 *
 * **Sem anonimização.** O texto desta fixture é o impresso na fatura,
 * incluindo titular, documento e endereço. Congelada sem `--anonimizar`.
 */
const NOME = "equatorial-pa-rodrigues-2026-06.pagina.json";
const DOCUMENTO = fixtureDoCorpus(NOME);

if (!DOCUMENTO) console.warn(avisoDeCorpusAusente(NOME));

/**
 * A leitura, feita no primeiro caso que a pedir — nunca na coleta.
 *
 * O vitest executa o corpo de um `describe.skipIf` mesmo quando vai pular os
 * casos. Derivar qualquer coisa da fixture ali dentro quebraria o arquivo
 * inteiro em quem não baixou o corpus, que é exatamente o que o pulo existe
 * para evitar.
 */
let lida: LeituraDaFatura | null = null;
function leitura(): LeituraDaFatura {
  if (!DOCUMENTO) throw new Error(`${NOME} não está no corpus local`);
  return (lida ??= lerPorRegras(DOCUMENTO));
}

describe.skipIf(!DOCUMENTO)("Equatorial Pará — Rodrigues Colchões 06/2026", () => {
  it("não fecha a ficha sozinha, e diz pelo nome o que faltou", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(false);
    expect(leitura().motivo).toBe("layout_desconhecido");
  });

  it("não acha a unidade consumidora: o número está impresso, o rótulo não", () => {
    expect(leitura().identificacao.distribuidora).toBe("EQUATORIAL");
    // `3.001.042.013-90` está na página — é o que o golden registra como UC —,
    // solto num bloco de cabeçalho sem rótulo ao lado. Procurar pela forma, e
    // não pelo rótulo, confundiria UC com inscrição estadual.
    expect(linhasPorColuna(DOCUMENTO?.paginas ?? [])).toContain("3.001.042.013-90");
    expect(leitura().identificacao.unidadeConsumidora).toBeNull();
    expect(leitura().identificacao.competencia).toEqual({ mes: 6, ano: 2026 });
  });

  it("não reconheceu nenhum item financeiro nesta fatura", () => {
    // É isto que o caso registra. Quando o leitor aprender este layout,
    // este teste fica vermelho — e é assim que se percebe que melhorou.
    expect(leitura().itens).toEqual([]);
  });

  it("o item traz seis números seus e três do quadro de tributos", () => {
    // Quantidade em kWh escrita como dinheiro (2.015,02), unidade entre
    // parênteses no rótulo, duas tarifas — com e sem tributos — antes do valor,
    // e a coluna do PIS emendada no fim da mesma linha.
    expect(linhasImpressas(DOCUMENTO?.paginas ?? [])).toContain(
      "Consumo Ponta (kWh) 2.015,02 4,077295 3,021150 567,15 1.561,01 8.215,83 PIS 39.983,22 1,5185 607,14",
    );
    expect(leitura().invoice.consumoPontaKwh).toBeUndefined();
  });

  it("o total está a um passo: sai inteiro no corte por coluna, e mesmo assim não entra", () => {
    // Diferente do DANF3E, aqui o corte entrega "51.737,00" como segmento
    // próprio. O que falta é o rótulo que `campos.ts` procura — a fatura escreve
    // o total sem dizer "total", só com o "R$" ao lado da data de vencimento.
    expect(linhasPorColuna(DOCUMENTO?.paginas ?? [])).toContain("51.737,00");
    expect(leitura().invoice.valorTotal).toBeUndefined();
  });

  it("sem item, não há aritmética a conferir", () => {
    expect(leitura().conferencia.confirmados).toBe(0);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });

  it("declara exatamente o que ainda depende de conferência humana", () => {
    expect(leitura().camposParaConfirmar).toEqual([
      "layout não reconhecido: nenhum item financeiro identificado",
    ]);
  });
});

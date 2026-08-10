import { describe, expect, it } from "vitest";

import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";

/**
 * Amazonas Energia — Tabatinga (TBT) 12/2024, o caso que fecha inteiro.
 *
 * O único das doze faturas deste corpus em que a leitura **reconstrói o total
 * exatamente**, item por item, sem nada de fora: 44.650,88 impresso, 44.650,88
 * somado. Vale por isso — um corpus só de casos difíceis não detecta a
 * regressão que quebra o caso fácil.
 *
 * O layout é o mesmo da Âmbar (a Amazonas Energia virou Âmbar depois desta
 * referência; aqui o cabeçalho ainda diz "AMAZONAS ENERGIA"), com a tabela na
 * coluna da direita. A diferença que faz ele fechar é composição, não estrutura:
 * nenhuma linha financeira cai na altura do bloco "Datas da Leitura", que é onde
 * o corte por coluna separa rótulo de valor em `ambar-alvorada` e em
 * `amazonas-tff-2026-04`.
 *
 * Também é o caso mais antigo do corpus — 12/2024, contra 2026 em todos os
 * outros — e nisso protege contra mudança de leitor que assuma o layout deste
 * ano.
 *
 * **Conferido** contra o caso golden `fatura-tbt-2026`: consumo de ponta 2.380
 * kWh a 1,79345, fora ponta 57.050 kWh a 0,51358, demanda 271 kW a 24,15 =
 * 6.544,65, ultrapassagem 71 kW = 3.429,30, reativo excedente fora ponta 731,61,
 * COSIP 377,18 e total 44.650,88 — os seis itens do golden e os seis lidos são
 * os mesmos, com os mesmos números.
 *
 * O golden guarda `uc: 96298590` e `referencia: 01/2025`; na fatura, 96298590 é
 * o **número da nota fiscal** e 01/2025 é o mês do **vencimento** (17/01/2025). O
 * que está impresso sob "Número da UC" é 1103566-8, e o mês faturado é 12/2024 —
 * que é o que a leitura devolve. O leitor está certo nos dois campos.
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
const NOME = "amazonas-tbt-2024-12.pagina.json";
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

describe.skipIf(!DOCUMENTO)("Amazonas Energia — Tabatinga (TBT) 12/2024", () => {
  it("chega em ficha aproveitável sozinha, sem plano B", () => {
    expect(leitura().origem).toBe("texto_direto");
    expect(leitura().aproveitavel).toBe(true);
    expect(leitura().motivo).toBeNull();
  });

  it("identifica distribuidora, unidade consumidora e competência", () => {
    expect(leitura().identificacao.distribuidora).toBe("AMAZONAS ENERGIA");
    expect(leitura().identificacao.unidadeConsumidora).toBe("1103566-8");
    expect(leitura().identificacao.competencia).toEqual({ mes: 12, ano: 2024 });
  });

  it("lê consumo, tarifa e valor em ponta e fora ponta", () => {
    expect(leitura().invoice.consumoPontaKwh).toBe(2_380);
    expect(leitura().invoice.tarifaPonta).toBe(1.79345);
    expect(leitura().invoice.valorPonta).toBe(4_268.41);
    expect(leitura().invoice.consumoForaPontaKwh).toBe(57_050);
    expect(leitura().invoice.tarifaForaPonta).toBe(0.51358);
    expect(leitura().invoice.valorForaPonta).toBe(29_299.73);
  });

  it("lê a demanda contratada e a registrada", () => {
    expect(leitura().invoice.demandaContratadaKw).toBe(200);
    expect(leitura().invoice.demandaMedidaForaPontaKw).toBe(271);
    expect(leitura().invoice.tarifaDemanda).toBe(24.15);
    expect(leitura().invoice.valorDemanda).toBe(6_544.65);
  });

  it("lê a tabela de itens com quantidade, unidade, tarifa e valor", () => {
    const esperados = [
      { rotulo: "Consumo Ponta", quantidade: 2_380, unidade: "kWh", tarifa: 1.79345, valor: 4_268.41 },
      { rotulo: "Demanda", quantidade: 271, unidade: "kW", tarifa: 24.15, valor: 6_544.65 },
      { rotulo: "Consumo F/Ponta", quantidade: 57_050, unidade: "kWh", tarifa: 0.51358, valor: 29_299.73 },
      { rotulo: "En R Exc F/Ponta", quantidade: 1_890, unidade: "kWh", tarifa: 0.3871, valor: 731.61 },
      { rotulo: "Dem Ultr", quantidade: 71, unidade: "kW", tarifa: 48.3, valor: 3_429.3 },
      { rotulo: "Contribuição de Iluminação Pública (COSIP)", quantidade: null, unidade: null, tarifa: null, valor: 377.18 },
    ];

    expect(leitura().itens).toHaveLength(6);
    for (const esperado of esperados) {
      const achado = leitura().itens.find((item) => item.rotulo === esperado.rotulo);
      expect(achado, `item ausente: ${esperado.rotulo}`).toMatchObject(esperado);
    }
  });

  it("a aritmética de cada item fecha", () => {
    expect(leitura().conferencia.confirmados).toBe(5);
    expect(leitura().conferencia.divergentes).toBe(0);
    expect(leitura().conferencia.temDivergencia).toBe(false);
  });

  it("a soma dos itens que compõem o total fecha com o total impresso", () => {
    expect(leitura().invoice.valorTotal).toBe(44_650.88);

    const soma = leitura().itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(44_650.88);
  });

  it("declara exatamente o que ainda depende de conferência humana", () => {
    expect(leitura().camposParaConfirmar).toEqual([]);
  });
});

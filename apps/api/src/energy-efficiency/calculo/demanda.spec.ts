import { PREMISSAS_2026_08 } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { analisarDemanda, classificarAlteracao } from "./demanda.js";

const premissas = PREMISSAS_2026_08;

/** Doze meses estáveis em torno de 400 kW, contrato de 500 kW. */
const HISTORICO_ESTAVEL = [398, 402, 395, 410, 388, 405, 399, 401, 393, 407, 396, 400];

describe("classificação da alteração de demanda", () => {
  it("trata alteração entre 5% e 20% como solicitação simples", () => {
    expect(classificarAlteracao(-0.1, premissas)).toBe("reducao_simples");
    expect(classificarAlteracao(0.15, premissas)).toBe("ampliacao_simples");
  });

  // Abaixo do gatilho o rito não compensa; acima do teto deixa de ser
  // solicitação simples e vira adequação de subestação (REN 1.000/2021).
  it("abaixo de 5% não compensa o rito", () => {
    expect(classificarAlteracao(-0.03, premissas)).toBe("abaixo_do_gatilho");
    expect(classificarAlteracao(0.04, premissas)).toBe("abaixo_do_gatilho");
  });

  it("acima de 20% vira orçamento de conexão, não solicitação simples", () => {
    expect(classificarAlteracao(-0.35, premissas)).toBe("orcamento_de_conexao");
    expect(classificarAlteracao(0.5, premissas)).toBe("orcamento_de_conexao");
  });

  it("usa o módulo: redução e ampliação de mesma magnitude classificam igual", () => {
    expect(classificarAlteracao(-0.25, premissas)).toBe(
      classificarAlteracao(0.25, premissas),
    );
  });
});

describe("análise de demanda", () => {
  const resultado = analisarDemanda({
    demandaContratadaKw: 500,
    historicoKw: HISTORICO_ESTAVEL,
    tarifaDemanda: 30,
    premissas,
  });

  it("mede utilização pelo pico observado e aplica a tolerância de 5%", () => {
    expect(resultado.picoObservadoKw).toBe(410);
    expect(resultado.utilizacao).toBeCloseTo(410 / 500, 6);
    expect(resultado.toleranciaKw).toBeCloseTo(525, 6);
    expect(resultado.houveUltrapassagem).toBe(false);
  });

  it("monta os três cenários", () => {
    expect(resultado.cenarios.map((c) => c.chave)).toEqual([
      "conservador",
      "intermediario",
      "arrojado",
    ]);
  });

  /**
   * A tolerância protege só quem passa do contrato. Usar menos é ociosidade —
   * dinheiro deixado na mesa — e nunca gera multa. Confundir os dois assusta o
   * cliente com um custo inexistente.
   */
  it("trata demanda abaixo do contrato como ociosidade, nunca como multa", () => {
    expect(resultado.ociosidadeMensal).toBeGreaterThan(0);
    for (const cenario of resultado.cenarios) {
      expect(cenario.mesesComMulta).toBe(0);
    }
  });

  it("recomenda o cenário que mais economiza sem gerar multa na janela", () => {
    expect(resultado.recomendado).not.toBeNull();

    const recomendado = resultado.cenarios.find((c) => c.chave === resultado.recomendado);
    expect(recomendado).toBeDefined();
    expect(recomendado?.mesesComMulta).toBe(0);
    // O limite sem multa precisa cobrir o pico: proposta que já nasce multando
    // é risco transferido ao cliente, não economia.
    expect(recomendado?.limiteSemMultaKw ?? 0).toBeGreaterThanOrEqual(
      resultado.picoObservadoKw,
    );
  });

  it("economia é a diferença de demanda contratada vezes a tarifa", () => {
    const recomendado = resultado.cenarios.find((c) => c.chave === resultado.recomendado);
    const esperado = (500 - (recomendado?.demandaPropostaKw ?? 0)) * 30;

    expect(recomendado?.economiaMensal).toBeCloseTo(esperado, 6);
    expect(recomendado?.economiaAnual).toBeCloseTo(esperado * 12, 6);
  });
});

describe("maturidade da análise", () => {
  it("é preliminar com menos de 12 meses e sem memória de massa", () => {
    const curta = analisarDemanda({
      demandaContratadaKw: 500,
      historicoKw: [400, 410, 395],
      tarifaDemanda: 30,
      premissas,
    });

    expect(curta.mesesDeHistorico).toBe(3);
    expect(curta.preliminar).toBe(true);
  });

  it("deixa de ser preliminar com 12 meses", () => {
    expect(
      analisarDemanda({
        demandaContratadaKw: 500,
        historicoKw: HISTORICO_ESTAVEL,
        tarifaDemanda: 30,
        premissas,
      }).preliminar,
    ).toBe(false);
  });

  it("memória de massa dispensa os 12 meses", () => {
    expect(
      analisarDemanda({
        demandaContratadaKw: 500,
        historicoKw: [400, 410],
        tarifaDemanda: 30,
        premissas,
        temMemoriaDeMassa: true,
      }).preliminar,
    ).toBe(false);
  });
});

describe("ultrapassagem", () => {
  it("acusa ultrapassagem só acima do contrato × 1,05", () => {
    // 520 kW passa do contrato de 500, mas fica dentro da tolerância de 525.
    const dentro = analisarDemanda({
      demandaContratadaKw: 500,
      historicoKw: [...HISTORICO_ESTAVEL.slice(0, 11), 520],
      tarifaDemanda: 30,
      premissas,
    });
    expect(dentro.houveUltrapassagem).toBe(false);

    const fora = analisarDemanda({
      demandaContratadaKw: 500,
      historicoKw: [...HISTORICO_ESTAVEL.slice(0, 11), 540],
      tarifaDemanda: 30,
      premissas,
    });
    expect(fora.houveUltrapassagem).toBe(true);
  });

  it("não recomenda nada quando a única saída sai da faixa de solicitação simples", () => {
    // Pico muito abaixo do contrato: reduzir exigiria mais de 20%, o que vira
    // orçamento de conexão em vez de pedido simples.
    const ocioso = analisarDemanda({
      demandaContratadaKw: 1_000,
      historicoKw: [300, 310, 295, 305, 298, 302, 299, 301, 297, 303, 296, 304],
      tarifaDemanda: 30,
      premissas,
    });

    expect(ocioso.recomendado).toBeNull();
    for (const cenario of ocioso.cenarios) {
      expect(cenario.classificacao).toBe("orcamento_de_conexao");
    }
    // Mas a ociosidade continua sendo mostrada: é a dor que justifica o estudo.
    expect(ocioso.ociosidadeMensal).toBeGreaterThan(0);
  });
});

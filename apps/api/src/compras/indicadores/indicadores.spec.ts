import { describe, expect, it } from "vitest";

import {
  assertividadeGlobal,
  assertividadesDeApoio,
  backlogCritico,
  cumprimentoSlaPorEtapa,
  farolEos,
  indicadorCruzado,
  type PassagemParaIndicador,
  type PedidoParaAssertividade,
  type PedidoParaBacklog,
} from "./indicadores";

const PERIODO = { de: new Date("2026-08-01T00:00:00Z"), ate: new Date("2026-08-31T23:59:59Z") };

function pedido(parcial: Partial<PedidoParaAssertividade> = {}): PedidoParaAssertividade {
  return {
    valorOrcado: "1000.00",
    valorCotado: "1000.00",
    valorFaturado: "1000.00",
    origemAtendimento: "aquisicao",
    concluidoEm: new Date("2026-08-15T12:00:00Z"),
    ...parcial,
  };
}

function passagem(parcial: Partial<PassagemParaIndicador> = {}): PassagemParaIndicador {
  return {
    etapa: "cotacoes",
    entrouEm: new Date("2026-08-10T12:00:00Z"),
    prazoEm: new Date("2026-08-17T22:00:00Z"),
    saiuEm: new Date("2026-08-14T12:00:00Z"),
    cumpriuPrazo: true,
    ...parcial,
  };
}

describe("farolEos — as bordas que o POP escreve com desigualdade", () => {
  it.each([
    [100, "verde"],
    [95, "verde"],
    [94.99, "amarelo"],
    [85, "amarelo"],
    [84.99, "vermelho"],
    [0, "vermelho"],
  ] as const)("classifica %s como %s", (valor, esperado) => {
    expect(farolEos(valor)).toBe(esperado);
  });

  it("trata acima de 100% como fora da régua, não como verde", () => {
    expect(farolEos(100.01)).toBe("fora_da_regua");
    expect(farolEos(130)).toBe("fora_da_regua");
  });

  it("devolve nulo sem base de cálculo", () => {
    expect(farolEos(null)).toBeNull();
  });
});

describe("4.1 Assertividade Global", () => {
  it("agrega por soma, não por média de percentuais", () => {
    // Um pedido pequeno com desvio enorme não pode mover o indicador do setor
    // tanto quanto um grande no alvo.
    const resultado = assertividadeGlobal(
      [
        pedido({ valorOrcado: "100000.00", valorFaturado: "100000.00" }),
        pedido({ valorOrcado: "100.00", valorFaturado: "50.00" }),
      ],
      PERIODO,
    );
    expect(resultado.percentual).toBeCloseTo(99.95, 2);
    expect(resultado.farol).toBe("verde");
  });

  it("exclui o caminho de estoque, que não gera faturamento", () => {
    const resultado = assertividadeGlobal(
      [
        pedido(),
        pedido({ origemAtendimento: "estoque", valorFaturado: null, valorCotado: null }),
      ],
      PERIODO,
    );
    expect(resultado.pedidosConsiderados).toBe(1);
    expect(resultado.percentual).toBe(100);
  });

  it("exclui pedido concluído fora do período", () => {
    const resultado = assertividadeGlobal(
      [pedido({ concluidoEm: new Date("2026-07-15T12:00:00Z") })],
      PERIODO,
    );
    expect(resultado.pedidosConsiderados).toBe(0);
    expect(resultado.percentual).toBeNull();
    expect(resultado.farol).toBeNull();
  });

  it("soma em centavos, sem deriva de ponto flutuante", () => {
    const resultado = assertividadeGlobal(
      Array.from({ length: 3 }, () => pedido({ valorOrcado: "0.10", valorFaturado: "0.10" })),
      PERIODO,
    );
    expect(resultado.totalOrcado).toBe("0.30");
    expect(resultado.percentual).toBe(100);
  });
});

describe("diagnóstico — assertividades de apoio", () => {
  it("separa o desvio de negociação do desvio de execução", () => {
    const resultado = assertividadesDeApoio(
      [pedido({ valorOrcado: "1000.00", valorCotado: "1200.00", valorFaturado: "900.00" })],
      PERIODO,
    );
    expect(resultado.orcamentaria.percentual).toBe(120);
    expect(resultado.execucao.percentual).toBe(75);
  });
});

describe("4.2 % Backlog Crítico", () => {
  const abertaVencida = passagem({
    etapa: "cotacoes",
    entrouEm: new Date("2026-08-05T12:00:00Z"),
    prazoEm: new Date("2026-08-12T22:00:00Z"),
    saiuEm: null,
    cumpriuPrazo: null,
  });
  const abertaNoPrazo = passagem({
    etapa: "cotacoes",
    entrouEm: new Date("2026-08-28T12:00:00Z"),
    prazoEm: new Date("2026-09-04T22:00:00Z"),
    saiuEm: null,
    cumpriuPrazo: null,
  });

  function pedidoBacklog(parcial: Partial<PedidoParaBacklog> = {}): PedidoParaBacklog {
    return {
      responsavelId: "resp-1",
      responsavelNome: "Kerolayne",
      createdAt: new Date("2026-08-05T12:00:00Z"),
      concluidoEm: null,
      passagens: [abertaVencida],
      ...parcial,
    };
  }

  it("mede fluxo e estoque juntos: emitidas no período, fila real na data de fim", () => {
    const resultado = backlogCritico(
      [
        pedidoBacklog({ concluidoEm: new Date("2026-08-20T12:00:00Z") }),
        pedidoBacklog(),
        pedidoBacklog({ createdAt: new Date("2026-08-28T12:00:00Z"), passagens: [abertaNoPrazo] }),
      ],
      PERIODO,
    );
    const total = resultado.total;
    expect(total.emitidas).toBe(3);
    expect(total.concluidas).toBe(1);
    expect(total.pendentesVencidas).toBe(1);
    expect(total.pendentesNoPrazo).toBe(1);
    expect(total.percentualBacklogCritico).toBeCloseTo(33.33, 2);
  });

  it("não conta como emitido o pedido criado fora do período", () => {
    const resultado = backlogCritico(
      [pedidoBacklog({ createdAt: new Date("2026-07-20T12:00:00Z") })],
      PERIODO,
    );
    expect(resultado.total.emitidas).toBe(0);
  });

  it("o vencido de semanas atrás continua na fila — era o furo da versão anterior", () => {
    // Emitido em julho, vencido desde então: some das emitidas de agosto, mas
    // segue pendente vencido. Antes ele desaparecia do indicador inteiro.
    const antigo = pedidoBacklog({
      createdAt: new Date("2026-07-20T12:00:00Z"),
      passagens: [
        passagem({
          etapa: "cotacoes",
          entrouEm: new Date("2026-07-21T12:00:00Z"),
          prazoEm: new Date("2026-07-28T22:00:00Z"),
          saiuEm: null,
          cumpriuPrazo: null,
        }),
      ],
    });
    const resultado = backlogCritico([antigo], PERIODO);
    expect(resultado.total.emitidas).toBe(0);
    expect(resultado.total.pendentesVencidas).toBe(1);
  });

  it("passa de 100% quando a fila acumulada supera a vazão da semana — é o alarme", () => {
    const vencidoAntigo = (dia: number) =>
      pedidoBacklog({
        createdAt: new Date(`2026-07-${dia}T12:00:00Z`),
        passagens: [
          passagem({
            etapa: "cotacoes",
            entrouEm: new Date(`2026-07-${dia}T12:00:00Z`),
            prazoEm: new Date("2026-07-28T22:00:00Z"),
            saiuEm: null,
            cumpriuPrazo: null,
          }),
        ],
      });
    const resultado = backlogCritico(
      [vencidoAntigo(10), vencidoAntigo(11), vencidoAntigo(12), pedidoBacklog()],
      PERIODO,
    );
    expect(resultado.total.emitidas).toBe(1);
    expect(resultado.total.pendentesVencidas).toBe(4);
    expect(resultado.total.percentualBacklogCritico).toBe(400);
  });

  it("avalia o estado na data de fim do período, não agora", () => {
    // Concluído em setembro: em agosto ainda é pendente vencido.
    const resultado = backlogCritico(
      [pedidoBacklog({ concluidoEm: new Date("2026-09-10T12:00:00Z") })],
      PERIODO,
    );
    expect(resultado.total.concluidas).toBe(0);
    expect(resultado.total.pendentesVencidas).toBe(1);
  });

  it("ignora pedido que ainda não existia na data de fim do período", () => {
    const resultado = backlogCritico(
      [pedidoBacklog({ createdAt: new Date("2026-09-05T12:00:00Z") })],
      PERIODO,
    );
    expect(resultado.total.emitidas).toBe(0);
    expect(resultado.total.pendentesVencidas).toBe(0);
    expect(resultado.total.pendentesNoPrazo).toBe(0);
  });

  it("o REVISAR não infla a contagem, porque a OS é o pedido", () => {
    const comRevisar = pedidoBacklog({
      passagens: [
        passagem({ etapa: "cotacoes", saiuEm: new Date("2026-08-08T12:00:00Z") }),
        passagem({ etapa: "aprovacao_compra", saiuEm: new Date("2026-08-09T12:00:00Z") }),
        abertaVencida,
      ],
    });
    expect(backlogCritico([comRevisar], PERIODO).total.emitidas).toBe(1);
  });

  it("separa por executor", () => {
    const resultado = backlogCritico(
      [
        pedidoBacklog({ responsavelId: "resp-1", responsavelNome: "Kerolayne" }),
        pedidoBacklog({ responsavelId: "resp-2", responsavelNome: "Diane", passagens: [abertaNoPrazo] }),
      ],
      PERIODO,
    );
    expect(resultado.porExecutor).toHaveLength(2);
    const primeiro = resultado.porExecutor[0];
    expect(primeiro?.responsavelNome).toBe("Kerolayne");
    expect(primeiro?.pendentesVencidas).toBe(1);
  });
});

describe("4.3 Cumprimento de SLA por etapa", () => {
  it("conta as duas passagens do REVISAR separadamente", () => {
    const resultado = cumprimentoSlaPorEtapa(
      [
        passagem({ etapa: "cotacoes", saiuEm: new Date("2026-08-08T12:00:00Z"), cumpriuPrazo: true }),
        passagem({ etapa: "cotacoes", saiuEm: new Date("2026-08-20T12:00:00Z"), cumpriuPrazo: false }),
      ],
      PERIODO,
    );
    const cotacoes = resultado.find((linha) => linha.etapa === "cotacoes");
    expect(cotacoes?.concluidas).toBe(2);
    expect(cotacoes?.noPrazo).toBe(1);
    expect(cotacoes?.percentual).toBe(50);
    expect(cotacoes?.farol).toBe("vermelho");
  });

  it("ignora passagem ainda aberta", () => {
    const resultado = cumprimentoSlaPorEtapa([passagem({ saiuEm: null, cumpriuPrazo: null })], PERIODO);
    expect(resultado.find((linha) => linha.etapa === "cotacoes")?.concluidas).toBe(0);
  });

  it("nunca reporta a etapa concluído, que não é mensurada", () => {
    const resultado = cumprimentoSlaPorEtapa([], PERIODO);
    expect(resultado.some((linha) => linha.etapa === "concluido")).toBe(false);
    expect(resultado).toHaveLength(6);
  });
});

describe("Indicador Cruzado", () => {
  it("mede a aquisição da primeira entrada em cotações à saída do pagamento, incluindo o REVISAR", () => {
    const resultado = indicadorCruzado(
      [
        {
          origemAtendimento: "aquisicao",
          concluidoEm: new Date("2026-08-28T12:00:00Z"),
          passagens: [
            passagem({
              etapa: "analise_estoque",
              entrouEm: new Date("2026-08-03T12:00:00Z"),
              saiuEm: new Date("2026-08-04T12:00:00Z"),
            }),
            // Primeira ida às cotações, depois REVISAR, depois pagamento.
            passagem({
              etapa: "cotacoes",
              entrouEm: new Date("2026-08-04T12:00:00Z"),
              saiuEm: new Date("2026-08-07T12:00:00Z"),
            }),
            passagem({
              etapa: "cotacoes",
              entrouEm: new Date("2026-08-11T12:00:00Z"),
              saiuEm: new Date("2026-08-14T12:00:00Z"),
            }),
            passagem({
              etapa: "pagamento",
              entrouEm: new Date("2026-08-18T12:00:00Z"),
              saiuEm: new Date("2026-08-21T12:00:00Z"),
            }),
          ],
        },
      ],
      PERIODO,
    );
    expect(resultado.tempoMedioAnaliseDiasUteis).toBe(1);
    // 04/08 (terça) → 21/08 (sexta) = 13 dias úteis, acima do corte de 9.
    expect(resultado.tempoMedioAquisicaoDiasUteis).toBe(13);
    expect(resultado.quadrante).toBe("analise_baixa_aquisicao_alta");
  });

  it("deixa o caminho de estoque de fora — não tem ciclo de aquisição", () => {
    const resultado = indicadorCruzado(
      [{ origemAtendimento: "estoque", concluidoEm: new Date("2026-08-15T12:00:00Z"), passagens: [] }],
      PERIODO,
    );
    expect(resultado.pedidosConsiderados).toBe(0);
    expect(resultado.quadrante).toBeNull();
  });
});

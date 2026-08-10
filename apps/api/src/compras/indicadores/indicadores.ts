import {
  COMPRAS_CORTE_ANALISE_DIAS_UTEIS,
  COMPRAS_CORTE_AQUISICAO_DIAS_UTEIS,
  COMPRAS_ETAPAS_MENSURADAS,
  COMPRAS_FAROL_AMARELO_MINIMO,
  COMPRAS_FAROL_VERDE_MAXIMO,
  COMPRAS_FAROL_VERDE_MINIMO,
  type AssertividadeGlobal,
  type BacklogCritico,
  type BacklogCriticoPorExecutor,
  type ComprasEtapa,
  type ComprasOrigemAtendimento,
  type CumprimentoSlaPorEtapa,
  type FarolEos,
  type QuadranteCruzado,
} from "@plugga/shared";

import { diasUteisEntre } from "../sla/dias-uteis";

/**
 * Indicadores do POP-COMP-001 §4, como funções puras sobre linhas já lidas do
 * banco — mesmo padrão de `energy-efficiency/calculo`. O cálculo é a parte que
 * precisa ser conferível sem Postgres, porque é dele que sai o número que a
 * reunião semanal discute.
 *
 * **O scorecard de um período fechado não muda depois.** Todo estado é avaliado
 * na data de fim do período, nunca "agora": um número da semana 32 que mudasse
 * ao ser reaberto na semana 35 não serviria para comparar semanas.
 */

// --- Dinheiro em centavos ------------------------------------------------

/**
 * Somas em centavos inteiros. Decimal(14,2) somado como ponto flutuante começa
 * a divergir do banco em algum lugar da terceira casa, e é o tipo de erro que
 * só aparece quando alguém confere a mão.
 */
function paraCentavos(valor: string | null | undefined): number {
  if (!valor) return 0;
  return Math.round(Number(valor) * 100);
}

function deCentavos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

// --- Farol ---------------------------------------------------------------

/**
 * A régua do POP §4.1/§4.3: verde 95–100, amarelo 85–94, vermelho abaixo de 85.
 *
 * Acima de 100% é `fora_da_regua`, não verde. A tabela do §4.1 define verde
 * como "95% a 100%" e manda abrir o diagnóstico "ao sair da faixa verde";
 * faturar acima do orçado saiu da faixa. Chamar de verde inventaria régua.
 */
export function farolEos(percentual: number | null): FarolEos | null {
  if (percentual === null) return null;
  if (percentual > COMPRAS_FAROL_VERDE_MAXIMO) return "fora_da_regua";
  if (percentual >= COMPRAS_FAROL_VERDE_MINIMO) return "verde";
  if (percentual >= COMPRAS_FAROL_AMARELO_MINIMO) return "amarelo";
  return "vermelho";
}

function percentual(numerador: number, denominador: number): number | null {
  if (denominador === 0) return null;
  return Number(((numerador / denominador) * 100).toFixed(2));
}

// --- 4.1 Assertividade Global -------------------------------------------

export type PedidoParaAssertividade = {
  valorOrcado: string;
  valorCotado: string | null;
  valorFaturado: string | null;
  origemAtendimento: ComprasOrigemAtendimento | null;
  concluidoEm: Date | null;
};

/**
 * Só entram pedidos **concluídos no período** e de **aquisição externa**.
 *
 * O caminho interno fica de fora porque retirar material que já estava no
 * estoque não gera faturamento: incluí-lo com faturado zero afundaria o
 * indicador medindo uma compra que não aconteceu. O POP mede "o desvio ponta a
 * ponta, do planejamento à realização" — sem compra, não há realização a medir.
 */
export function assertividadeGlobal(
  pedidos: readonly PedidoParaAssertividade[],
  periodo: { de: Date; ate: Date },
): AssertividadeGlobal {
  const elegiveis = pedidos.filter(
    (pedido) =>
      pedido.origemAtendimento === "aquisicao" &&
      pedido.concluidoEm !== null &&
      pedido.concluidoEm >= periodo.de &&
      pedido.concluidoEm <= periodo.ate &&
      pedido.valorFaturado !== null,
  );

  const totalOrcado = elegiveis.reduce((soma, pedido) => soma + paraCentavos(pedido.valorOrcado), 0);
  const totalFaturado = elegiveis.reduce((soma, pedido) => soma + paraCentavos(pedido.valorFaturado), 0);
  const valor = percentual(totalFaturado, totalOrcado);

  return {
    percentual: valor,
    farol: farolEos(valor),
    totalOrcado: deCentavos(totalOrcado),
    totalFaturado: deCentavos(totalFaturado),
    pedidosConsiderados: elegiveis.length,
  };
}

/** Diagnóstico do POP §4.1, acionado quando o farol sai do verde. */
export function assertividadesDeApoio(
  pedidos: readonly PedidoParaAssertividade[],
  periodo: { de: Date; ate: Date },
): {
  orcamentaria: { percentual: number | null; totalOrcado: string; totalCotado: string };
  execucao: { percentual: number | null; totalCotado: string; totalFaturado: string };
} {
  const noPeriodo = pedidos.filter(
    (pedido) =>
      pedido.origemAtendimento === "aquisicao" &&
      pedido.concluidoEm !== null &&
      pedido.concluidoEm >= periodo.de &&
      pedido.concluidoEm <= periodo.ate,
  );

  const comCotado = noPeriodo.filter((pedido) => pedido.valorCotado !== null);
  const totalOrcado = comCotado.reduce((soma, p) => soma + paraCentavos(p.valorOrcado), 0);
  const totalCotado = comCotado.reduce((soma, p) => soma + paraCentavos(p.valorCotado), 0);

  const comFaturado = comCotado.filter((pedido) => pedido.valorFaturado !== null);
  const cotadoComFaturado = comFaturado.reduce((soma, p) => soma + paraCentavos(p.valorCotado), 0);
  const totalFaturado = comFaturado.reduce((soma, p) => soma + paraCentavos(p.valorFaturado), 0);

  return {
    orcamentaria: {
      percentual: percentual(totalCotado, totalOrcado),
      totalOrcado: deCentavos(totalOrcado),
      totalCotado: deCentavos(totalCotado),
    },
    execucao: {
      percentual: percentual(totalFaturado, cotadoComFaturado),
      totalCotado: deCentavos(cotadoComFaturado),
      totalFaturado: deCentavos(totalFaturado),
    },
  };
}

// --- 4.2 % Backlog Crítico ----------------------------------------------

export type PassagemParaIndicador = {
  etapa: ComprasEtapa;
  entrouEm: Date;
  prazoEm: Date;
  saiuEm: Date | null;
  cumpriuPrazo: boolean | null;
};

export type PedidoParaBacklog = {
  responsavelId: string | null;
  responsavelNome: string | null;
  createdAt: Date;
  concluidoEm: Date | null;
  passagens: readonly PassagemParaIndicador[];
};

/**
 * A OS é o **pedido**, não a passagem de etapa.
 *
 * O POP §4.2 fala em "OS emitidas vs. pendentes", e o executor responde por uma
 * necessidade, não por cada vez que ela mudou de etapa. Contar passagens faria
 * o REVISAR inflar a fila de quem sofreu a revisão — mediria o formulário, não
 * o trabalho.
 *
 * ## Fluxo e estoque medidos juntos, de propósito
 *
 * `emitidas` e `concluidas` são **fluxo**: o que entrou e o que saiu no período.
 * `pendentesNoPrazo` e `pendentesVencidas` são **estoque**: a fila que existe na
 * data de fim do período, venha ela de quando vier.
 *
 * Uma versão anterior restringia as pendências à coorte emitida no período. A
 * conta fechava bonito — as partes somavam as emitidas e o percentual nunca
 * passava de 100% — mas medindo a coisa errada: um pedido vencido há dez dias
 * saía da conta na semana seguinte, e o indicador voltava a zero com o funil
 * cheio de card atrasado. O POP §4.2 diz "se as pendentes vencidas crescem mais
 * rápido que as concluídas, a demanda está superando a capacidade do time" —
 * sob aquela definição elas não podiam crescer.
 *
 * Consequência aceita: **o percentual pode passar de 100%**, e é exatamente aí
 * que ele está gritando. Fila acumulada maior que a vazão da semana é o alarme,
 * não um erro de cálculo.
 */
export function backlogCritico(
  pedidos: readonly PedidoParaBacklog[],
  periodo: { de: Date; ate: Date },
): BacklogCritico {
  const chaves = new Map<string, { id: string | null; nome: string | null }>();
  for (const pedido of pedidos) {
    const chave = pedido.responsavelId ?? "sem-responsavel";
    if (!chaves.has(chave)) {
      chaves.set(chave, { id: pedido.responsavelId, nome: pedido.responsavelNome });
    }
  }

  const porExecutor = [...chaves.values()]
    .map((dono) =>
      contabiliza(
        dono.id,
        dono.nome,
        pedidos.filter((pedido) => pedido.responsavelId === dono.id),
        periodo,
      ),
    )
    // Só aparece quem teve movimento ou tem fila: executor zerado em tudo é
    // ruído numa reunião que dura quinze minutos.
    .filter((linha) => linha.emitidas + linha.concluidas + linha.pendentesNoPrazo + linha.pendentesVencidas > 0)
    .sort((a, b) => b.pendentesVencidas - a.pendentesVencidas || b.emitidas - a.emitidas);

  return { porExecutor, total: contabiliza(null, null, pedidos, periodo) };
}

function contabiliza(
  responsavelId: string | null,
  responsavelNome: string | null,
  pedidos: readonly PedidoParaBacklog[],
  periodo: { de: Date; ate: Date },
): BacklogCriticoPorExecutor {
  let emitidas = 0;
  let concluidas = 0;
  let pendentesNoPrazo = 0;
  let pendentesVencidas = 0;

  for (const pedido of pedidos) {
    if (pedido.createdAt >= periodo.de && pedido.createdAt <= periodo.ate) {
      emitidas += 1;
    }

    // Todo estado é avaliado na data de fim do período, nunca "agora": é o que
    // faz o scorecard da semana passada dar o mesmo número quando reaberto.
    const jaExistia = pedido.createdAt <= periodo.ate;
    const concluidoAte = pedido.concluidoEm !== null && pedido.concluidoEm <= periodo.ate;

    if (concluidoAte && (pedido.concluidoEm as Date) >= periodo.de) {
      concluidas += 1;
    }

    if (!jaExistia || concluidoAte) {
      continue;
    }

    const aberta = pedido.passagens.find(
      (passagem) => passagem.entrouEm <= periodo.ate && (passagem.saiuEm === null || passagem.saiuEm > periodo.ate),
    );
    if (aberta && aberta.prazoEm < periodo.ate) {
      pendentesVencidas += 1;
    } else {
      pendentesNoPrazo += 1;
    }
  }

  return {
    responsavelId,
    responsavelNome,
    emitidas,
    concluidas,
    pendentesNoPrazo,
    pendentesVencidas,
    percentualBacklogCritico: percentual(pendentesVencidas, emitidas),
  };
}

// --- 4.3 Cumprimento de SLA por etapa ------------------------------------

/**
 * Cada passagem conta uma vez. As duas passagens por Cotações de um pedido que
 * sofreu REVISAR contam como duas, e é exatamente isso que o indicador de
 * processo precisa mostrar: a etapa foi percorrida duas vezes.
 *
 * `concluido` não aparece porque não é etapa mensurada — não tem SLA no §3.
 */
export function cumprimentoSlaPorEtapa(
  passagens: readonly PassagemParaIndicador[],
  periodo: { de: Date; ate: Date },
): CumprimentoSlaPorEtapa[] {
  return COMPRAS_ETAPAS_MENSURADAS.map((etapa) => {
    const fechadas = passagens.filter(
      (passagem) =>
        passagem.etapa === etapa &&
        passagem.saiuEm !== null &&
        passagem.saiuEm >= periodo.de &&
        passagem.saiuEm <= periodo.ate,
    );
    const noPrazo = fechadas.filter((passagem) => passagem.cumpriuPrazo === true).length;
    const valor = percentual(noPrazo, fechadas.length);
    return {
      etapa,
      concluidas: fechadas.length,
      noPrazo,
      percentual: valor,
      farol: farolEos(valor),
    };
  });
}

// --- Indicador Cruzado (diagnóstico, fora do scorecard) ------------------

export type PedidoParaCruzado = {
  origemAtendimento: ComprasOrigemAtendimento | null;
  concluidoEm: Date | null;
  passagens: readonly PassagemParaIndicador[];
};

/**
 * Tempo médio de análise × tempo médio de aquisição, com os cortes do POP §4.3
 * (análise > 2 dias úteis, aquisição > 9 = cotações 5 + aprovação 2 + pagamento 2).
 *
 * A aquisição vai da **primeira** entrada em Cotações à saída de Pagamento, e
 * inclui de propósito todo o tempo gasto em REVISAR: o ciclo que o corte de 9
 * dias mede é o que a operação sente, e uma revisão é justamente o que o faz
 * estourar. Pedidos atendidos pelo estoque ficam de fora — não têm aquisição.
 */
export function indicadorCruzado(
  pedidos: readonly PedidoParaCruzado[],
  periodo: { de: Date; ate: Date },
): {
  tempoMedioAnaliseDiasUteis: number | null;
  tempoMedioAquisicaoDiasUteis: number | null;
  quadrante: QuadranteCruzado | null;
  pedidosConsiderados: number;
} {
  const noPeriodo = pedidos.filter(
    (pedido) =>
      pedido.origemAtendimento === "aquisicao" &&
      pedido.concluidoEm !== null &&
      pedido.concluidoEm >= periodo.de &&
      pedido.concluidoEm <= periodo.ate,
  );

  const analises: number[] = [];
  const aquisicoes: number[] = [];

  for (const pedido of noPeriodo) {
    const analise = pedido.passagens.find((p) => p.etapa === "analise_estoque" && p.saiuEm !== null);
    if (analise?.saiuEm) {
      analises.push(diasUteisEntre(analise.entrouEm, analise.saiuEm));
    }

    const cotacoes = pedido.passagens
      .filter((p) => p.etapa === "cotacoes")
      .sort((a, b) => a.entrouEm.getTime() - b.entrouEm.getTime())[0];
    const pagamento = pedido.passagens
      .filter((p) => p.etapa === "pagamento" && p.saiuEm !== null)
      .sort((a, b) => (b.saiuEm as Date).getTime() - (a.saiuEm as Date).getTime())[0];
    if (cotacoes && pagamento?.saiuEm) {
      aquisicoes.push(diasUteisEntre(cotacoes.entrouEm, pagamento.saiuEm));
    }
  }

  const media = (valores: number[]): number | null =>
    valores.length === 0 ? null : Number((valores.reduce((s, v) => s + v, 0) / valores.length).toFixed(2));

  const tempoMedioAnaliseDiasUteis = media(analises);
  const tempoMedioAquisicaoDiasUteis = media(aquisicoes);

  return {
    tempoMedioAnaliseDiasUteis,
    tempoMedioAquisicaoDiasUteis,
    quadrante: quadranteDe(tempoMedioAnaliseDiasUteis, tempoMedioAquisicaoDiasUteis),
    pedidosConsiderados: noPeriodo.length,
  };
}

function quadranteDe(analise: number | null, aquisicao: number | null): QuadranteCruzado | null {
  if (analise === null || aquisicao === null) return null;
  const analiseAlta = analise > COMPRAS_CORTE_ANALISE_DIAS_UTEIS;
  const aquisicaoAlta = aquisicao > COMPRAS_CORTE_AQUISICAO_DIAS_UTEIS;
  if (analiseAlta && aquisicaoAlta) return "analise_alta_aquisicao_alta";
  if (analiseAlta) return "analise_alta_aquisicao_baixa";
  if (aquisicaoAlta) return "analise_baixa_aquisicao_alta";
  return "analise_baixa_aquisicao_baixa";
}

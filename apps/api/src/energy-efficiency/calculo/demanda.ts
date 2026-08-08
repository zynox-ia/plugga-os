import type {
  DemandChangeClassification,
  DemandResult,
  DemandScenario,
  DemandScenarioKey,
  EnergyPremises,
} from "@plugga/shared";

/**
 * Demanda e demanda ideal, conforme a skill `estudo-demanda-plugga` (modelo V16,
 * congelado em 2026-05-18).
 *
 * Duas regras que se confundem com facilidade e aqui estão separadas:
 *
 * - **A tolerância de 5% vale só para cima.** Entre a contratada e ×1,05 não há
 *   multa; acima disso há penalidade por ultrapassagem.
 * - **Para baixo não existe multa.** Usar menos que o contratado é *demanda
 *   ociosa* — dinheiro deixado na mesa. Apresentar como ociosidade, nunca como
 *   penalidade, porque tratar ociosidade como multa assusta o cliente com um
 *   custo que não existe.
 *
 * Dentro do Estudo de Eficiência Energética isso entra só como resumo na seção
 * de demanda. O Estudo de Demanda completo é outro entregável, com modelo
 * próprio.
 */

/** Histórico mínimo para a análise deixar de ser preliminar. */
export const MESES_PARA_ANALISE_ROBUSTA = 12;

/** Recuos aplicados ao pico observado em cada cenário. */
const FOLGA_POR_CENARIO: Record<DemandScenarioKey, number> = {
  // Contrata acima do pico: praticamente elimina risco de ultrapassagem.
  conservador: 1.02,
  // Contrata no pico: o limite de tolerância vira a margem de segurança.
  intermediario: 1.0,
  // Aposta na tolerância: só não há multa porque o limite é ×1,05.
  arrojado: 0.97,
};

/**
 * Classifica a alteração pedida. Fora da faixa de 5%–20% deixa de ser
 * solicitação simples à distribuidora e vira orçamento de conexão — adequação
 * de subestação, sob a REN ANEEL 1.000/2021 (art. 154 ampliação, art. 155
 * redução com limite de uma a cada 12 meses, arts. 311–314 testes).
 *
 * Abaixo de 5% não compensa o rito: o gatilho mínimo existe para não gastar
 * processo com ganho irrelevante.
 */
export function classificarAlteracao(
  variacao: number,
  premissas: EnergyPremises,
): DemandChangeClassification {
  const modulo = Math.abs(variacao);

  if (modulo < premissas.alteracaoDemandaMinima) return "abaixo_do_gatilho";
  if (modulo > premissas.alteracaoDemandaMaxima) return "orcamento_de_conexao";
  return variacao < 0 ? "reducao_simples" : "ampliacao_simples";
}

export type DemandInput = {
  demandaContratadaKw: number;
  /** Demanda registrada mês a mês, na maior janela disponível. */
  historicoKw: readonly number[];
  tarifaDemanda: number;
  premissas: EnergyPremises;
  /** Curva de 15 min disponível dispensa os 12 meses de histórico. */
  temMemoriaDeMassa?: boolean;
};

function montarCenario(
  chave: DemandScenarioKey,
  entrada: DemandInput,
  picoObservadoKw: number,
): DemandScenario {
  const { demandaContratadaKw, historicoKw, tarifaDemanda, premissas } = entrada;

  const demandaPropostaKw = Math.round(picoObservadoKw * FOLGA_POR_CENARIO[chave]);
  const limiteSemMultaKw = demandaPropostaKw * (1 + premissas.toleranciaUltrapassagem);

  const mesesAcimaDoContrato = historicoKw.filter((kw) => kw > demandaPropostaKw).length;
  const mesesComMulta = historicoKw.filter((kw) => kw > limiteSemMultaKw).length;

  // Economia é a diferença de demanda contratada vezes a tarifa de demanda.
  // Nunca negativa: quando a proposta é maior que a atual, o cenário é de
  // ampliação e o ganho está em evitar multa, não em reduzir conta.
  const economiaMensal = Math.max(
    (demandaContratadaKw - demandaPropostaKw) * tarifaDemanda,
    0,
  );

  const variacao =
    demandaContratadaKw > 0
      ? (demandaPropostaKw - demandaContratadaKw) / demandaContratadaKw
      : 0;

  return {
    chave,
    demandaPropostaKw,
    limiteSemMultaKw,
    mesesAcimaDoContrato,
    mesesComMulta,
    economiaMensal,
    economiaAnual: economiaMensal * 12,
    variacao,
    classificacao: classificarAlteracao(variacao, premissas),
  };
}

export function analisarDemanda(entrada: DemandInput): DemandResult {
  const { demandaContratadaKw, historicoKw, premissas, temMemoriaDeMassa = false } = entrada;

  const picoObservadoKw = historicoKw.length > 0 ? Math.max(...historicoKw) : 0;
  const toleranciaKw = demandaContratadaKw * (1 + premissas.toleranciaUltrapassagem);

  const cenarios = (["conservador", "intermediario", "arrojado"] as const).map((chave) =>
    montarCenario(chave, entrada, picoObservadoKw),
  );

  // A recomendação é o cenário que economiza mais **sem** gerar multa na janela
  // observada — o limite sem multa precisa cobrir o pico. Cenário que já nasce
  // multando não é proposta, é risco transferido ao cliente.
  const elegiveis = cenarios.filter(
    (cenario) =>
      cenario.mesesComMulta === 0 &&
      cenario.limiteSemMultaKw >= picoObservadoKw &&
      cenario.classificacao !== "abaixo_do_gatilho" &&
      cenario.classificacao !== "orcamento_de_conexao",
  );
  const melhor = elegiveis.reduce<DemandScenario | null>(
    (atual, cenario) =>
      atual === null || cenario.economiaMensal > atual.economiaMensal ? cenario : atual,
    null,
  );

  // Ociosidade média: o quanto de demanda contratada ficou sem uso na janela.
  // É o "dinheiro deixado na mesa" que o documento mostra ao cliente.
  const mediaRegistrada =
    historicoKw.length > 0
      ? historicoKw.reduce((soma, kw) => soma + kw, 0) / historicoKw.length
      : 0;
  const ociosidadeMensal =
    Math.max(demandaContratadaKw - mediaRegistrada, 0) * entrada.tarifaDemanda;

  return {
    utilizacao: demandaContratadaKw > 0 ? picoObservadoKw / demandaContratadaKw : 0,
    toleranciaKw,
    houveUltrapassagem: historicoKw.some((kw) => kw > toleranciaKw),
    picoObservadoKw,
    mesesDeHistorico: historicoKw.length,
    preliminar: !temMemoriaDeMassa && historicoKw.length < MESES_PARA_ANALISE_ROBUSTA,
    cenarios,
    recomendado: melhor?.chave ?? null,
    ociosidadeMensal,
  };
}

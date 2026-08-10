/**
 * Relatório de paridade de uma execução.
 *
 * Ele responde ao que o contrato exige: quais versões e hashes entraram, o que
 * cada etapa devolveu, o diff campo a campo e quais exceções normativas foram
 * aplicadas. `approved_divergence` fica visível de propósito — a intenção é que
 * o walkthrough mostre a diferença, não que ela desapareça num teste verde.
 */
import {
  camposReprovados,
  divergenciasAplicadas,
  resultadoGeral,
  type ComparacaoDeCampo,
  type EstadoDaComparacao,
} from "./diff.ts";

export type RelatorioDeParidade = {
  caso: string;
  versaoNormativa: string;
  versaoDoMotor: string;
  versaoDoPython: string;
  hashes: {
    /** Bundle de entrada, calculado antes das duas execuções. */
    entrada: string;
    saidaPython?: string;
    saidaTypeScript?: string;
  };
  campos: ComparacaoDeCampo[];
  divergenciasAplicadas: ComparacaoDeCampo[];
  reprovados: ComparacaoDeCampo[];
  resultado: EstadoDaComparacao;
};

export function montarRelatorio(entrada: {
  caso: string;
  versaoNormativa: string;
  versaoDoMotor: string;
  versaoDoPython: string;
  hashes: RelatorioDeParidade["hashes"];
  campos: ComparacaoDeCampo[];
}): RelatorioDeParidade {
  return {
    ...entrada,
    divergenciasAplicadas: divergenciasAplicadas(entrada.campos),
    reprovados: camposReprovados(entrada.campos),
    resultado: resultadoGeral(entrada.campos),
  };
}

/** Bloqueia CI e promoção da feature flag. */
export function bloqueiaPromocao(relatorio: RelatorioDeParidade): boolean {
  return relatorio.resultado === "failed";
}

export function descreverRelatorio(relatorio: RelatorioDeParidade): string {
  const linhas = [
    `caso: ${relatorio.caso}`,
    `normativa ${relatorio.versaoNormativa} | motor ${relatorio.versaoDoMotor} | python ${relatorio.versaoDoPython}`,
    `entrada ${relatorio.hashes.entrada.slice(0, 12)}…`,
    `resultado: ${relatorio.resultado} (${relatorio.campos.length} campos)`,
  ];

  for (const campo of relatorio.divergenciasAplicadas) {
    linhas.push(`  divergência aprovada — ${campo.campo}: ${campo.regra}`);
  }
  for (const campo of relatorio.reprovados) {
    linhas.push(
      `  REPROVADO — ${campo.campo}: python=${String(campo.python)} ts=${String(campo.typescript)} (${campo.regra})`,
    );
  }

  return linhas.join("\n");
}

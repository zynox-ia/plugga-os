/**
 * Registro das divergências normativas aprovadas.
 *
 * A regra do contrato de paridade é que nenhuma diferença entre o oráculo e o
 * TypeScript passa em silêncio. Ou os dois lados coincidem, ou a diferença está
 * aqui, com fonte, decisão, impacto e aprovação. Divergência não registrada
 * reprova o harness.
 *
 * Este registro é deliberadamente pequeno. Ele cresce por decisão do usuário,
 * nunca por conveniência de implementação.
 */

export type Divergencia = {
  id: string;
  descricao: string;
  fonteA: string;
  fonteB: string;
  decisao: string;
  /** Como o TypeScript se comporta. */
  esperadoNoTypeScript: string;
  /** Casos ou campos onde a diferença aparece. */
  afeta: string[];
  aprovadoPor: string;
  aprovadoEm: string;
};

export const divergenciasAprovadas: readonly Divergencia[] = [
  {
    id: "D-001",
    descricao:
      "A condição do semáforo no Python usa spread > 10×, enquanto o PRD e a própria docstring do script dizem 8×.",
    fonteA: "assets/triagem_semaforo.py — condição `tp / tf > 10`",
    fonteB: "PRD §7 e docstring do próprio triagem_semaforo.py — 8×",
    decisao: "8× é canônico; o 10× do código é erro localizado.",
    esperadoNoTypeScript: "Faixa vermelha acima de 8×.",
    afeta: ["Brasília", "Jatuarana", "Imigrantes"],
    aprovadoPor: "andrejunio-dev",
    aprovadoEm: "2026-08-09",
  },
  {
    id: "D-002",
    descricao:
      "Documentos metodológicos antigos usam TMA 5% e reajuste 4%; motores, planilhas e golden usam 12% e 8%.",
    fonteA: "references/metodologia-calculos.md, references/template-dados.json",
    fonteB: "assets/motor_bess_solar.py (PADRAO), planilhas e golden",
    decisao: "TMA 12% e reajuste 8% são canônicos.",
    esperadoNoTypeScript: "TMA 12% a.a. e reajuste de energia 8% a.a.",
    afeta: ["todos os estudos"],
    aprovadoPor: "andrejunio-dev",
    aprovadoEm: "2026-08-09",
  },
  {
    id: "D-004",
    descricao:
      "O dimensionamento automático do Python é só energético: `n_sug` vem de ceil(consumo / energia útil por BESS), ignorando a potência da unidade.",
    fonteA: "assets/motor_bess_solar.py — `n_sug`",
    fonteB:
      "references/metodologia-calculos.md e SKILL.md — LUNA2000-241-2S1, 241 kWh / 108 kW por unidade",
    decisao:
      "O valor aprovado no caso prevalece. Sem valor aprovado, usa-se o maior dimensionamento entre energia e potência de 108 kW, registrando qual limitou.",
    esperadoNoTypeScript:
      "`n_bess` aprovado quando existir; senão max(energia, potência) com limitador registrado.",
    afeta: ["casos novos sem n_bess aprovado"],
    aprovadoPor: "andrejunio-dev",
    aprovadoEm: "2026-08-09",
  },
];

/**
 * D-003 foi retirada: parecia haver conflito entre o modelo congelado (que
 * mostra VPL com TMA e payback descontado) e o PRD §8.6 (que os proíbe no
 * relatório do cliente). O próprio gerador reconcilia os dois por substituição
 * de rótulo — `VPL com TMA` vira `Acumulado em 20 anos` e `Payback descontado`
 * vira `Payback` (montar_caso_relatorio.py:456-459) — e a Trava 2 confere
 * exatamente TIR, payback simples e acumulado (verificar_relatorio.py:118-124).
 * Não há divergência a aprovar; há comportamento a reproduzir.
 *
 * O SOH do peak shaving também não entra aqui: foi decidido replicar o Python
 * exatamente, inclusive sem aplicar o SOH ao fluxo. Isso é fidelidade, não
 * divergência, e está protegido por teste no motor.
 */
export const divergenciasRetiradas = ["D-003"] as const;

export function buscarDivergencia(id: string): Divergencia | undefined {
  return divergenciasAprovadas.find((d) => d.id === id);
}

import { BadRequestException, ConflictException } from "@nestjs/common";
import type {
  EnergyStudyStatus,
  EnergyTrafficLight,
  ProblemaDeValidacao,
} from "@plugga/shared";

/**
 * Máquina de estados do estudo de eficiência energética.
 *
 * Existe para que as travas do processo deixem de depender de alguém lembrar de
 * conferir. Hoje, no fluxo do agente, o relatório pode ser enviado sem a dupla
 * consulta se quem opera esquecer; aqui o estudo simplesmente não muda de
 * estado enquanto a condição não for satisfeita.
 *
 * Funções puras, compartilhadas entre o repositório real e os dublês de teste —
 * mesmo padrão de `energy.rules.ts` e `commercial.rules.ts`.
 */

/** Para onde cada estado pode ir. Ausente da lista = transição proibida. */
const TRANSICOES: Record<EnergyStudyStatus, readonly EnergyStudyStatus[]> = {
  rascunho: ["aguardando_dados", "dados_recebidos", "cancelado"],
  aguardando_dados: ["dados_recebidos", "cancelado"],
  dados_recebidos: ["dados_recebidos", "em_calculo", "aguardando_dados", "cancelado"],
  // `em_extracao` e `em_auditoria` existem no desenho do processo para quando a
  // leitura da fatura deixar de ser manual; hoje o fluxo pula direto ao cálculo.
  em_extracao: ["dados_recebidos", "em_auditoria", "aguardando_dados", "cancelado"],
  em_auditoria: ["dados_recebidos", "em_calculo", "aguardando_dados", "cancelado"],
  em_calculo: ["dados_recebidos", "relatorio_gerado", "bloqueado", "cancelado"],
  relatorio_gerado: ["dados_recebidos", "em_validacao", "em_calculo", "cancelado"],
  em_validacao: [
    "aprovado_internamente",
    "dados_recebidos",
    "enviado_cliente",
    "bloqueado",
    "em_calculo",
    "cancelado",
  ],
  // Estudo bloqueado volta ao cálculo depois de corrigido; não pula para
  // aprovado, senão a correção passaria sem nova validação.
  bloqueado: ["dados_recebidos", "em_calculo", "aguardando_dados", "cancelado"],
  aprovado_internamente: ["dados_recebidos", "enviado_cliente", "em_calculo", "cancelado"],
  enviado_cliente: ["arquivado"],
  arquivado: [],
  cancelado: [],
};

export function podeTransicionar(de: EnergyStudyStatus, para: EnergyStudyStatus): boolean {
  return (TRANSICOES[de] ?? []).includes(para);
}

export function assertTransicao(de: EnergyStudyStatus, para: EnergyStudyStatus): void {
  if (!podeTransicionar(de, para)) {
    throw new ConflictException(
      `transição inválida: estudo em '${de}' não pode ir para '${para}'`,
    );
  }
}

/**
 * O documento só é liberado quando a validação não aponta nada. É a tradução
 * literal de "não existe HTML quase certo": com qualquer problema, o estudo vai
 * para `bloqueado` em vez de seguir para aprovação.
 */
export function estadoAposValidacao(problemas: readonly ProblemaDeValidacao[]): EnergyStudyStatus {
  return problemas.length === 0 ? "em_validacao" : "bloqueado";
}

/**
 * Aprovar exige validação limpa. Sem esta guarda, um estudo bloqueado poderia
 * ser aprovado por quem não olhou os problemas — e o bloqueio viraria enfeite.
 */
export function assertPodeAprovar(
  status: EnergyStudyStatus,
  problemas: readonly ProblemaDeValidacao[] | null,
): void {
  assertTransicao(status, "aprovado_internamente");

  if (problemas && problemas.length > 0) {
    throw new ConflictException(
      `estudo tem ${problemas.length} problema(s) de validação em aberto; corrija antes de aprovar`,
    );
  }
}

/**
 * Enviar ao cliente exige aprovação humana registrada. É o único ponto do fluxo
 * em que o sistema não pode decidir sozinho: a responsabilidade pelo que sai é
 * de uma pessoa.
 */
export function assertPodeEnviar(
  status: EnergyStudyStatus,
  aprovadoPor: string | null,
  faixa: EnergyTrafficLight | null,
): void {
  assertTransicao(status, "enviado_cliente");

  if (faixa === "vermelho") {
    throw new ConflictException("estudo em faixa vermelha nunca pode ser entregue");
  }

  if (faixa !== "verde" && !aprovadoPor) {
    throw new ConflictException(
      "estudo amarelo não pode ser entregue sem aprovação humana registrada",
    );
  }
}

/**
 * Competência precisa ser um mês real e não pode estar no futuro: fatura de mês
 * que ainda não fechou não existe, e aceitar isso gera estudo que nunca vai
 * receber dado.
 */
export function assertCompetencia(mes: number, ano: number, agora: Date): void {
  if (mes < 1 || mes > 12) {
    throw new BadRequestException("competenceMonth deve estar entre 1 e 12");
  }

  const referencia = ano * 12 + mes;
  const atual = agora.getUTCFullYear() * 12 + (agora.getUTCMonth() + 1);
  if (referencia > atual) {
    throw new BadRequestException("competência no futuro: a fatura do mês ainda não existe");
  }
}

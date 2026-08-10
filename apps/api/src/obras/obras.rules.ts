import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { incidenteGravidadeMinimaQueBloqueia, type ObraEtapa, type RoleKey } from "@plugga/shared";

/**
 * Regras do processo de Execução e Gestão de Obras (POP-OBR-001 §2, §5.1 e
 * §8). Funções puras, no molde de `compras.rules.ts`: valem tanto no
 * repositório de produção quanto nos testes, para o dublê não divergir em
 * silêncio.
 */

// --- Estados do processo (POP §2 e fluxograma FLX-OBR-001) ---------------

/**
 * O grafo do fluxograma. Duas arestas de retorno existem:
 * `em_aprovacao_tecnica → projeto_em_elaboracao` é a revisão do projeto
 * (POP §3, "NÃO" da aprovação técnica); `medicao_tecnica → em_execucao` é a
 * correção de medição (POP §9, "NÃO" da aprovação de medição);
 * `pendencia_campo → em_execucao` é o retorno de qualquer pendência tratada.
 *
 * `projeto_aprovado → projeto_em_elaboracao` (reabertura) **não** está aqui:
 * é uma transição de exceção com guarda própria (`assertReaberturaDeProjeto`),
 * não um caminho normal do fluxo — POP §3, "Para tirar do estado
 * projeto_aprovado".
 */
export const OBRA_TRANSICOES_PERMITIDAS: Record<ObraEtapa, readonly ObraEtapa[]> = {
  obra_criada: ["projeto_em_elaboracao"],
  projeto_em_elaboracao: ["em_aprovacao_tecnica"],
  em_aprovacao_tecnica: ["projeto_aprovado", "projeto_em_elaboracao"],
  projeto_aprovado: ["liberacao_campo_pendente"],
  liberacao_campo_pendente: ["liberada_para_execucao"],
  liberada_para_execucao: ["em_execucao"],
  em_execucao: ["pendencia_campo", "medicao_tecnica"],
  pendencia_campo: ["em_execucao"],
  medicao_tecnica: ["medicao_aprovada", "em_execucao"],
  medicao_aprovada: ["obra_concluida_tecnicamente"],
  obra_concluida_tecnicamente: ["obra_encerrada"],
  obra_encerrada: [],
};

export function assertTransicaoPermitida(de: ObraEtapa, para: ObraEtapa): void {
  if (de === "obra_encerrada") {
    throw new BadRequestException("a obra já foi encerrada e não admite novas transições");
  }
  if (!OBRA_TRANSICOES_PERMITIDAS[de].includes(para)) {
    throw new BadRequestException(`não é possível ir de "${de}" para "${para}"`);
  }
}

/**
 * Afirma a etapa de **origem** da ação, não só a aresta do grafo — mesmo
 * argumento do Compras (`compras.rules.ts`, `assertEtapaAtual`): mais de uma
 * aresta chega no mesmo destino, e validar só o destino aceitaria uma ação
 * vinda de uma origem errada. Concreto aqui: `medicao_tecnica` e
 * `pendencia_campo` chegam ambas em `em_execucao`; sem esta checagem, uma
 * ação que só faz sentido depois de `medicao_tecnica` passaria vindo de
 * `pendencia_campo`.
 */
export function assertEtapaAtual(atual: ObraEtapa, esperada: ObraEtapa): void {
  if (atual !== esperada) {
    throw new BadRequestException(`esta ação pertence à etapa "${esperada}"; a obra está em "${atual}"`);
  }
}

/**
 * Reabrir `projeto_aprovado` (POP §3, "Para tirar do estado projeto_aprovado")
 * exige `engenheiro` com justificativa técnica escrita, ou `diretoria` sem
 * justificativa obrigatória — a mesma dupla porta de exceção que o Compras
 * usa para a dispensa de segregação, porque o motivo é o mesmo: sem porta,
 * alguém contorna por fora do sistema e não sobra registro.
 */
export function assertReaberturaDeProjeto(
  principal: { roles: readonly RoleKey[] },
  justificativa: string | null | undefined,
): void {
  if (principal.roles.includes("diretoria")) {
    return;
  }
  if (!principal.roles.includes("engenheiro")) {
    throw new ForbiddenException(
      "reabrir um projeto aprovado é decisão de engenheiro (com justificativa) ou diretoria",
    );
  }
  if (!justificativa || justificativa.trim().length === 0) {
    throw new BadRequestException("reabertura por engenheiro exige justificativa técnica escrita");
  }
}

// --- Evidência de campo (POP §5.1) ----------------------------------------

/**
 * Evidência é imutável por construção — o POP §5.1 é explícito: "nem admin
 * remove fisicamente evidência pelo sistema operacional padrão". Esta função
 * não protege nada sozinha (o repositório de produção simplesmente não expõe
 * uma rota de DELETE, e o banco reforça via trigger de append-only, igual ao
 * `event_log`); ela existe para o chamador ter onde declarar a intenção e
 * para o teste de contrato ter o que exercitar.
 */
export function assertEvidenciaImutavel(): never {
  throw new ForbiddenException("evidência de obra é append-only; correção gera novo registro");
}

// --- Segurança do trabalho (POP §8) ---------------------------------------

/**
 * POP §8.2: "Sem APR obrigatória assinada, a etapa não deve avançar para
 * execução." A lista de atividades que tornam a APR obrigatória é `em aberto`
 * (POP §7, item 2) — por isso esta função não decide *se* a APR é exigida,
 * só valida que, quando é, as assinaturas mínimas do §8.2 estão completas.
 */
export function assertAprCompleta(apr: {
  segurancaAssinouEm: Date | null;
  supervisorAssinouEm: Date | null;
}): void {
  if (!apr.segurancaAssinouEm || !apr.supervisorAssinouEm) {
    throw new BadRequestException(
      "APR incompleta: faltam as assinaturas mínimas do POP §8.2 (segurança e supervisor)",
    );
  }
}

/**
 * POP §8.1: "Sem EPI obrigatório confirmado, atividade de risco não deve ser
 * liberada." Mesmo raciocínio do EPI obrigatório: a obrigatoriedade por tipo
 * de atividade é `em aberto` (POP §7, item 2); esta função só valida a
 * conferência quando o registro de EPI já existe.
 */
export function assertEpiConferido(epi: { conferidoEm: Date | null; conferidoPorId: string | null }): void {
  if (!epi.conferidoEm || !epi.conferidoPorId) {
    throw new BadRequestException("EPI ainda não conferido — registre a conferência antes de liberar a atividade");
  }
}

/**
 * POP §8.4: liberação de segurança deve ocorrer antes de atividade de risco e
 * pode ser revogada em caso de condição insegura. Uma liberação revogada não
 * volta a valer sozinha — precisa de novo registro, pelo mesmo argumento do
 * §5.1 sobre evidência: revogação apaga o direito de seguir, não o histórico.
 */
export function assertLiberacaoValida(liberacao: {
  liberadoEm: Date;
  revogadoEm: Date | null;
}): void {
  if (liberacao.revogadoEm) {
    throw new ForbiddenException("a liberação de segurança foi revogada; é necessário um novo registro");
  }
}

/**
 * POP §8.3: "Incidente grave bloqueia a etapa até liberação de `seguranca`
 * e/ou `engenheiro`." A escala completa de gravidade é `em aberto` (POP §7,
 * item 2 trata só APR, mas a mesma reserva vale aqui — nenhuma lista fechada
 * de níveis existe no documento); o único ponto fixo é que o nível "grave"
 * bloqueia até haver liberação.
 */
export function incidenteBloqueiaEtapa(incidente: { gravidade: string; liberadoEm: Date | null }): boolean {
  return incidente.gravidade === incidenteGravidadeMinimaQueBloqueia && !incidente.liberadoEm;
}

// --- Regras-mãe de bloqueio (POP §1.2) ------------------------------------

/** POP §1.2, regra 1: técnico não edita orçamento. */
export function assertTecnicoNaoEditaOrcamento(principal: { roles: readonly RoleKey[] }): void {
  const ehSomenteTecnico =
    principal.roles.includes("tecnico") &&
    !principal.roles.includes("financeiro") &&
    !principal.roles.includes("engenheiro") &&
    !principal.roles.includes("diretoria");
  if (ehSomenteTecnico) {
    throw new ForbiddenException("técnico não edita orçamento (POP-OBR-001 §1.2)");
  }
}

/** POP §1.2, regra 2: campo (técnico/supervisor) não altera projeto aprovado. */
export function assertCampoNaoAlteraProjetoAprovado(
  etapaAtual: ObraEtapa,
  principal: { roles: readonly RoleKey[] },
): void {
  const ehCampo = principal.roles.includes("tecnico") || principal.roles.includes("supervisor");
  const naoEhEngenhariaOuDiretoria =
    !principal.roles.includes("engenheiro") && !principal.roles.includes("diretoria");
  if (ehCampo && naoEhEngenhariaOuDiretoria && etapaAtual !== "projeto_em_elaboracao") {
    throw new ForbiddenException("campo não altera projeto fora da elaboração (POP-OBR-001 §1.2)");
  }
}

/** POP §1.2, regra 3: almoxarife não altera cronograma financeiro. */
export function assertAlmoxarifeNaoAlteraCronogramaFinanceiro(principal: { roles: readonly RoleKey[] }): void {
  const ehSomenteAlmoxarife =
    principal.roles.includes("almoxarife") &&
    !principal.roles.includes("financeiro") &&
    !principal.roles.includes("diretoria");
  if (ehSomenteAlmoxarife) {
    throw new ForbiddenException("almoxarife não altera cronograma financeiro (POP-OBR-001 §1.2/§7)");
  }
}

/** POP §1.2, regra 5: financeiro não altera medição técnica. */
export function assertFinanceiroNaoAlteraMedicaoTecnica(principal: { roles: readonly RoleKey[] }): void {
  const ehSomenteFinanceiro =
    principal.roles.includes("financeiro") &&
    !principal.roles.includes("engenheiro") &&
    !principal.roles.includes("diretoria");
  if (ehSomenteFinanceiro) {
    throw new ForbiddenException("financeiro não altera medição técnica (POP-OBR-001 §1.2/§9)");
  }
}

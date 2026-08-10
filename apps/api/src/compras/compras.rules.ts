import { BadRequestException, ForbiddenException } from "@nestjs/common";
import {
  COMPRAS_ALCADA_FINANCEIRO,
  type AcaoBloqueada,
  type ComprasEtapa,
  type RoleKey,
} from "@plugga/shared";

/**
 * Regras do processo de compras (POP-COMP-001 §2 e §3) e a segregação de função
 * que o §1 descreve em três responsáveis.
 *
 * Funções puras, no molde de `commercial.rules.ts`: são compartilhadas pelo
 * repositório Prisma (onde valem de verdade) e pelos testes, para o dublê não
 * divergir em silêncio da produção.
 */

/**
 * O grafo do fluxograma. `aprovacao_compra → cotacoes` é o REVISAR, o único
 * retorno do processo; `concluido` não tem saída porque é terminal.
 */
export const TRANSICOES_PERMITIDAS: Record<ComprasEtapa, readonly ComprasEtapa[]> = {
  pedido_gerado: ["analise_estoque"],
  analise_estoque: ["cotacoes", "retirada"],
  cotacoes: ["aprovacao_compra"],
  aprovacao_compra: ["pagamento", "cotacoes"],
  pagamento: ["retirada"],
  retirada: ["concluido"],
  concluido: [],
};

export function assertTransicaoPermitida(de: ComprasEtapa, para: ComprasEtapa): void {
  if (de === "concluido") {
    throw new BadRequestException("o pedido já foi concluído e não admite novas transições");
  }
  if (!TRANSICOES_PERMITIDAS[de].includes(para)) {
    throw new BadRequestException(`não é possível ir de "${de}" para "${para}"`);
  }
}

/**
 * Afirma a etapa de **origem** da ação. Validar só a aresta do grafo não basta.
 *
 * `retirada` e `cotacoes` têm dois antecessores cada, então há arestas que
 * existem para um caminho e seriam aceitas indevidamente por outro. O caso que
 * isso fecha é concreto: `analise_estoque → retirada` existe para o ramo SIM do
 * fluxograma, e sem esta checagem um POST em `/pagamento` sobre um pedido ainda
 * na análise de estoque passaria pela aresta e registraria pagamento de uma
 * compra que **nunca foi aprovada** — o POP §2.4 é explícito: "com a compra
 * aprovada externamente, a tarefa avança para Provisionamento/Pagamento".
 *
 * Pior que o pagamento indevido: o pedido ficaria sem `origemAtendimento`, e
 * por isso fora da Assertividade Global. O dinheiro sai e some do indicador.
 */
export function assertEtapaAtual(atual: ComprasEtapa, esperada: ComprasEtapa): void {
  if (atual !== esperada) {
    throw new BadRequestException(
      `esta ação pertence à etapa "${esperada}"; o pedido está em "${atual}"`,
    );
  }
}

/** Sair de Cotações exige as duas caixas que o fluxograma desenha nessa faixa. */
export function assertPodeSeguirParaAprovacao(pedido: {
  necessidadeValidadaEm: Date | null;
  cotacaoSelecionadaId: string | null;
}): void {
  if (!pedido.necessidadeValidadaEm) {
    throw new BadRequestException(
      "valide a necessidade do material antes de mandar para aprovação",
    );
  }
  if (!pedido.cotacaoSelecionadaId) {
    throw new BadRequestException("selecione a cotação antes de mandar para aprovação");
  }
}

/** O POP §2.4 manda liquidar "conforme o orçamento aprovado": sem valor, não há liquidação. */
export function assertPagamentoTemFaturado(valorFaturado: string | null | undefined): void {
  if (!valorFaturado || Number(valorFaturado) <= 0) {
    throw new BadRequestException("registrar pagamento exige o valor faturado");
  }
}

/**
 * O POP §3 diz que o prazo "deve ser renegociado antes do vencimento quando
 * necessário". Depois de vencido não existe renegociação — existe atraso, e
 * reescrever o prazo apagaria o que o indicador 4.3 precisa contar.
 */
export function assertPodeRenegociarPrazo(prazoEm: Date | null, agora: Date): void {
  if (!prazoEm) {
    throw new BadRequestException("não há etapa aberta para renegociar");
  }
  if (agora > prazoEm) {
    throw new BadRequestException(
      "o prazo desta etapa já venceu; renegociação só vale antes do vencimento (POP §3)",
    );
  }
}

// --- Segregação de função ------------------------------------------------

/**
 * Os quatro pares que nunca podem cair na mesma pessoa dentro de um pedido.
 *
 * Não são quatro pessoas: bastam duas em papéis diferentes. Cada par fecha uma
 * das brechas clássicas do ciclo de compras — aprovar o que você mesmo pediu,
 * aprovar o fornecedor que você mesmo escolheu, pagar o que você mesmo aprovou,
 * e atestar a entrega do fornecedor que você mesmo escolheu.
 */
export type ParDeSegregacao =
  | "criou_e_aprova"
  | "cotou_e_aprova"
  | "aprovou_e_paga"
  | "cotou_e_recebe";

const MOTIVO: Record<ParDeSegregacao, string> = {
  criou_e_aprova: "quem abriu o pedido não pode aprová-lo",
  cotou_e_aprova: "quem selecionou a cotação não pode aprovar a compra",
  aprovou_e_paga: "quem aprovou a compra não pode registrar o pagamento",
  cotou_e_recebe: "quem selecionou a cotação não pode confirmar o recebimento",
};

export type PedidoParaSegregacao = {
  solicitanteId: string;
  selecionouCotacaoId: string | null;
  aprovouId: string | null;
};

/** Pares violados por esta pessoa neste pedido, para a ação pedida. */
export function paresViolados(
  acao: "aprovar" | "pagar" | "receber",
  pedido: PedidoParaSegregacao,
  principalId: string,
): ParDeSegregacao[] {
  const violados: ParDeSegregacao[] = [];
  if (acao === "aprovar") {
    if (pedido.solicitanteId === principalId) violados.push("criou_e_aprova");
    if (pedido.selecionouCotacaoId === principalId) violados.push("cotou_e_aprova");
  }
  if (acao === "pagar" && pedido.aprovouId === principalId) {
    violados.push("aprovou_e_paga");
  }
  if (acao === "receber" && pedido.selecionouCotacaoId === principalId) {
    violados.push("cotou_e_recebe");
  }
  return violados;
}

/**
 * Aplica a segregação, com uma saída de emergência que precisa doer.
 *
 * Vai existir o dia em que só uma pessoa está disponível. Uma regra sem escape
 * seria contornada por fora do sistema — alguém logaria com a conta de outro —
 * e aí não sobra registro nenhum. Então a dispensa existe, só a diretoria pode
 * usá-la, exige justificativa escrita, vira evento próprio e aparece contada no
 * scorecard. Quebrar é possível; quebrar em silêncio, não.
 */
export function assertSegregacao(
  acao: "aprovar" | "pagar" | "receber",
  pedido: PedidoParaSegregacao,
  principal: { id: string; roles: readonly RoleKey[] },
  dispensa?: string,
): { dispensada: boolean; pares: ParDeSegregacao[] } {
  const pares = paresViolados(acao, pedido, principal.id);
  if (pares.length === 0) {
    return { dispensada: false, pares: [] };
  }

  const explicacao = pares.map((par) => MOTIVO[par]).join("; ");
  if (!dispensa) {
    throw new ForbiddenException(`segregação de função: ${explicacao}`);
  }
  if (!principal.roles.includes("diretoria")) {
    throw new ForbiddenException(
      `só a diretoria pode dispensar a segregação de função (${explicacao})`,
    );
  }
  return { dispensada: true, pares };
}

/**
 * Quem confirma o recebimento é **quem pediu o material**.
 *
 * Divergência consciente do POP §2.2/§2.5, que dá o CONCLUIR ao Responsável de
 * Compras. O motivo é a terceira separação do ciclo de compras: quem escolheu o
 * fornecedor não deve atestar que a mercadoria dele chegou. E a segunda pessoa
 * não precisa ser inventada — o POP já a nomeia ao dizer que o responsável
 * "informa o repasse/entrega do produto ao solicitante". Quem está com o
 * material na mão é o solicitante.
 *
 * Vantagem sobre exigir um segundo comprador: não depende do tamanho da equipe
 * de Compras. Todo pedido tem solicitante por construção.
 *
 * A saída de emergência é a diretoria confirmar no lugar dele — por escrito, e
 * registrada como desvio. Solicitante de férias não pode travar uma entrega.
 */
export function assertConfirmacaoDeRecebimento(
  pedido: { solicitanteId: string },
  principal: { id: string; roles: readonly RoleKey[] },
  confirmacaoPorTerceiro?: string,
): { porTerceiro: boolean } {
  if (pedido.solicitanteId === principal.id) {
    return { porTerceiro: false };
  }
  if (!confirmacaoPorTerceiro) {
    throw new ForbiddenException(
      "o recebimento é confirmado por quem pediu o material; a diretoria pode confirmar no lugar dele com justificativa",
    );
  }
  if (!principal.roles.includes("diretoria")) {
    throw new ForbiddenException("só a diretoria confirma recebimento no lugar do solicitante");
  }
  return { porTerceiro: true };
}

// --- Alçada de aprovação -------------------------------------------------

/**
 * Quem pode aprovar uma compra deste valor.
 *
 * Com `COMPRAS_ALCADA_FINANCEIRO` nulo — o padrão — a resposta é sempre
 * `financeiro`, que é exatamente o que o POP descreve: ele não define faixa de
 * valor. Definir um teto liga o degrau da diretoria sem mudar mais nada.
 */
export function papeisQuePodemAprovar(valor: string | null): readonly RoleKey[] {
  if (COMPRAS_ALCADA_FINANCEIRO === null) {
    return ["financeiro", "diretoria"];
  }
  const acimaDaAlcada = valor !== null && Number(valor) > COMPRAS_ALCADA_FINANCEIRO;
  return acimaDaAlcada ? ["diretoria"] : ["financeiro", "diretoria"];
}

export function assertAlcada(valor: string | null, roles: readonly RoleKey[]): void {
  const permitidos = papeisQuePodemAprovar(valor);
  if (!permitidos.some((papel) => roles.includes(papel))) {
    throw new ForbiddenException(
      `compras acima de R$ ${COMPRAS_ALCADA_FINANCEIRO} são aprovadas pela diretoria`,
    );
  }
}

// --- Leitura: o que a tela deve desabilitar ------------------------------

/**
 * Ações indisponíveis para esta pessoa neste pedido, com o motivo.
 *
 * A tela mostra o botão desabilitado com a explicação em vez de escondê-lo:
 * botão que some faz a pessoa procurar onde não existe, e a segregação só
 * ensina alguma coisa se for visível no momento em que atrapalha.
 */
export function acoesBloqueadas(
  pedido: PedidoParaSegregacao & { etapa: ComprasEtapa; valorCotado: string | null },
  principal: { id: string; roles: readonly RoleKey[] },
): AcaoBloqueada[] {
  const bloqueadas: AcaoBloqueada[] = [];

  if (pedido.etapa === "aprovacao_compra") {
    for (const par of paresViolados("aprovar", pedido, principal.id)) {
      bloqueadas.push({ acao: "aprovacao", motivo: MOTIVO[par] });
    }
    if (!papeisQuePodemAprovar(pedido.valorCotado).some((papel) => principal.roles.includes(papel))) {
      bloqueadas.push({ acao: "aprovacao", motivo: "valor acima da sua alçada de aprovação" });
    }
  }

  if (pedido.etapa === "pagamento") {
    for (const par of paresViolados("pagar", pedido, principal.id)) {
      bloqueadas.push({ acao: "pagamento", motivo: MOTIVO[par] });
    }
  }

  if (pedido.etapa === "retirada") {
    if (pedido.solicitanteId !== principal.id && !principal.roles.includes("diretoria")) {
      bloqueadas.push({
        acao: "recebimento",
        motivo: "só quem pediu o material confirma o recebimento",
      });
    }
    for (const par of paresViolados("receber", pedido, principal.id)) {
      bloqueadas.push({ acao: "recebimento", motivo: MOTIVO[par] });
    }
  }

  return bloqueadas;
}

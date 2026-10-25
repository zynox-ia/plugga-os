import { departamentos, type Departamento } from "@plugga/shared";

/**
 * Quem faz o quê em Compras, no modelo de 4 papéis. Admin e desenvolvedor
 * passam em todas por regra do guard. A segregação de função do POP-COMP-001
 * §1 (quem cota não aprova, quem aprova não paga, quem escolheu o fornecedor
 * não atesta o recebimento) é por identidade, em `compras.rules.ts`, e não por
 * papel: duas pessoas do mesmo departamento continuam separadas.
 */

/** Quem enxerga o funil e o scorecard: Suprimentos opera, o Financeiro decide. */
export const LER_COMPRAS: Departamento[] = ["suprimentos", "financeiro"];

/**
 * Abrir pedido é de quem precisa do material, em qualquer departamento: o
 * engenheiro em obra, o técnico, o administrativo.
 */
export const ABRIR_PEDIDO: Departamento[] = [...departamentos];

/** Triagem, estoque, necessidade e seleção de cotação: Suprimentos. */
export const OPERAR_COMPRAS: Departamento = "suprimentos";

/**
 * Confirmar recebimento é de **quem pediu o material**, então a rota fica tão
 * aberta quanto abrir pedido; a autorização de verdade é por pedido
 * (`assertConfirmacaoDeRecebimento`), comparando a identidade de quem confirma
 * com o solicitante.
 */
export const CONFIRMAR_RECEBIMENTO: Departamento[] = ABRIR_PEDIDO;

/** Aprovação e pagamento: gerente do Financeiro (com nível `gerente`). */
export const DECIDIR_FINANCEIRO: Departamento = "financeiro";

/** Renegociar prazo é gestão de fluxo: cabe aos dois lados do processo. */
export const RENEGOCIAR_PRAZO: Departamento[] = ["suprimentos", "financeiro"];

/** Cadastrar fornecedor e obra de apoio: ponto de controle de quem compra e de quem paga. */
export const CADASTRAR_APOIO: Departamento[] = ["suprimentos", "financeiro"];

import type { RoleKey } from "@plugga/shared";

/**
 * Matriz de permissão **por ação**, não por rota.
 *
 * A segregação de função separa ações, então declarar um `@Roles` genérico na
 * classe do controller apagaria justamente a distinção que o POP-COMP-001 §1
 * faz entre Responsável de Compras e Gestão Financeira.
 *
 * `admin` fica de fora do fluxo de propósito: administra plataforma, acesso e
 * papéis — não compra. Deixá-lo aprovar esvaziaria a segregação exatamente para
 * quem tem a chave mestra, que é o oposto do que o controle serve.
 */

/** Quem enxerga o funil e o scorecard. Leitura é ampla; decidir é que não é. */
export const LER_COMPRAS: readonly RoleKey[] = [
  "compras",
  "financeiro",
  "diretoria",
  "admin",
  "tech",
  "viewer",
];

/**
 * Abrir pedido é capacidade de quem trabalha no departamento, não papel.
 * Quem precisa de material é o engenheiro em obra, o técnico, o administrativo
 * — o `ComprasEscopoRepository` já exige acesso ao departamento Financeiro da
 * empresa, e é esse o filtro que importa aqui.
 */
export const ABRIR_PEDIDO: readonly RoleKey[] = [
  "compras",
  "financeiro",
  "diretoria",
  "opm",
  "comercial",
  "pluggamob",
  "tech",
];

/** Responsável de Compras: triagem, estoque, necessidade, seleção de cotação. */
export const OPERAR_COMPRAS: readonly RoleKey[] = ["compras"];

/**
 * Confirmar recebimento é de **quem pediu o material**, não de um papel.
 *
 * Por isso a lista aqui é larga — a mesma de quem pode abrir pedido, mais nada:
 * o solicitante pode ser o engenheiro em obra, o técnico ou o administrativo, e
 * qualquer um deles precisa alcançar a rota. A autorização de verdade é por
 * pedido (`assertConfirmacaoDeRecebimento`), comparando a identidade de quem
 * confirma com o solicitante daquele pedido. Um papel não teria como expressar
 * isso: "ser o solicitante deste pedido" não é um papel.
 */
export const CONFIRMAR_RECEBIMENTO: readonly RoleKey[] = ABRIR_PEDIDO;

/** Gestão Financeira: aprovação e pagamento. Diretoria entra pela alçada. */
export const DECIDIR_FINANCEIRO: readonly RoleKey[] = ["financeiro", "diretoria"];

/** Renegociar prazo é gestão de fluxo: cabe aos dois lados do processo. */
export const RENEGOCIAR_PRAZO: readonly RoleKey[] = ["compras", "financeiro", "diretoria"];

/** Cadastrar fornecedor é ponto de controle: fica com Compras. */
export const CADASTRAR_APOIO: readonly RoleKey[] = ["compras", "financeiro"];

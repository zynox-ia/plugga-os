/**
 * Notas fiscais (PLU-361), protótipo visual: a tela existe só no desenvolvimento
 * (o localhost do André) e nos testes unitários, com dados de exemplo, para o
 * André aprovar o desenho antes do cadastro real (modelo, API e banco). O mesmo
 * critério do protótipo do Centro de custo (PLU-362).
 *
 * É um portão mais estreito que o do Financeiro (lib/recursos.ts): não tem
 * variável que o ligue, então nenhum build de produção o abre, nem o da CI com
 * `NEXT_PUBLIC_FINANCEIRO_HABILITADO=true` (o `next build` roda com `NODE_ENV`
 * `production`). Fechado, o item do menu fica em breve e a rota responde 404.
 * Sem `NODE_ENV` conhecido, fica fechado (falha fechada).
 */
export type AmbienteDoPrototipo = { NODE_ENV?: string };

export const ROTA_DAS_NOTAS_FISCAIS = "/financeiro/notas-fiscais";

export function prototipoDasNotasFiscais(ambiente: AmbienteDoPrototipo = { NODE_ENV: process.env.NODE_ENV }): boolean {
  return ambiente.NODE_ENV === "development" || ambiente.NODE_ENV === "test";
}

/** Rota e status do item "Notas fiscais" no menu do Financeiro. */
export function itemDasNotasFiscais(ambiente?: AmbienteDoPrototipo): { rota: string; status: "parcial" } | { status: "em-breve" } {
  return prototipoDasNotasFiscais(ambiente) ? { rota: ROTA_DAS_NOTAS_FISCAIS, status: "parcial" } : { status: "em-breve" };
}

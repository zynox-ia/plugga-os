/** O que a lista conta, para a paginação ("Mostrando 1–6 de 23 negócios"). */
export type EntidadeDaLista = "leads" | "negocios" | "clientes" | "membros" | "fornecedores";

const SINGULAR: Record<EntidadeDaLista, string> = { clientes: "cliente", leads: "lead", negocios: "negócio", membros: "membro", fornecedores: "fornecedor" };
const PLURAL: Record<EntidadeDaLista, string> = { clientes: "clientes", leads: "leads", negocios: "negócios", membros: "membros", fornecedores: "fornecedores" };

/** O nome com acento: a chave ("negocios") nunca aparece crua na tela. */
export const rotuloDaEntidade = (entidade: EntidadeDaLista, total: number): string => (total === 1 ? SINGULAR : PLURAL)[entidade];

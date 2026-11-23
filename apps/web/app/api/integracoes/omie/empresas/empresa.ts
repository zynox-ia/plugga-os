/** O web só confere que a empresa é uma das conhecidas antes de repassar; a API decide o acesso. */
const EMPRESAS = new Set(["plugga", "waze"]);

export const ehEmpresaDoOmie = (empresa: string): boolean => EMPRESAS.has(empresa);

export function empresaDoOmieInvalida(): Response {
  return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "Empresa desconhecida." }, { status: 400 });
}

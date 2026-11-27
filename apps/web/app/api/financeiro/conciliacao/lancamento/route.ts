import { proxyApiMutation } from "../../../../lib/proxy";

/** Criação guiada de uma linha sem par: a receita ou a despesa, conciliada, ou sem conciliar com outro valor. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/conciliacao/lancamento");
}

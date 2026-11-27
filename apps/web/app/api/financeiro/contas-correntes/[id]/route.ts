import { proxyApiMutation } from "../../../../lib/proxy.ts";

/** Edita a conta corrente: nome, banco, agência, número, saldo inicial e situação (só a gerência; a API confere). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", "/financeiro/contas-correntes/:id", { id });
}

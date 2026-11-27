import { proxyApiMutation } from "../../../../lib/proxy.ts";

/** Edita a categoria: nome, natureza, grupo, situação e a marca das tarifas bancárias (só a gerência; a API confere). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "PATCH", "/financeiro/categorias/:id", { id });
}

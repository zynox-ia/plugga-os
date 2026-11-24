import { proxyApiMutation } from "../../../../../../lib/proxy";

/** Chave PIX e dados bancários completos, com o motivo; a API grava quem pediu (PLU-334). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", "/suprimentos/fornecedores/:id/dados-de-pagamento/revelar", { id });
}

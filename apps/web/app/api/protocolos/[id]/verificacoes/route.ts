import { proxyApiMutation } from "../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Registrar uma verificação: o resultado é a nova situação, e a próxima verificação vira o lembrete. */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", "/protocolos/:id/verificacoes", { id });
}

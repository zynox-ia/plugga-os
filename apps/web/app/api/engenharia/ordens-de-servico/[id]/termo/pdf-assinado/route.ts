import { proxyar } from "../../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Alternativa ao termo na tela: o PDF assinado à parte (multipart, campo `arquivo`); conclui a O.S. */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/engenharia/ordens-de-servico/:id/termo/pdf-assinado", ids: { id }, corpo: "multipart" });
}

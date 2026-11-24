import { proxyar } from "../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Foto do laudo (multipart, campo `arquivo`); responde a ficha. */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/engenharia/ordens-de-servico/:id/fotos", ids: { id }, corpo: "multipart" });
}

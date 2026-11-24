import { proxyar } from "../../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Anexar um documento à obra (multipart: arquivo, categoria, substitui). */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "POST", modelo: "/engenharia/obras/:id/documentos", ids: { id }, corpo: "multipart" });
}

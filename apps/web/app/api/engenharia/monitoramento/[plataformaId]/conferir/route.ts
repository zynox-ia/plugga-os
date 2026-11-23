import { idDePlataformaSchema } from "@plugga/shared";

import { proxyar } from "../../../../../lib/proxy";

type Contexto = { params: Promise<{ plataformaId: string }> };

/** Conferir uma plataforma (multipart: empresa, resultados e o `print`). */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { plataformaId } = await params;
  // O id da plataforma entra no caminho: só o formato do contrato (minúsculas, números e hífen).
  if (!idDePlataformaSchema.safeParse(plataformaId).success) return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "plataforma inválida" }, { status: 400 });
  return proxyar(request, { metodo: "POST", modelo: `/engenharia/monitoramento/${plataformaId}/conferir`, corpo: "multipart" });
}

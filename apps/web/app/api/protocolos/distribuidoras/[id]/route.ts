import { idDeDistribuidoraSchema } from "@plugga/shared";

import { proxyar } from "../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Editar a distribuidora (nome, sigla, UF, ativa). O id é um slug, validado aqui. */
export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  if (!idDeDistribuidoraSchema.safeParse(id).success) return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "distribuidora inválida" }, { status: 400 });
  return proxyar(request, { metodo: "PATCH", modelo: `/protocolos/distribuidoras/${id}` });
}

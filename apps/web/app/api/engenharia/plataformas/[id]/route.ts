import { idDePlataformaSchema } from "@plugga/shared";

import { proxyar } from "../../../../lib/proxy";

type Contexto = { params: Promise<{ id: string }> };

/** Editar a plataforma (nome, onde está o acesso, ativa). */
export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  if (!idDePlataformaSchema.safeParse(id).success) return Response.json({ codigo: "REQUISICAO_INVALIDA", message: "plataforma inválida" }, { status: 400 });
  return proxyar(request, { metodo: "PATCH", modelo: `/engenharia/plataformas/${id}` });
}

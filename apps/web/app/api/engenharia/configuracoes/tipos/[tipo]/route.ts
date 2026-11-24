import { ehTipoDeOrdem } from "../../../../../lib/engenharia";
import { proxyar } from "../../../../../lib/proxy";

type Contexto = { params: Promise<{ tipo: string }> };

/** Prazo padrão e quem agenda um tipo de O.S. (só gerente da Engenharia; a API confere). */
export async function PUT(request: Request, { params }: Contexto): Promise<Response> {
  const { tipo } = await params;
  // O tipo entra no caminho: só os do contrato.
  if (!ehTipoDeOrdem(tipo)) return Response.json({ codigo: "NAO_ENCONTRADO", message: "tipo de O.S. desconhecido" }, { status: 404 });
  return proxyar(request, { metodo: "PUT", modelo: `/engenharia/configuracoes/tipos/${tipo}` });
}

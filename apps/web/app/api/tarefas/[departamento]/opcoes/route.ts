import { proxyar } from "../../../../lib/proxy";
import { ehDepartamentoComTarefas } from "../../../../lib/tarefas";

type Contexto = { params: Promise<{ departamento: string }> };

/** Pessoas do departamento, categorias já usadas e se a pessoa pode criar. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { departamento } = await params;
  if (!ehDepartamentoComTarefas(departamento)) return Response.json({ codigo: "NAO_ENCONTRADO", message: "departamento sem Tarefas" }, { status: 404 });
  return proxyar(request, { metodo: "GET", modelo: `/tarefas/${departamento}/opcoes` });
}

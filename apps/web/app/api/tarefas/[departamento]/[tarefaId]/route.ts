import { proxyar } from "../../../../lib/proxy";
import { ehDepartamentoComTarefas } from "../../../../lib/tarefas";

type Contexto = { params: Promise<{ departamento: string; tarefaId: string }> };

/** A definição da tarefa, com as próximas ocorrências. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { departamento, tarefaId } = await params;
  if (!ehDepartamentoComTarefas(departamento)) return Response.json({ codigo: "NAO_ENCONTRADO", message: "departamento sem Tarefas" }, { status: 404 });
  return proxyar(request, { metodo: "GET", modelo: `/tarefas/${departamento}/:tarefaId`, ids: { tarefaId } });
}

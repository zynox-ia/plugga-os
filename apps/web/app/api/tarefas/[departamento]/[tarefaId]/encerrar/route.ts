import { proxyApiMutation } from "../../../../../lib/proxy";
import { ehDepartamentoComTarefas } from "../../../../../lib/tarefas";

type Contexto = { params: Promise<{ departamento: string; tarefaId: string }> };

/** Encerrar: a recorrente para de gerar ocorrências (com motivo). */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { departamento, tarefaId } = await params;
  if (!ehDepartamentoComTarefas(departamento)) return Response.json({ codigo: "NAO_ENCONTRADO", message: "departamento sem Tarefas" }, { status: 404 });
  return proxyApiMutation(request, "POST", `/tarefas/${departamento}/:tarefaId/encerrar`, { tarefaId });
}

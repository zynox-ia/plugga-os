import { proxyar } from "../../../../../../lib/proxy";
import { ehDepartamentoComTarefas } from "../../../../../../lib/tarefas";

type Contexto = { params: Promise<{ departamento: string; id: string }> };

/** Concluir a ocorrência (multipart: resultado, checklist "0,2" e o arquivo `evidencia`). */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { departamento, id } = await params;
  if (!ehDepartamentoComTarefas(departamento)) return Response.json({ codigo: "NAO_ENCONTRADO", message: "departamento sem Tarefas" }, { status: 404 });
  return proxyar(request, { metodo: "POST", modelo: `/tarefas/${departamento}/ocorrencias/:id/concluir`, ids: { id }, corpo: "multipart" });
}

import { proxyar } from "../../../../../../../lib/proxy";
import { ehDepartamentoComTarefas } from "../../../../../../../lib/tarefas";

type Contexto = { params: Promise<{ departamento: string; id: string; evidenciaId: string }> };

/** A evidência da conclusão, em linha. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { departamento, id, evidenciaId } = await params;
  if (!ehDepartamentoComTarefas(departamento)) return Response.json({ codigo: "NAO_ENCONTRADO", message: "departamento sem Tarefas" }, { status: 404 });
  return proxyar(request, { metodo: "GET", modelo: `/tarefas/${departamento}/ocorrencias/:id/evidencias/:evidenciaId`, ids: { id, evidenciaId }, resposta: "arquivo" });
}

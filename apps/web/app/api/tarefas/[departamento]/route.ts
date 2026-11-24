import { proxyApiMutation, proxyar } from "../../../lib/proxy";
import { ehDepartamentoComTarefas } from "../../../lib/tarefas";

type Contexto = { params: Promise<{ departamento: string }> };
const fora = () => Response.json({ codigo: "NAO_ENCONTRADO", message: "departamento sem Tarefas" }, { status: 404 });

/** Tarefas do departamento (PLU-349, PLU-340): a lista, para o navegador; a tela lê no servidor. */
export async function GET(request: Request, { params }: Contexto): Promise<Response> {
  const { departamento } = await params;
  if (!ehDepartamentoComTarefas(departamento)) return fora();
  return proxyar(request, { metodo: "GET", modelo: `/tarefas/${departamento}`, consulta: new URL(request.url).search });
}

/** Nova tarefa, única ou recorrente. */
export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const { departamento } = await params;
  if (!ehDepartamentoComTarefas(departamento)) return fora();
  return proxyApiMutation(request, "POST", `/tarefas/${departamento}`);
}

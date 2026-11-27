import { proxyar } from "../../../../../../lib/proxy";

/** O que o diálogo "Criar tarifa" já traz preenchido. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/conciliacao/movimentos/:id/tarifa", ids: { id } });
}

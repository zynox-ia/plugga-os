import { proxyar } from "../../../lib/proxy";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyar(request, { metodo: "PUT", modelo: "/pipelines/:id", ids: { id } });
}

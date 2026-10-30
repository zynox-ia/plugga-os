import { proxyApiMutation } from "../../../../lib/proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyApiMutation(request, "POST", "/negocios/:id/perda", { id });
}

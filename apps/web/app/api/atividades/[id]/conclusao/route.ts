import { proxyApiMutation } from "../../../../lib/proxy.ts";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return proxyApiMutation(request, "POST", "/atividades/:id/conclusao", await params);
}

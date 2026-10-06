import { proxyApiMutation } from "../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/clientes");
}

import { proxyComprasPost } from "../../../lib/compras-proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyComprasPost(request, "fornecedores");
}

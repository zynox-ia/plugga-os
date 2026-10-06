import { proxyComprasPost } from "../../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyComprasPost(request, "obras");
}

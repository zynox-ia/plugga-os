import { proxyCommercialPost } from "../../../lib/commercial-proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyCommercialPost(request, "contracts");
}

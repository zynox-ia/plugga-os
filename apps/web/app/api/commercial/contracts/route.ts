import { proxyCommercialPost } from "../../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyCommercialPost(request, "contracts");
}

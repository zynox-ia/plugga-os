import { proxyEnergyPost } from "../../../lib/energy-proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyEnergyPost(request, "audits");
}

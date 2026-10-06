import { proxyEnergyPost } from "../../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyEnergyPost(request, "market-migrations");
}

import { proxyApiMutation } from "../../lib/proxy.ts";

export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/leads");
}

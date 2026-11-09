import { proxyAuthGet } from "../../../../lib/proxy";

export async function GET(request: Request): Promise<Response> {
  const response = await proxyAuthGet(request, "mfa/challenge");
  response.headers.set("cache-control", "no-store");
  return response;
}

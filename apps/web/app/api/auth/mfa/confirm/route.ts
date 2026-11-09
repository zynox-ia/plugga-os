import { proxyAuthPost } from "../../../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  const response = await proxyAuthPost(request, "mfa/confirm");
  response.headers.set("cache-control", "no-store");
  return response;
}

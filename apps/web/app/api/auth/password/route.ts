import { proxyAuthPost } from "../../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  const response = await proxyAuthPost(request, "password");
  response.headers.set("cache-control", "no-store");
  return response;
}

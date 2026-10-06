import { proxyAuthPost } from "../../../lib/proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyAuthPost(request, "login");
}

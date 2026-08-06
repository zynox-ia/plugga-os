import { proxyAuthPost } from "../../../lib/auth-proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyAuthPost(request, "accept-invite");
}

import { proxyAuthPost } from "../../../../../../lib/proxy";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const response = await proxyAuthPost(request, "mfa/users/:id/remove", { id });
  response.headers.set("cache-control", "no-store");
  return response;
}

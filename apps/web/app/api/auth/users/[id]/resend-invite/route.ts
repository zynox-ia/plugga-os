import { proxyAuthPost } from "../../../../../lib/auth-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyAuthPost(request, `users/${encodeURIComponent(id)}/resend-invite`);
}

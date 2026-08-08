import { proxyAuthPut } from "../../../../../lib/auth-proxy";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyAuthPut(request, `users/${encodeURIComponent(id)}/access`);
}

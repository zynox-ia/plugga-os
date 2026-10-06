import { proxyAuthPut } from "../../../../../lib/proxy";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return proxyAuthPut(request, `users/:id/access`, { id });
}

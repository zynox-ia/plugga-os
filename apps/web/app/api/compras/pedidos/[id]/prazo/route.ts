import { proxyComprasPost } from "../../../../../lib/compras-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return proxyComprasPost(request, `pedidos/${id}/prazo?companyId=${companyId}`);
}

import { proxyCommercialPost } from "../../../../../lib/commercial-proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyCommercialPost(request, `opportunities/${id}/revisit`);
}

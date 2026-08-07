import { proxyEnergyPost } from "../../../../../lib/energy-proxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyEnergyPost(request, `cycles/${id}/close`);
}

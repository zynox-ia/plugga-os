import { apiBaseUrl } from "../../../../../lib/env";

/**
 * Serve o relatório do estudo sob a origem do web.
 *
 * O documento é HTML com CSS e logos embutidos, sem recurso externo — abrir
 * numa aba nova basta para conferir antes de aprovar, e é dele que o PDF é
 * gerado. O cookie de sessão é repassado para a API decidir o acesso; o web não
 * julga permissão por conta própria.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const cookie = request.headers.get("cookie");

  const resposta = await fetch(`${apiBaseUrl()}/energy-efficiency/studies/${id}/document`, {
    headers: cookie ? { cookie } : {},
    cache: "no-store",
  });

  if (!resposta.ok) {
    return new Response("relatório indisponível", { status: resposta.status });
  }

  return new Response(await resposta.text(), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

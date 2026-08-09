import { apiBaseUrl } from "../../../../../../lib/env";

/** Proxy autenticado da versão HTML para celular. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const cookie = request.headers.get("cookie");
  const resposta = await fetch(
    `${apiBaseUrl()}/energy-efficiency/studies/${id}/document.mobile`,
    { headers: cookie ? { cookie } : {}, cache: "no-store" },
  );

  if (!resposta.ok) return new Response("versão celular indisponível", { status: resposta.status });
  return new Response(await resposta.text(), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

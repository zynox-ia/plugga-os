import { apiBaseUrl } from "../../../../../../lib/env";

/**
 * Serve o PDF do estudo sob a origem do web.
 *
 * Mesmo desenho da rota do HTML ao lado: repassa o cookie de sessão e deixa a
 * API decidir o acesso. O que muda é que a conversão abre um Chromium na API,
 * então a espera é de segundos e não de milissegundos — daí o tempo limite
 * folgado e o corpo repassado como stream, sem carregar o arquivo inteiro na
 * memória do web.
 */
const TEMPO_LIMITE_MS = 90_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const cookie = request.headers.get("cookie");

  let resposta: Response;
  try {
    resposta = await fetch(`${apiBaseUrl()}/energy-efficiency/studies/${id}/document.pdf`, {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (erro) {
    // Sem isto, o estouro do tempo limite ou a API fora do ar rejeitam para
    // fora do handler e o Next serve a página genérica de erro — que, como o
    // botão navega na mesma aba, **substitui a tela do estudo**. A pessoa perde
    // o que estava vendo e não fica sabendo o que houve.
    const expirou = erro instanceof Error && erro.name === "TimeoutError";
    return new Response(
      expirou
        ? "a geração do PDF passou do tempo limite; tente de novo em instantes"
        : "não foi possível falar com a API para gerar o PDF",
      { status: 504, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (!resposta.ok || !resposta.body) {
    // A mensagem da API é repassada: ela distingue "estudo bloqueado na
    // validação" de "navegador indisponível", e quem opera precisa saber qual
    // dos dois é. O JSON cru na aba do navegador não diria nada.
    const detalhe = (await resposta.json().catch(() => null)) as { message?: string } | null;
    return new Response(detalhe?.message ?? `não foi possível gerar o PDF (${resposta.status})`, {
      status: resposta.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(resposta.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition":
        resposta.headers.get("content-disposition") ?? `attachment; filename="estudo.pdf"`,
      "cache-control": "no-store",
    },
  });
}

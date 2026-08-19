import { NextResponse } from "next/server";

import { apiBaseUrl } from "./env";
import { clientForwardedFor } from "./forwarded-for";
import { isOriginAllowed } from "./origin-check";

const FETCH_TIMEOUT_MS = 5_000;
/** Upload de orçamentos é mais lento que uma mutação comum. */
const FETCH_TIMEOUT_UPLOAD_MS = 30_000;

async function relayUpstream(upstream: Response): Promise<NextResponse> {
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

/** Encaminha uma mutação JSON de Compras para apps/api, levando o cookie de sessão. */
export async function proxyComprasPost(request: Request, apiPath: string): Promise<NextResponse> {
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ message: "origin not allowed" }, { status: 403 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 0) {
    try {
      JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ message: "request body must be valid JSON" }, { status: 400 });
    }
  }

  const cookie = request.headers.get("cookie");
  const forwardedFor = clientForwardedFor(request);

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/compras/${apiPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: rawBody.length > 0 ? rawBody : "{}",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "serviço de compras indisponível" }, { status: 503 });
  }

  return relayUpstream(upstream);
}

/**
 * Encaminha a criação do pedido, que é `multipart`.
 *
 * Os proxies existentes só sabem repassar JSON, e aqui não dá: o POP exige o
 * orçamento anexado **na geração do pedido**, então corpo e arquivos viajam
 * juntos. O `FormData` é remontado em vez de repassado cru porque o
 * `content-type` precisa carregar o `boundary` que o `fetch` gera — reaproveitar
 * o cabeçalho de entrada apontaria para um boundary que não existe mais.
 */
export async function proxyComprasUpload(request: Request, apiPath: string): Promise<NextResponse> {
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ message: "origin not allowed" }, { status: 403 });
  }

  let entrada: FormData;
  try {
    entrada = await request.formData();
  } catch {
    return NextResponse.json({ message: "corpo precisa ser multipart/form-data" }, { status: 400 });
  }

  const saida = new FormData();
  for (const [chave, valor] of entrada.entries()) {
    saida.append(chave, valor);
  }

  const cookie = request.headers.get("cookie");
  const forwardedFor = clientForwardedFor(request);

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/compras/${apiPath}`, {
      method: "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: saida,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_UPLOAD_MS),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "serviço de compras indisponível" }, { status: 503 });
  }

  return relayUpstream(upstream);
}

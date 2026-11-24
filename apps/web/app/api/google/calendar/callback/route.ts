import { handleGoogleCalendarCallback } from "../../../../lib/google-calendar-callback";

/**
 * URI de redirecionamento do app OAuth do Google (agenda da pessoa). É um
 * endereço FIXO, cadastrado no Google Cloud: nunca recebe o destino em query.
 * O `code` e o `state` chegam aqui e seguem para a API; a pessoa volta para a
 * aba de integrações sem eles na URL.
 */
export async function GET(request: Request): Promise<Response> {
  return handleGoogleCalendarCallback(request);
}

// O retorno traz um código de uso único: nunca servido de cache.
export const dynamic = "force-dynamic";

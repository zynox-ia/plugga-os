import { handleGoogleCallback } from "../../../../lib/google-callback";

/**
 * `login_uri` registrado no Google Cloud. É um endereço FIXO — nunca recebe o
 * destino do deep link em query — porque o Google só aceita callbacks
 * previamente cadastrados, e um parâmetro variável aqui seria mais uma entrada
 * de fora capaz de escolher para onde a pessoa é mandada depois de autenticar.
 */
export async function POST(request: Request): Promise<Response> {
  return handleGoogleCallback(request);
}

// O corpo é postado pelo Google e não pode ser servido de cache em hipótese
// alguma; a rota é dinâmica por natureza.
export const dynamic = "force-dynamic";

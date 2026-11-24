import { PRAZO_DO_ZIP_MS } from "../../../lib/cobranca-manual";
import { proxyar } from "../../../lib/proxy";

/** Os comprovantes atuais do período num .zip, com o nome padronizado (até 500 arquivos). */
export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "/financeiro/comprovantes.zip", consulta: new URL(request.url).search, resposta: "arquivo", tempoMaximoMs: PRAZO_DO_ZIP_MS });
}

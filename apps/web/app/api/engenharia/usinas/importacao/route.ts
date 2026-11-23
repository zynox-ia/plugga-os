import { proxyar } from "../../../../lib/proxy";

/** Importação da planilha de levantamento (multipart: arquivo, mapeamento, empresaPadrao, gravar). */
export async function POST(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "POST", modelo: "/engenharia/usinas/importacao", corpo: "multipart" });
}

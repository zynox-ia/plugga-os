import { proxyar } from "../../../lib/proxy";

/** O liga/desliga da consulta de CNPJ e CEP sob a origem do web. A API decide o acesso (só desenvolvedor). */

export async function GET(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "GET", modelo: "integracoes/cadastro" });
}

export async function PUT(request: Request): Promise<Response> {
  return proxyar(request, { metodo: "PUT", modelo: "integracoes/cadastro" });
}

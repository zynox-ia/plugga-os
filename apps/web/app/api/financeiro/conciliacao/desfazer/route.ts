import { proxyApiMutation } from "../../../../lib/proxy";

/** Desfaz uma conciliação. A API só aceita da gerência, com motivo. */
export async function POST(request: Request): Promise<Response> {
  return proxyApiMutation(request, "POST", "/financeiro/conciliacao/desfazer");
}

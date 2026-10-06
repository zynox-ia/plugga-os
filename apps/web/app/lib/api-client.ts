import "server-only";

import { headers } from "next/headers";

import {
  lerApi as lerApiCore,
  type ContextoDaApi,
  type EsquemaDeResposta,
  type OpcoesDeLeitura,
  type ResultadoApi,
} from "./api-core";
import { apiBaseUrl } from "./env";
import { clientForwardedFor } from "./forwarded-for";
import { encaminharOrigem } from "./origin-check";

export type { ContextoDaApi, ErroDeApi, ResultadoApi, TipoDeErroApi } from "./api-core";

/**
 * Cliente único de API do servidor (US12, T120). Repassa cookie, `X-Forwarded-For`
 * (só com `WEB_TRUST_PROXY`, conforme `forwarded-for.ts`) e `Origin` (US11/T119)
 * da requisição que está sendo renderizada.
 */
export async function contextoDaRequisicao(): Promise<ContextoDaApi> {
  const entrada = await headers();
  const requisicao = new Request("http://interno.local/", { headers: entrada });
  const cookie = entrada.get("cookie");
  const encaminhado = clientForwardedFor(requisicao);
  return {
    baseUrl: apiBaseUrl(),
    cabecalhos: {
      ...(cookie ? { cookie } : {}),
      ...(encaminhado ? { "x-forwarded-for": encaminhado } : {}),
      ...encaminharOrigem(requisicao),
    },
  };
}

export async function lerApi<T>(
  modelo: string,
  schema: EsquemaDeResposta<T>,
  ids: Record<string, string> = {},
  opcoes: OpcoesDeLeitura = {},
): Promise<ResultadoApi<T>> {
  return lerApiCore(await contextoDaRequisicao(), modelo, schema, ids, opcoes);
}

import { Injectable } from "@nestjs/common";
import type { ContaConsultadaDaAutentique } from "@plugga/shared";

import { AutentiqueFalhouError, AutentiquePort } from "./autentique.port";

const ENDPOINT = "https://api.autentique.com.br/v2/graphql";
const PRAZO_MS = 8_000;

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/**
 * API GraphQL da Autentique. O token vai no cabeçalho `Authorization`; nenhum erro
 * ou log daqui inclui o token, a causa da falha de rede nem o corpo da resposta:
 * só o motivo curto.
 */
@Injectable()
export class AutentiqueHttpAdapter extends AutentiquePort {
  async consultarConta(token: string): Promise<ContaConsultadaDaAutentique> {
    let resposta: Response;
    try {
      resposta = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: "query { me { name email } }" }),
        signal: AbortSignal.timeout(PRAZO_MS),
      });
    } catch {
      throw new AutentiqueFalhouError("indisponivel");
    }

    if (resposta.status === 401 || resposta.status === 403) throw new AutentiqueFalhouError("token_invalido");
    if (resposta.status === 429) throw new AutentiqueFalhouError("limite_de_envio");
    if (!resposta.ok) throw new AutentiqueFalhouError("indisponivel");

    let corpo: { data?: { me?: { name?: unknown; email?: unknown } | null } | null; errors?: unknown[] };
    try {
      corpo = (await resposta.json()) as typeof corpo;
    } catch {
      throw new AutentiqueFalhouError("resposta_inesperada");
    }
    // A conta só está confirmada se a Autentique devolveu o usuário dono do token.
    const me = corpo.data?.me;
    if (!me || typeof me !== "object") throw new AutentiqueFalhouError("resposta_inesperada");
    return { nome: texto(me.name), email: texto(me.email) };
  }
}

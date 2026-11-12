import type { ContaConsultadaDaAutentique } from "@plugga/shared";

/** A Autentique recusou ou não respondeu. Só o motivo curto, nunca o token nem o corpo da resposta. */
export class AutentiqueFalhouError extends Error {
  constructor(readonly motivo: "token_invalido" | "limite_de_envio" | "resposta_inesperada" | "indisponivel") {
    super(`autentique falhou: ${motivo}`);
  }
}

/**
 * Porta da Autentique. Ninguém no sistema fala com a API direto: a tela e, mais
 * adiante, os contratos passam por aqui, e os testes usam um dublê.
 *
 * Por ora só confirma a conta. A criação do documento para assinatura entra
 * quando o fluxo de contrato for ligado, com o modelo de documento e os
 * signatários decididos.
 */
export abstract class AutentiquePort {
  abstract consultarConta(token: string): Promise<ContaConsultadaDaAutentique>;
}

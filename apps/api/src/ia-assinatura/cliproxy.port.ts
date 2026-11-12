import type { ContaDeAssinatura, LoginDeAssinatura, ProvedorDeAssinatura, SituacaoDoLogin } from "@plugga/shared";

/** O proxy recusou ou não respondeu. Só o motivo curto, nunca a chave nem o corpo da resposta. */
export class CliProxyFalhouError extends Error {
  constructor(readonly motivo: "nao_configurado" | "fora_do_ar" | "chave_recusada" | "resposta_inesperada") {
    super(`cliproxy falhou: ${motivo}`);
  }
}

/**
 * Porta do proxy de CLI (CLIProxyAPI). Fala com a API de gerenciamento dele só para
 * o login e a lista de contas, e com a API de modelos só para conferir a conexão.
 * Os tokens de login moram no disco do proxy e nunca chegam ao Plugga OS.
 */
export abstract class CliProxyPort {
  abstract configurado(): boolean;
  /** O proxy responde? Não gasta cota da assinatura. */
  abstract saude(): Promise<boolean>;
  abstract iniciarLogin(provedor: ProvedorDeAssinatura): Promise<LoginDeAssinatura>;
  abstract situacaoDoLogin(estado: string): Promise<SituacaoDoLogin>;
  abstract listarContas(provedor: ProvedorDeAssinatura): Promise<ContaDeAssinatura[]>;
  abstract removerConta(arquivo: string): Promise<void>;
  /** Ids de modelo que o proxy oferece para o provedor. Conferir a conexão sem gastar cota. */
  abstract listarModelos(provedor: ProvedorDeAssinatura): Promise<string[]>;
}

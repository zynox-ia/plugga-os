import type { EmpresaDoOmie } from "@plugga/shared";

/**
 * `modo_sem_escrita`: a integração não está em `write`, então nada é gravado no OMIE.
 * `escrita_nao_liberada`: está em `write`, mas o método de escrita ainda não foi
 * conferido no Aplicativo Teste (D7 do desenho); até lá, nenhuma escrita sai.
 */
export type MotivoDaFalhaDoOmie =
  | "credenciais_invalidas" | "limite_de_consumo" | "recusada" | "resposta_inesperada" | "indisponivel"
  | "modo_mock" | "modo_sem_escrita" | "escrita_nao_liberada";

/** O OMIE recusou ou não respondeu. Só o motivo curto, nunca a chave, o segredo nem o corpo da resposta. */
export class OmieFalhouError extends Error {
  constructor(readonly motivo: MotivoDaFalhaDoOmie) {
    super(`omie falhou: ${motivo}`);
  }
}

export type CredenciaisDoOmie = { appKey: string; appSecret: string };

/**
 * Porta do OMIE. Ninguém no sistema fala com a API direto: a tela e, mais adiante,
 * os fluxos de cliente, pedido e nota passam por aqui, e os testes usam um dublê.
 *
 * Por ora só confirma a conta. Cliente, pedido de venda e emissão de NF-e e NFS-e
 * entram quando o fluxo de venda ganha tela, com os campos e o ambiente de testes
 * do OMIE conferidos contra a documentação do método de cada um.
 */
export abstract class OmiePort {
  abstract consultarEmpresa(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie>;
  /** Todas as empresas que o par alcança: a conferência por empresa (PLU-342) bloqueia se vier mais de uma. */
  abstract listarEmpresas(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie[]>;
}

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
 * Uma categoria do plano de contas, como o `ListarCategorias` devolve (geral/categorias,
 * lida em 23/11/2026). O grupo é a categoria totalizadora apontada por `grupo`.
 */
export type CategoriaDoOmie = {
  codigo: string;
  descricao: string;
  /** `categoria_superior`: o código do grupo. */
  grupo: string | null;
  receita: boolean;
  despesa: boolean;
  /** `totalizadora`: é um grupo, não recebe lançamento. */
  totalizadora: boolean;
  transferencia: boolean;
  /** Nem `conta_inativa` nem `nao_exibir`. */
  ativa: boolean;
};

/** Uma conta corrente, como o `ListarContasCorrentes` devolve (geral/contacorrente, lida em 23/11/2026). */
export type ContaCorrenteDoOmie = {
  /** `nCodCC`. */
  codigo: string;
  descricao: string;
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  ativa: boolean;
};

/**
 * Porta do OMIE. Ninguém no sistema fala com a API direto: a tela e, mais adiante,
 * os fluxos de cliente, pedido e nota passam por aqui, e os testes usam um dublê.
 *
 * Lê a conta e os cadastros do Financeiro (PLU-342). Escrita, cliente, pedido de
 * venda e NF-e e NFS-e entram com os campos e o ambiente de testes do OMIE conferidos
 * contra a documentação do método de cada um.
 */
export abstract class OmiePort {
  abstract consultarEmpresa(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie>;
  /** Todas as empresas que o par alcança: a conferência por empresa (PLU-342) bloqueia se vier mais de uma. */
  abstract listarEmpresas(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie[]>;
  /** O plano de contas inteiro, com os grupos, paginado. */
  abstract listarCategorias(credenciais: CredenciaisDoOmie): Promise<CategoriaDoOmie[]>;
  /** Todas as contas correntes, paginado. */
  abstract listarContasCorrentes(credenciais: CredenciaisDoOmie): Promise<ContaCorrenteDoOmie[]>;
}

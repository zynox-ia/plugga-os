import type { BloqueioDaConexaoOmie, EmpresaDoOmie, SituacaoDaConexaoOmie } from "@plugga/shared";

/**
 * Conferência do par do OMIE de uma empresa (PLU-342). Puro: o serviço passa o
 * que o OMIE devolveu, o CNPJ do cadastro e o CNPJ já confirmado da outra empresa.
 *
 * O par identifica a empresa (o OMIE não tem outro seletor), então ele só é usado
 * quando o ListarEmpresas devolve uma empresa só e com o CNPJ certo.
 */
export type ResultadoDoTeste =
  | { tipo: "bloqueada"; bloqueio: BloqueioDaConexaoOmie }
  | { tipo: "conectada"; cnpj: string; razaoSocial: string | null }
  | { tipo: "a_confirmar"; cnpj: string; razaoSocial: string | null };

/** O que se sabe da outra empresa da conta: o CNPJ do cadastro e o confirmado. */
export type OutraEmpresa = { cnpjDoCadastro: string | null; cnpjConfirmado: string | null };

export function avaliarTeste(
  empresas: readonly EmpresaDoOmie[],
  cnpjDoCadastro: string | null,
  outra: OutraEmpresa,
): ResultadoDoTeste {
  if (empresas.length !== 1) return { tipo: "bloqueada", bloqueio: empresas.length === 0 ? "sem_cnpj" : "mais_de_uma_empresa" };
  const [empresa] = empresas as [EmpresaDoOmie];
  if (!empresa.cnpj) return { tipo: "bloqueada", bloqueio: "sem_cnpj" };
  // O par que devolve o CNPJ da outra empresa (cadastrado ou já confirmado) é o par dela.
  if (empresa.cnpj === outra.cnpjDoCadastro || empresa.cnpj === outra.cnpjConfirmado) return { tipo: "bloqueada", bloqueio: "cnpj_de_outra_empresa" };
  if (cnpjDoCadastro && empresa.cnpj !== cnpjDoCadastro) return { tipo: "bloqueada", bloqueio: "cnpj_diferente_do_cadastro" };
  return { tipo: cnpjDoCadastro ? "conectada" : "a_confirmar", cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial };
}

/** Quantas empresas do teste se guardam: o bastante para mostrar o bloqueio. */
export const EMPRESAS_GUARDADAS_DO_TESTE = 2;

export type EstadoGuardado = {
  /** Quando o par em uso foi gravado; nulo sem par. */
  segredoAtualizadoEm: Date | null;
  /** O par existe mas não abre (a chave-mestra mudou). */
  ilegivel: boolean;
  conexao: {
    segredoAtualizadoEm: Date;
    ultimoTesteEm: Date | null;
    bloqueio: BloqueioDaConexaoOmie | null;
    confirmadaEm: Date | null;
  } | null;
};

/** A versão do par conferida é a que está gravada? (milissegundos, como o Prisma grava.) */
const mesmaVersao = (a: Date, b: Date) => a.getTime() === b.getTime();

export function situacaoDaConexao(e: EstadoGuardado): SituacaoDaConexaoOmie {
  if (!e.segredoAtualizadoEm) return "nao_conectada";
  if (e.ilegivel) return "ilegivel";
  const c = e.conexao;
  // Teste ou confirmação de um par anterior não valem para o par de agora.
  if (!c || !mesmaVersao(c.segredoAtualizadoEm, e.segredoAtualizadoEm) || !c.ultimoTesteEm) return "a_testar";
  if (c.bloqueio) return "bloqueada";
  return c.confirmadaEm ? "conectada" : "a_confirmar";
}

/** A outra empresa da conta (são duas). */
export const outraEmpresa = (empresa: "plugga" | "waze"): "plugga" | "waze" => (empresa === "plugga" ? "waze" : "plugga");

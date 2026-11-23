import type { Acesso, BloqueioDaConexaoOmie, CompanyKey, ConexaoOmieDaEmpresa, EstadoDasConexoesOmie, SituacaoDaConexaoOmie } from "@plugga/shared";

/**
 * O cartão do OMIE em Configurações › Integrações (PLU-342): uma conta OMIE com
 * as duas empresas dentro, cada uma com o seu par conferido pelo CNPJ.
 */

type Tom = "neutral" | "info" | "success" | "warning" | "danger";

export const SELO_DA_SITUACAO: Record<SituacaoDaConexaoOmie, { tom: Tom; texto: string }> = {
  nao_conectada: { tom: "neutral", texto: "Não conectada" },
  a_testar: { tom: "info", texto: "A testar" },
  a_confirmar: { tom: "info", texto: "A confirmar" },
  conectada: { tom: "success", texto: "Conectada" },
  bloqueada: { tom: "danger", texto: "Bloqueada" },
  ilegivel: { tom: "warning", texto: "Requer atenção" },
};

const NOME: Record<CompanyKey, string> = { plugga: "Plugga", waze: "Waze Energia" };

/** Quantas empresas o último teste devolveu (o OMIE manda no máximo duas na lista, com o total à parte). */
export const empresasNoTeste = (c: Pick<ConexaoOmieDaEmpresa, "ultimoTeste">): number => c.ultimoTeste?.total ?? c.ultimoTeste?.empresas.length ?? 0;

/** Por que o teste bloqueou a conexão, em uma frase que diz o que fazer. */
export function textoDoBloqueio(bloqueio: BloqueioDaConexaoOmie, empresa: CompanyKey, quantasEmpresas = 0): string {
  switch (bloqueio) {
    case "mais_de_uma_empresa": return `O OMIE devolveu ${quantasEmpresas > 1 ? `${quantasEmpresas} empresas` : "mais de uma empresa"} com esta chave. Use a chave do aplicativo só desta empresa.`;
    case "cnpj_de_outra_empresa": return "Esta chave é da outra empresa: o CNPJ dela já está confirmado lá. Use a chave do aplicativo desta empresa.";
    case "cnpj_diferente_do_cadastro": return `O CNPJ que o OMIE devolveu não é o do cadastro da ${NOME[empresa]}. Confira a chave ou o CNPJ do cadastro.`;
    case "sem_cnpj": return "O OMIE não devolveu o CNPJ da empresa: não dá para conferir para onde vão os lançamentos.";
  }
}

/** O selo do cartão inteiro: o pior estado entre as empresas manda. */
export function seloDoCartao(estado: EstadoDasConexoesOmie | null): { tom: Tom; texto: string } {
  if (!estado) return { tom: "neutral", texto: "Consultando" };
  const situacoes = estado.conexoes.map((c) => c.situacao);
  if (situacoes.some((s) => s === "bloqueada" || s === "ilegivel")) return { tom: "warning", texto: "Requer atenção" };
  const conectadas = situacoes.filter((s) => s === "conectada").length;
  if (conectadas === situacoes.length && conectadas > 0) return { tom: "success", texto: "Conectado" };
  if (situacoes.some((s) => s === "a_testar" || s === "a_confirmar")) return { tom: "info", texto: "Falta conferir" };
  if (conectadas > 0) return { tom: "info", texto: "Parcial" };
  return { tom: "neutral", texto: "Não conectado" };
}

/** A linha curta do cartão: "Plugga conectada · Waze Energia a testar". */
export function resumoDoCartao(estado: EstadoDasConexoesOmie | null): string {
  if (!estado) return "Consultando o estado…";
  const nenhuma = estado.conexoes.every((c) => c.situacao === "nao_conectada");
  if (estado.contaAntiga && nenhuma) return "Conta antiga guardada: mova para a Plugga";
  if (nenhuma) return "Nenhuma empresa conectada";
  return estado.conexoes.map((c) => `${NOME[c.empresa]} ${SELO_DA_SITUACAO[c.situacao].texto.toLowerCase()}`).join(" · ");
}

/** "12345678000190" → "12.345.678/0001-90"; outro formato volta como veio. */
export function cnpjComMascara(cnpj: string | null | undefined): string {
  if (!cnpj) return "";
  return cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cnpj;
}

/** Só os dígitos do CNPJ digitado; vazio vira null (limpar o cadastro). */
export function cnpjDigitado(texto: string): { cnpj: string | null; erro?: string } {
  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return { cnpj: null };
  if (digitos.length !== 14) return { cnpj: null, erro: "informe os 14 dígitos do CNPJ." };
  return { cnpj: digitos };
}

/** A empresa que o último teste devolveu, quando é uma só (a que se confirma). */
export function empresaDoTeste(c: Pick<ConexaoOmieDaEmpresa, "ultimoTeste">) {
  const empresas = c.ultimoTeste?.empresas ?? [];
  return empresas.length === 1 ? empresas[0]! : null;
}

/** O que a conexão permite agora, pela situação: os botões da linha. */
export function acoesDaConexao(c: Pick<ConexaoOmieDaEmpresa, "situacao" | "mascara" | "ultimoTeste">) {
  const temPar = c.mascara !== null || c.situacao === "ilegivel";
  return {
    conectar: true,
    testar: c.mascara !== null && c.situacao !== "ilegivel",
    confirmar: c.situacao === "a_confirmar" && empresaDoTeste(c)?.cnpj != null,
    desconectar: temPar,
  };
}

/** O CNPJ do cadastro é a referência da conferência: só Admin e Desenvolvedor o definem (a API garante). */
export const podeDefinirCnpj = (acesso: Pick<Acesso, "plataforma">): boolean => acesso.plataforma !== null;

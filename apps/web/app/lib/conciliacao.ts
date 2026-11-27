import {
  companyKeys,
  VALOR_MAXIMO_DO_LANCAMENTO,
  type CompanyKey,
  type ContaCorrente,
  type CriarLancamentoDoExtrato,
  type FormaDoLancamento,
  type LancamentoNaConciliacao,
  type MovimentoDoExtrato,
  type PainelDaConciliacao,
  type TransferenciaDoExtrato,
} from "@plugga/shared";

import { decimalDigitado, valorEmReais } from "./compras.ts";

/**
 * Conciliação bancária (PLU-339): o painel lê a API com conta opcional e um
 * período de até um ano. Filtros ficam no endereço, como em Lançamentos.
 */

export const ROTA_CONCILIACAO = "/financeiro/conciliacao";

export const abasDaConciliacao = ["sugeridos", "diferente", "sem-lancamento", "sem-extrato", "conciliados"] as const;
export type AbaDaConciliacao = (typeof abasDaConciliacao)[number];

export type FiltrosDaConciliacao = {
  empresa?: CompanyKey;
  conta?: string;
  de: string;
  ate: string;
  aba: AbaDaConciliacao;
};

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O mês corrente em Manaus, do dia 1 até hoje. */
export function periodoDoMes(hoje: string): { de: string; ate: string } {
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}

export function diaDeCalendario(valor: string | undefined): valor is string {
  const match = valor?.match(DIA);
  if (!match) return false;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** A API recusa fim antes do início e período maior que um ano. */
export function periodoAceito(de: string, ate: string): boolean {
  return diaDeCalendario(de) && diaDeCalendario(ate) && de <= ate && (Date.parse(ate) - Date.parse(de)) / 86_400_000 <= 366;
}

export function lerFiltrosDaConciliacao(p: Record<string, string | undefined>, hoje: string): FiltrosDaConciliacao {
  const padrao = periodoDoMes(hoje);
  const de = diaDeCalendario(p.de) ? p.de : padrao.de;
  const ate = diaDeCalendario(p.ate) ? p.ate : padrao.ate;
  const periodo = periodoAceito(de, ate) ? { de, ate } : padrao;
  const empresa = companyKeys.find((item) => item === p.empresa);
  const aba = abasDaConciliacao.find((item) => item === p.aba) ?? "sugeridos";
  return {
    ...periodo,
    aba,
    ...(empresa ? { empresa } : {}),
    ...(p.conta && UUID.test(p.conta) ? { conta: p.conta } : {}),
  };
}

export function hrefDaConciliacao(f: FiltrosDaConciliacao): string {
  const q = new URLSearchParams();
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.conta) q.set("conta", f.conta);
  q.set("de", f.de);
  q.set("ate", f.ate);
  if (f.aba !== "sugeridos") q.set("aba", f.aba);
  return `${ROTA_CONCILIACAO}?${q.toString()}`;
}

/** "-1234.56" em centavos inteiros: dinheiro não passa por float. */
function centavos(valor: string): bigint {
  const negativo = valor.trim().startsWith("-");
  const [inteiro = "0", fracao = ""] = valor.trim().replace(/^[-+]/, "").split(".");
  const absoluto = BigInt(inteiro || "0") * 100n + BigInt((fracao + "00").slice(0, 2));
  return negativo ? -absoluto : absoluto;
}

function deCentavos(total: bigint): string {
  const absoluto = total < 0n ? -total : total;
  return `${total < 0n ? "-" : ""}${absoluto / 100n}.${(absoluto % 100n).toString().padStart(2, "0")}`;
}

export type SaldosDaConciliacao =
  /** `diferenca`: o calculado menos o conciliado, o liquidado que ainda não foi conferido com o extrato. */
  | { tipo: "calculado"; calculado: string; conciliado: string; diferenca: string; semSaldo: number }
  /** A API esconde o saldo de quem só acompanha pagar ou só receber (seria parcial). */
  | { tipo: "oculto" }
  | { tipo: "sem-saldo-inicial" };

/**
 * O saldo conciliado e a diferença (PLU-339, C4) das contas do escopo: a escolhida, ou as
 * ativas da empresa. A conta sem saldo calculado fica fora da soma, e `semSaldo` diz quantas.
 */
export function saldosDaConciliacao(contas: readonly Pick<ContaCorrente, "saldoCalculado" | "saldoConciliado" | "saldoInicial">[]): SaldosDaConciliacao | null {
  if (contas.length === 0) return null;
  const com = contas.filter((c) => c.saldoCalculado && c.saldoConciliado);
  if (com.length === 0) return contas.some((c) => c.saldoInicial) ? { tipo: "oculto" } : { tipo: "sem-saldo-inicial" };
  const calculado = com.reduce((t, c) => t + centavos(c.saldoCalculado!), 0n);
  const conciliado = com.reduce((t, c) => t + centavos(c.saldoConciliado!), 0n);
  return { tipo: "calculado", calculado: deCentavos(calculado), conciliado: deCentavos(conciliado), diferenca: deCentavos(calculado - conciliado), semSaldo: contas.length - com.length };
}

type ContaDoSaldo = Pick<ContaCorrente, "id" | "empresa" | "ativa">;

export type EscopoDoSaldo<T extends ContaDoSaldo> =
  /** `conta`: a do filtro, quando há. */
  | { tipo: "contas"; contas: T[]; conta: T | null }
  /** A conta do filtro não entra no saldo: a soma das outras não responde pelo que está na tela. */
  | { tipo: "fora"; motivo: "inativa" | "inexistente" | "outra-empresa"; conta: T | null };

/**
 * De quais contas é o saldo da faixa. Com conta no filtro, só ela, procurada entre todas (a API
 * filtra o painel pelo id mesmo de uma conta inativa): inativa, inexistente ou de outra empresa
 * que a do filtro ficam "fora", sem saldo. Sem conta, as ativas da empresa, ou das duas.
 */
export function escopoDoSaldo<T extends ContaDoSaldo>(contas: readonly T[], f: { empresa?: CompanyKey; conta?: string }): EscopoDoSaldo<T> {
  if (f.conta) {
    const conta = contas.find((c) => c.id === f.conta) ?? null;
    if (!conta) return { tipo: "fora", motivo: "inexistente", conta: null };
    if (f.empresa && conta.empresa !== f.empresa) return { tipo: "fora", motivo: "outra-empresa", conta };
    if (!conta.ativa) return { tipo: "fora", motivo: "inativa", conta };
    return { tipo: "contas", contas: [conta], conta };
  }
  return { tipo: "contas", contas: contas.filter((c) => c.ativa && (!f.empresa || c.empresa === f.empresa)), conta: null };
}

/**
 * A nota sob os saldos. A diferença é líquida (entradas e saídas pendentes se compensam) e vem
 * desde o saldo inicial, não do período: ela não afirma conclusão; quem diz quanto falta no
 * período é a contagem da faixa.
 */
export function notaDosSaldos(saldos: Extract<SaldosDaConciliacao, { tipo: "calculado" }>): string {
  const fora = saldos.semSaldo === 0 ? "" : saldos.semSaldo === 1 ? " 1 conta sem saldo inicial ficou fora da soma." : ` ${saldos.semSaldo} contas sem saldo inicial ficaram fora da soma.`;
  return `Diferença líquida das contas incluídas: o pago e o recebido desde o saldo inicial que ainda não tem par no extrato. Entradas e saídas pendentes se compensam nela.${fora}`;
}

/** "Sem par" na faixa: as duas pontas, a linha do extrato sem lançamento e o lançamento sem extrato. */
export function semParDoResumo(r: Pick<PainelDaConciliacao["resumo"], "semLancamento" | "semExtrato">): { total: number; detalhe: string } {
  const total = r.semLancamento + r.semExtrato;
  return { total, detalhe: total === 0 ? "nada sem par" : `${r.semLancamento} no extrato · ${r.semExtrato} no Plugga OS` };
}

/**
 * "Corrigir" no par com valor diferente: a correção de valor da ficha, que no pago ou recebido
 * ainda não conciliado é da gerência (API, `podeExecutar`). Já vem com o valor da linha do
 * extrato, como se digita ("1.234,56"). A perna de uma transferência fica de fora: as duas
 * pontas têm o mesmo valor, e a correção de uma só não fecharia.
 */
export function correcaoDoPar(
  par: { movimento: Pick<MovimentoDoExtrato, "valor">; lancamento: Pick<LancamentoNaConciliacao, "valor" | "transferencia"> },
  gerente: boolean,
): { valorInicial: string; valorAtual: string } | null {
  if (!gerente || par.lancamento.transferencia) return null;
  const doExtrato = deCentavos(centavos(par.movimento.valor.replace(/^-/, "")));
  // `valorAtual`: o liquidado do par (na entrada recebida, o recebido), que é o que a API corrige.
  return { valorInicial: Number(doExtrato).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valorAtual: par.lancamento.valor };
}

/** O motivo do "Desfazer", no campo, antes de ir à API (`desfazerConciliacaoSchema`: 3 a 500 letras). */
export function problemaDoMotivo(motivo: string): string | null {
  const texto = motivo.trim();
  if (texto.length < 3) return "informe o motivo, com pelo menos 3 letras.";
  return texto.length > 500 ? "use até 500 caracteres." : null;
}

// ---------------------------------------------------------------- criação guiada (C5 e C6)

type LinhaSemPar = Pick<MovimentoDoExtrato, "id" | "valor" | "dia" | "descricao">;
export type TipoDaCriacao = "receita" | "despesa" | "transferencia";

const debitoDa = (linha: Pick<MovimentoDoExtrato, "valor">): boolean => linha.valor.trim().startsWith("-");
const absolutoDa = (linha: Pick<MovimentoDoExtrato, "valor">): string => deCentavos(centavos(linha.valor.replace(/^-/, "")));

/**
 * O acesso que a criação guiada precisa saber. `buscaCliente`: a tela Contas a receber, que a busca
 * de clientes exige (a API cria a receita com só a Conciliação, mas sem a busca não há cliente).
 */
export type AcessoDaCriacao = { gerente: boolean; buscaCliente: boolean };

/**
 * O que a linha sem par pode virar. Crédito: receita (quem busca cliente) ou a entrada de uma
 * transferência. Débito: despesa ou a saída de uma transferência. A despesa nasce paga sem a
 * aprovação F2 e a transferência mexe em duas contas: as duas são da gerência (API). Sem outra
 * conta ativa da mesma empresa, não há transferência.
 */
export function opcoesDeCriacao(linha: Pick<MovimentoDoExtrato, "valor">, acesso: AcessoDaCriacao, outrasContas: number): TipoDaCriacao[] {
  const transferencia: TipoDaCriacao[] = acesso.gerente && outrasContas > 0 ? ["transferencia"] : [];
  if (debitoDa(linha)) return acesso.gerente ? ["despesa", ...transferencia] : [];
  return [...(acesso.buscaCliente ? (["receita"] as const) : []), ...transferencia];
}

/** Por que a linha não oferece "Criar lançamento", para a tela dizer em vez de esconder sem aviso. */
export function motivoSemCriacao(linha: Pick<MovimentoDoExtrato, "valor">, acesso: AcessoDaCriacao, outrasContas: number): string | null {
  if (opcoesDeCriacao(linha, acesso, outrasContas).length) return null;
  return debitoDa(linha) ? "Despesa e transferência a partir do extrato são da gerência do Financeiro." : "Criar a receita pede também a tela Contas a receber, onde se busca o cliente.";
}

export type CamposDaCriacao = {
  descricao: string;
  /** Como se digita ("1.234,56"); vem com o valor da linha. */
  valor: string;
  clienteId: string;
  fornecedorId: string;
  categoriaId: string;
  /** "2026-11"; vazio, a API usa o mês da linha. */
  competencia: string;
  forma: FormaDoLancamento | "";
};

/** O valor da linha como se digita, para o campo já vir preenchido. */
export const valorDaLinhaParaDigitar = (linha: Pick<MovimentoDoExtrato, "valor">): string =>
  Number(absolutoDa(linha)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O corpo do `POST financeiro/conciliacao/lancamento`. Com o valor da linha, concilia; com outro,
 * vai `conciliar: false` com o valor ("Criar sem conciliar"): a API recusa conciliar valor diferente.
 */
export function corpoDaCriacao(tipo: "receita" | "despesa", c: CamposDaCriacao, linha: LinhaSemPar): { corpo?: CriarLancamentoDoExtrato; porCampo: Record<string, string>; conciliar: boolean } {
  const porCampo: Record<string, string> = {};
  const descricao = c.descricao.trim();
  if (!descricao) porCampo.descricao = "informe a descrição.";
  else if (descricao.length > 200) porCampo.descricao = "use até 200 caracteres.";
  const valor = decimalDigitado(c.valor);
  if (!valor || Number(valor) <= 0) porCampo.valor = "informe o valor, como 1.234,56.";
  else if (Number(valor) > Number(VALOR_MAXIMO_DO_LANCAMENTO)) porCampo.valor = "o valor passa do máximo permitido.";
  if (tipo === "receita") {
    if (!c.clienteId) porCampo.clienteId = "escolha o cliente.";
    if (!c.categoriaId) porCampo.categoriaId = "escolha a categoria de receita.";
  } else if (!c.fornecedorId) porCampo.fornecedorId = "escolha o fornecedor.";
  const conciliar = valor !== null && valor === absolutoDa(linha);
  if (Object.keys(porCampo).length || !valor) return { porCampo, conciliar };
  const comum = { movimentoId: linha.id, descricao, ...(conciliar ? {} : { valor }), conciliar };
  const corpo: CriarLancamentoDoExtrato = tipo === "receita"
    ? { tipo: "entrada", ...comum, clienteId: c.clienteId, categoriaId: c.categoriaId, ...(c.competencia ? { competencia: c.competencia } : {}) }
    : { tipo: "saida", ...comum, fornecedorId: c.fornecedorId, ...(c.categoriaId ? { categoriaId: c.categoriaId } : {}), ...(c.forma ? { forma: c.forma } : {}) };
  return { corpo, porCampo, conciliar };
}

/**
 * O que acontece ao criar, dito antes do botão. No "Criar sem conciliar", o saldo no Plugga OS só
 * muda se a conta tem saldo inicial e a linha cai depois do dia dele (a API soma o liquidado
 * depois do dia-base); o conciliado não muda.
 */
export function efeitoDaCriacao(
  tipo: "receita" | "despesa", conciliar: boolean, valorDaLinha: string,
  conta: Pick<ContaCorrente, "saldoInicial" | "saldoInicialEm" | "ativa"> | null, diaDaLinha: string,
): string {
  if (conciliar) return `Nasce ${tipo === "receita" ? "recebida" : "paga"} no dia e na conta da linha, e já fica conciliada com ela.`;
  const inicio = `O valor é diferente do extrato (${valorEmReais(valorDaLinha.replace(/^-/, ""))}): ${tipo === "receita" ? "a receita nasce recebida" : "a conta nasce paga"} com o valor digitado`;
  // O saldo da API só conta as contas ativas.
  if (conta && !conta.ativa) return `${inicio}, mas a linha do extrato não é conciliada. A conta está inativa, então o saldo no Plugga OS não se calcula.`;
  const base = conta?.saldoInicial && conta.saldoInicialEm ? conta.saldoInicialEm : null;
  if (!base) return `${inicio}, mas a linha do extrato não é conciliada. A conta não tem saldo inicial, então o saldo no Plugga OS não se calcula.`;
  if (diaDaLinha <= base) return `${inicio}, mas a linha do extrato não é conciliada. O saldo no Plugga OS não muda: o dia da linha já está no saldo inicial da conta (${base.slice(8, 10)}/${base.slice(5, 7)}).`;
  return `${inicio} e entra no saldo no Plugga OS, mas a linha do extrato não é conciliada e o saldo conciliado não muda.`;
}

/** O corpo do `POST financeiro/conciliacao/transferencia`: o valor e o dia são os da linha. */
export function corpoDaTransferencia(c: { outraContaId: string; descricao: string }, linha: Pick<MovimentoDoExtrato, "id">): { corpo?: TransferenciaDoExtrato; porCampo: Record<string, string> } {
  const porCampo: Record<string, string> = {};
  if (!c.outraContaId) porCampo.outraContaId = "escolha a outra conta.";
  const descricao = c.descricao.trim();
  if (descricao.length > 200) porCampo.descricao = "use até 200 caracteres.";
  if (Object.keys(porCampo).length) return { porCampo };
  return { porCampo, corpo: { movimentoId: linha.id, outraContaId: c.outraContaId, ...(descricao ? { descricao } : {}) } };
}

/** As duas pernas da transferência: o débito sai da conta da linha; o crédito entra nela. */
export function efeitoDaTransferencia(linha: Pick<MovimentoDoExtrato, "valor" | "dia">, contaDaLinha: string, outraConta: string): string {
  const [origem, destino] = debitoDa(linha) ? [contaDaLinha, outraConta] : [outraConta, contaDaLinha];
  return `${valorEmReais(absolutoDa(linha))} saem de ${origem} e entram em ${destino}, no dia ${linha.dia.slice(8, 10)}/${linha.dia.slice(5, 7)}. A perna desta linha fica conciliada; a de ${outraConta} espera o extrato daquela conta.`;
}

export type AcessoAosLancamentos = { lancamentos: boolean; saidas: boolean; entradas: boolean };

/**
 * O link "Abrir" do 409 (a linha já usada ou a cobrança repetida): a página de Lançamentos e o tipo
 * do existente, senão a ficha volta 404. Sem o `tipo`, o código diz: CP/"· saída" é saída.
 */
export function abreOExistente(existente: { id: string; codigo: string; tipo?: "saida" | "entrada" }, acesso: AcessoAosLancamentos): boolean {
  if (!acesso.lancamentos) return false;
  const tipo = existente.tipo ?? (existente.codigo.startsWith("CP-") || existente.codigo.endsWith("· saída") ? "saida" : "entrada");
  return tipo === "saida" ? acesso.saidas : acesso.entradas;
}

/** O aviso depois da transferência: as pernas se chamam "TR-0001 · saída/entrada", então o código vai uma vez. */
export function mensagemDaTransferencia(codigo: string, debito: boolean, outraConta: string): string {
  const [daLinha, daOutra] = debito ? ["a saída", "a entrada"] : ["a entrada", "a saída"];
  return `${codigo} criada: ${daLinha}, nesta conta, ficou conciliada com a linha; ${daOutra}, na ${outraConta}, espera o extrato daquela conta.`;
}

/** Consulta do `GET /financeiro/conciliacao`. A conta, quando vem, é o id. */
export function consultaDaConciliacao(f: FiltrosDaConciliacao): Record<string, string> {
  return {
    de: f.de,
    ate: f.ate,
    ...(f.empresa ? { empresa: f.empresa } : {}),
    ...(f.conta ? { contaCorrenteId: f.conta } : {}),
  };
}

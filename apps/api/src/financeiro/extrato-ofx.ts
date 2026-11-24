import { createHash } from "node:crypto";

/**
 * O extrato bancário em OFX (PLU-339, C1), 1.x (SGML) ou 2.x (XML). O Plugga OS é o dono
 * do financeiro: o extrato vem do banco, por arquivo, e não do OMIE.
 *
 * Sem parser de XML de propósito: um leitor de tags tolerante serve às duas versões (o 1.x
 * não fecha as tags dos campos) e não resolve entidade nenhuma. DOCTYPE e ENTITY são
 * recusados de cara (XXE). Há limite de tamanho, de linhas e de movimentos. O conteúdo
 * (a descrição dos movimentos é dado bancário) nunca vai a log nem a evento.
 */

export const EXTRATO_MAX_BYTES = 5 * 1024 * 1024;
export const EXTRATO_MAX_LINHAS = 200_000;
export const EXTRATO_MAX_MOVIMENTOS = 20_000;
const DESCRICAO_MAX = 255;
const IDENTIFICADOR_MAX = 120;

/** O arquivo não é um extrato aceitável; a mensagem é para a pessoa e não leva conteúdo do arquivo. */
export class ExtratoRecusado extends Error {}

export type MovimentoLido = {
  /** O FITID do banco; sem ele, um hash estável do conteúdo e da posição no arquivo. */
  identificador: string;
  /** AAAA-MM-DD. */
  dia: string;
  /** Com sinal: + crédito, − débito, duas casas. */
  valor: string;
  descricao: string;
};

export type ExtratoLido = {
  conta: { banco: string | null; agencia: string | null; conta: string | null } | null;
  periodo: { de: string; ate: string } | null;
  /** O saldo que o banco informa no arquivo (LEDGERBAL), só para conferência. */
  saldo: { valor: string; em: string } | null;
  movimentos: MovimentoLido[];
};

/** O texto do arquivo: CHARSET 1252 (ou ASCII) é latin1; o resto, UTF-8. */
function decodificar(arquivo: Buffer): string {
  const inicio = arquivo.subarray(0, 2048).toString("latin1");
  const latin1 = /CHARSET:\s*(1252|ISO-8859-1)/i.test(inicio) || /ENCODING:\s*USASCII/i.test(inicio) || /encoding="(windows-1252|ISO-8859-1)"/i.test(inicio);
  const texto = arquivo.toString(latin1 ? "latin1" : "utf8");
  // Sem a marca de ordem de bytes (BOM) do início, se houver.
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** O valor de um campo: até a próxima tag ou a quebra de linha (1.x), ou até o fechamento (2.x). */
function campo(bloco: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(bloco);
  const valor = m?.[1]?.trim();
  return valor ? desescapar(valor) : null;
}

/** As entidades básicas do SGML/XML; nada além delas. */
const desescapar = (texto: string): string =>
  texto.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** DTPOSTED e companhia: AAAAMMDD[HHMMSS[.XXX]][[-3:BRT]] → AAAA-MM-DD (a data do banco, sem fuso). */
function dia(valor: string | null): string | null {
  const m = valor ? /^(\d{4})(\d{2})(\d{2})/.exec(valor) : null;
  if (!m) return null;
  const [, ano, mes, d] = m;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(d)));
  const ok = data.getUTCFullYear() === Number(ano) && data.getUTCMonth() === Number(mes) - 1 && data.getUTCDate() === Number(d);
  return ok ? `${ano}-${mes}-${d}` : null;
}

/** TRNAMT: "-1742.18", "7200,00" ou "+10"; duas casas e o sinal. */
function valorComSinal(valor: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.replace(/\s/g, "");
  const m = /^([+-]?)(\d{1,12})(?:[.,](\d{1,2}))?$/.exec(limpo);
  if (!m) return null;
  const [, sinal, inteiro, centavos = ""] = m;
  const absoluto = `${BigInt(inteiro!).toString()}.${centavos.padEnd(2, "0")}`;
  return `${sinal === "-" ? "-" : ""}${absoluto}`;
}

export function lerOfx(arquivo: Buffer): ExtratoLido {
  if (arquivo.length > EXTRATO_MAX_BYTES) throw new ExtratoRecusado("O extrato é maior que o limite de 5 MiB.");
  const texto = decodificar(arquivo);
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) throw new ExtratoRecusado("O arquivo traz declarações que um extrato OFX não usa (DOCTYPE ou ENTITY).");
  if (!/OFXHEADER|<OFX>/i.test(texto.slice(0, 4096))) throw new ExtratoRecusado("O arquivo não é um extrato OFX.");
  let linhas = 1;
  for (let i = 0; i < texto.length; i++) if (texto.charCodeAt(i) === 10 && ++linhas > EXTRATO_MAX_LINHAS) throw new ExtratoRecusado("O extrato tem linhas demais.");

  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  if (blocos.length === 0) throw new ExtratoRecusado("O extrato não tem nenhum movimento.");
  if (blocos.length > EXTRATO_MAX_MOVIMENTOS) throw new ExtratoRecusado("O extrato tem movimentos demais para um arquivo só.");

  const movimentos = blocos.map((bloco, posicao): MovimentoLido => {
    const d = dia(campo(bloco, "DTPOSTED"));
    if (!d) throw new ExtratoRecusado(`O movimento ${posicao + 1} do extrato tem data inválida.`);
    const valor = valorComSinal(campo(bloco, "TRNAMT"));
    if (!valor) throw new ExtratoRecusado(`O movimento ${posicao + 1} do extrato tem valor inválido.`);
    if (/^-?0\.00$/.test(valor)) throw new ExtratoRecusado(`O movimento ${posicao + 1} do extrato tem valor zero.`);
    const descricao = (campo(bloco, "MEMO") ?? campo(bloco, "NAME") ?? campo(bloco, "TRNTYPE") ?? "Movimento").slice(0, DESCRICAO_MAX);
    const fitid = campo(bloco, "FITID");
    const identificador = fitid
      ? fitid.slice(0, IDENTIFICADOR_MAX)
      : `sem-fitid:${createHash("sha256").update(`${d}|${valor}|${descricao}|${posicao}`).digest("hex").slice(0, 32)}`;
    return { identificador, dia: d, valor, descricao };
  });

  const contaDoArquivo = /<BANKACCTFROM>([\s\S]*?)(<\/BANKACCTFROM>|<BANKTRANLIST>)/i.exec(texto)?.[1] ?? null;
  const conta = contaDoArquivo ? { banco: campo(contaDoArquivo, "BANKID"), agencia: campo(contaDoArquivo, "BRANCHID"), conta: campo(contaDoArquivo, "ACCTID") } : null;
  const de = dia(campo(texto, "DTSTART"));
  const ate = dia(campo(texto, "DTEND"));
  const dias = movimentos.map((m) => m.dia).sort();
  const periodo = de && ate ? { de, ate } : { de: dias[0]!, ate: dias[dias.length - 1]! };
  const blocoDoSaldo = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<\/STMTRS>)/i.exec(texto)?.[1] ?? null;
  const saldoValor = blocoDoSaldo ? valorComSinal(campo(blocoDoSaldo, "BALAMT")) : null;
  const saldoEm = blocoDoSaldo ? dia(campo(blocoDoSaldo, "DTASOF")) : null;

  return { conta, periodo, saldo: saldoValor && saldoEm ? { valor: saldoValor, em: saldoEm } : null, movimentos };
}

const digitos = (valor: string | null | undefined): string => (valor ?? "").replace(/\D/g, "").replace(/^0+/, "");

/**
 * O extrato é desta conta? Com o número da conta no cadastro e no arquivo, os dígitos têm de
 * conferir (o arquivo pode vir sem o dígito verificador, ou só com ele a mais). Sem o número
 * de um dos lados, não há o que conferir.
 */
export function extratoEhDaConta(numeroDoCadastro: string | null, contaDoArquivo: string | null): boolean {
  const a = digitos(numeroDoCadastro);
  const b = digitos(contaDoArquivo);
  if (!a || !b) return true;
  const [maior, menor] = a.length >= b.length ? [a, b] : [b, a];
  return maior === menor || (maior.length - menor.length === 1 && maior.startsWith(menor));
}

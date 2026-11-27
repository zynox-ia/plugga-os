import type { CompanyKey } from "@plugga/shared";

import type { CampoDaNota, CamposDaNota, ContraparteDaNota, TipoDaNota } from "./notas-fiscais.ts";

/**
 * Notas fiscais (PLU-361), protótipo: ao soltar o XML de uma NF-e, os dados da
 * nota preenchem o formulário, no navegador e sem API. Duas regras puras:
 * `dadosDaNfe` lê o texto do XML e `preencherComANfe` decide o que entra no
 * formulário. No navegador, o DOMParser confere antes se o XML é bem formado
 * (`xmlBemFormado`); aqui, só se lê o que a NF-e tem, sem interpretar o resto.
 */

export type DadosDaNfe = {
  numero: string | null;
  /** "AAAA-MM-DD". */
  emitidaEm: string | null;
  /** Decimal em texto com duas casas ("38940.00"). */
  valor: string | null;
  emitente: string | null;
  destinatario: string | null;
};

/** O conteúdo de um elemento (com ou sem prefixo de namespace), o primeiro dentro de `trecho`. */
function elemento(trecho: string, nome: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`).exec(trecho);
  return m ? m[1]! : null;
}
const texto = (trecho: string | null, nome: string): string | null => {
  const v = trecho === null ? null : elemento(trecho, nome);
  if (v === null || /</.test(v)) return null;
  const limpo = v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").trim();
  return limpo || null;
};

/**
 * Os dados que interessam de uma NF-e (modelo 55, `infNFe`): número (`ide/nNF`),
 * emissão (`ide/dhEmi` ou, na versão antiga, `ide/dEmi`), valor (`ICMSTot/vNF`) e
 * os nomes do emitente e do destinatário. Nulo quando o texto não é uma NF-e
 * (sem `infNFe` fechado) ou quando `bemFormado` diz que o XML está quebrado.
 */
export function dadosDaNfe(xml: string, bemFormado: boolean): DadosDaNfe | null {
  if (!bemFormado) return null;
  const inf = elemento(xml, "infNFe");
  if (inf === null) return null;
  const ide = elemento(inf, "ide");
  const numero = texto(ide, "nNF");
  const emissao = texto(ide, "dhEmi") ?? texto(ide, "dEmi");
  const valor = texto(elemento(inf, "ICMSTot"), "vNF");
  return {
    numero: numero && /^\d{1,9}$/.test(numero) ? numero.replace(/^0+(?=\d)/, "") : null,
    emitidaEm: emissao && /^\d{4}-\d{2}-\d{2}/.test(emissao) ? emissao.slice(0, 10) : null,
    valor: valor && /^\d+(\.\d{1,2})?$/.test(valor) ? (([i, f = ""]) => `${i}.${(f + "00").slice(0, 2)}`)(valor.split(".")) : null,
    emitente: texto(elemento(inf, "emit"), "xNome"),
    destinatario: texto(elemento(inf, "dest"), "xNome"),
  };
}

/** A empresa do grupo pelo nome na NF-e (o protótipo não tem os CNPJs). */
export function empresaPeloNome(nome: string | null): CompanyKey | null {
  const n = (nome ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/\bplugga\b/.test(n)) return "plugga";
  if (/\bwaze\b/.test(n)) return "waze";
  return null;
}

/** O campo pode receber o dado do XML: não foi mexido e está vazio (ou só tem o valor que a tela pôs de partida). */
const COM_VALOR_DE_PARTIDA: readonly (CampoDaNota | "tipo")[] = ["tipo", "empresa", "emitidaEm"];

/**
 * Preenche o formulário com a NF-e, sem sobrescrever o que a pessoa digitou
 * (`tocados`) nem um campo já preenchido. Tipo, empresa e emissão começam com
 * um valor de partida (o lado da tela, o filtro, hoje): esses o XML troca, se a
 * pessoa não os mexeu. O tipo sai da empresa: emitente do grupo é entrada;
 * destinatário do grupo é saída; e só muda sem cliente, fornecedor ou
 * lançamento escolhidos. Cliente ou fornecedor só com o nome exatamente igual.
 */
export function preencherComANfe(
  campos: CamposDaNota,
  dados: DadosDaNfe | null,
  contexto: { contrapartes: readonly ContraparteDaNota[]; tocados: ReadonlySet<CampoDaNota | "tipo"> },
): { campos: CamposDaNota; preenchidos: (CampoDaNota | "tipo")[] } {
  if (!dados) return { campos, preenchidos: [] };
  const novo: CamposDaNota = { ...campos };
  const preenchidos: (CampoDaNota | "tipo")[] = [];
  const pode = (campo: CampoDaNota | "tipo") => !contexto.tocados.has(campo) && (COM_VALOR_DE_PARTIDA.includes(campo) || !novo[campo as keyof CamposDaNota]);
  const por = <K extends keyof CamposDaNota & (CampoDaNota | "tipo")>(campo: K, valor: CamposDaNota[K] | null) => {
    if (valor === null || valor === "" || !pode(campo) || novo[campo] === valor) return;
    novo[campo] = valor;
    preenchidos.push(campo);
  };

  const doEmitente = empresaPeloNome(dados.emitente);
  const doDestinatario = empresaPeloNome(dados.destinatario);
  const tipo: TipoDaNota | null = doEmitente && !doDestinatario ? "entrada" : doDestinatario && !doEmitente ? "saida" : null;
  if (tipo && !novo.contraparteId && !novo.lancamento) por("tipo", tipo);
  por("empresa", novo.tipo === "entrada" ? doEmitente : doDestinatario);
  por("numero", dados.numero);
  por("emitidaEm", dados.emitidaEm);
  por("valor", dados.valor);
  const nome = novo.tipo === "entrada" ? dados.destinatario : dados.emitente;
  const papel = novo.tipo === "entrada" ? "cliente" : "fornecedor";
  por("contraparteId", contexto.contrapartes.find((c) => c.papel === papel && c.nome === nome)?.id ?? null);
  return { campos: novo, preenchidos };
}

import type { CompanyKey } from "@plugga/shared";

import type { CampoDaNota, CamposDaNota, ContraparteDaNota, TipoDaNota } from "./notas-fiscais.ts";

/**
 * Notas fiscais (PLU-361), protótipo: ao soltar o XML de uma NF-e, os dados da
 * nota preenchem o formulário, no navegador e sem API. Duas regras puras:
 * `dadosDaNfe` lê o texto do XML e `preencherComANfe` decide o que entra no
 * formulário.
 *
 * A leitura é defensiva, porque o arquivo vem de fora: só se lê até 2 MB
 * (`podeLerOXml`); DTD e entidades (`<!DOCTYPE`, `<!ENTITY`) nem são
 * interpretados; e os campos saem de uma ÁRVORE (um analisador estrito, abaixo),
 * no namespace da NF-e e pelo caminho certo, nunca por busca no texto: um
 * comentário ou um CDATA com "<nNF>" falso não vira campo. O analisador é próprio
 * (e não o DOMParser) para a regra rodar igual no navegador e nos testes.
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

/** Um XML de NF-e real tem dezenas de KB: acima disto o arquivo só anexa, sem ser lido. */
export const LIMITE_DA_LEITURA_DO_XML = 2 * 1024 * 1024;
export const podeLerOXml = (tamanho: number): boolean => tamanho <= LIMITE_DA_LEITURA_DO_XML;

/**
 * Leituras em andamento: cada arquivo escolhido abre uma leitura nova, e só a
 * mais recente vale. Quem troca de arquivo antes de a leitura anterior terminar
 * não tem a seleção revertida pelo resultado atrasado.
 */
export function sequenciaDeLeituras() {
  let ultima = 0;
  return { nova: (): number => ++ultima, vale: (leitura: number): boolean => leitura === ultima };
}

const NAMESPACE_DA_NFE = "http://www.portalfiscal.inf.br/nfe";
const PROFUNDIDADE_MAXIMA = 40;

/**
 * Tetos do trabalho estrutural: uma NF-e real tem algumas centenas de elementos, poucos atributos
 * por elemento e uma declaração de namespace. Passou de qualquer um, a leitura para e o arquivo só
 * anexa. Assim o custo fica limitado mesmo num arquivo de 2 MB feito para travar a tela.
 */
export const LIMITES_DO_XML = { elementos: 20_000, atributosPorElemento: 50, declaracoesDeNamespace: 100 } as const;

type No = { local: string; ns: string; filhos: No[]; texto: string };

/** As cinco entidades do XML, num Map: nomes como "constructor" ou "__proto__" não existem. */
const ENTIDADES = new Map<string, string>([["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", "\""], ["apos", "'"]]);

/** Decodifica as cinco entidades do XML e as referências numéricas; qualquer outra "&" é recusada (nulo). */
function decodificar(texto: string): string | null {
  let invalido = false;
  const resultado = texto.replace(/&([^&;\s]*);?/g, (inteiro, nome: string) => {
    if (!inteiro.endsWith(";")) { invalido = true; return ""; }
    if (nome.startsWith("#")) {
      const codigo = /^#x[0-9a-fA-F]+$/.test(nome) ? parseInt(nome.slice(2), 16) : /^#\d+$/.test(nome) ? parseInt(nome.slice(1), 10) : NaN;
      if (!Number.isFinite(codigo) || codigo < 1 || codigo > 0x10ffff) { invalido = true; return ""; }
      return String.fromCodePoint(codigo);
    }
    const valor = ENTIDADES.get(nome);
    if (valor === undefined) { invalido = true; return ""; }
    return valor;
  });
  return invalido ? null : resultado;
}

/** Um analisador de XML estrito e pequeno: uma raiz só, tags casadas, sem DTD. Nulo se o texto não for XML bem formado. */
function arvoreDoXml(xml: string): No | null {
  if (/<!\s*(?:DOCTYPE|ENTITY|ELEMENT|ATTLIST|NOTATION)/i.test(xml)) return null;
  const texto = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const raiz: No = { local: "#raiz", ns: "", filhos: [], texto: "" };
  const pilha: { no: No; escopo: Map<string, string>; nome: string }[] = [{ no: raiz, escopo: new Map([["", ""]]), nome: "" }];
  const abertura = /<([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
  const atributo = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let i = 0;
  let temRaiz = false;
  let elementos = 0;
  let declaracoes = 0;
  while (i < texto.length) {
    const topo = pilha[pilha.length - 1]!;
    if (texto[i] !== "<") {
      const proximo = texto.indexOf("<", i);
      const fim = proximo === -1 ? texto.length : proximo;
      const trecho = texto.slice(i, fim);
      if (pilha.length === 1) {
        if (trecho.trim()) return null;
      } else {
        const decodificado = decodificar(trecho);
        if (decodificado === null) return null;
        topo.no.texto += decodificado;
      }
      i = fim;
      continue;
    }
    if (texto.startsWith("<!--", i)) { const f = texto.indexOf("-->", i + 4); if (f === -1) return null; i = f + 3; continue; }
    if (texto.startsWith("<![CDATA[", i)) {
      const f = texto.indexOf("]]>", i + 9);
      if (f === -1 || pilha.length === 1) return null;
      topo.no.texto += texto.slice(i + 9, f);
      i = f + 3;
      continue;
    }
    if (texto.startsWith("<?", i)) { const f = texto.indexOf("?>", i + 2); if (f === -1) return null; i = f + 2; continue; }
    if (texto.startsWith("<!", i)) return null;
    if (texto[i + 1] === "/") {
      const f = texto.indexOf(">", i);
      if (f === -1) return null;
      if (pilha.length === 1 || texto.slice(i + 2, f).trim() !== topo.nome) return null;
      pilha.pop();
      i = f + 1;
      continue;
    }
    abertura.lastIndex = i;
    const m = abertura.exec(texto);
    if (!m) return null;
    const nome = m[1]!;
    if (pilha.length === 1) { if (temRaiz) return null; temRaiz = true; }
    if (pilha.length > PROFUNDIDADE_MAXIMA || ++elementos > LIMITES_DO_XML.elementos) return null;
    // O escopo do pai é reaproveitado; só vira uma cópia quando a tag declara um namespace novo.
    let escopo = topo.escopo;
    const vistos = new Set<string>();
    for (const a of (m[2] ?? "").matchAll(atributo)) {
      const [, chave = "", duplas, simples] = a;
      const valor = decodificar(duplas ?? simples ?? "");
      if (valor === null || vistos.has(chave) || vistos.size >= LIMITES_DO_XML.atributosPorElemento) return null;
      vistos.add(chave);
      if (chave === "xmlns" || chave.startsWith("xmlns:")) {
        if (++declaracoes > LIMITES_DO_XML.declaracoesDeNamespace) return null;
        if (escopo === topo.escopo) escopo = new Map(topo.escopo);
        escopo.set(chave === "xmlns" ? "" : chave.slice(6), valor);
      }
    }
    const doisPontos = nome.indexOf(":");
    const ns = escopo.get(doisPontos === -1 ? "" : nome.slice(0, doisPontos));
    if (ns === undefined) return null;
    const no: No = { local: doisPontos === -1 ? nome : nome.slice(doisPontos + 1), ns, filhos: [], texto: "" };
    topo.no.filhos.push(no);
    if (!m[3]) pilha.push({ no, escopo, nome });
    i += m[0].length;
  }
  return pilha.length === 1 && temRaiz ? raiz : null;
}

const filho = (no: No | null | undefined, local: string): No | null => no?.filhos.find((f) => f.local === local && f.ns === NAMESPACE_DA_NFE) ?? null;

const ehDaNfe = (no: No | null | undefined, local: string): no is No => !!no && no.local === local && no.ns === NAMESPACE_DA_NFE;

/** O infNFe no caminho certo: nfeProc/NFe/infNFe ou NFe/infNFe, com a raiz no namespace da NF-e. */
function infNFeDe(raiz: No): No | null {
  const topo = raiz.filhos[0];
  if (ehDaNfe(topo, "nfeProc")) return filho(filho(topo, "NFe"), "infNFe");
  if (ehDaNfe(topo, "NFe")) return filho(topo, "infNFe");
  return null;
}

/** O texto de uma folha (sem elementos dentro), aparado; nulo se vazio. */
const conteudo = (no: No | null): string | null => (no && no.filhos.length === 0 ? no.texto.trim() || null : null);

/**
 * Os dados que interessam de uma NF-e (modelo 55, `infNFe`): número (`ide/nNF`),
 * emissão (`ide/dhEmi` ou, na versão antiga, `ide/dEmi`), valor (`total/ICMSTot/vNF`)
 * e os nomes do emitente e do destinatário. Nulo quando o texto não é XML bem
 * formado, tem DTD, passa dos tetos (`LIMITES_DO_XML`) ou não é uma NF-e (sem `infNFe`
 * em nfeProc/NFe/infNFe ou NFe/infNFe, no namespace da NF-e).
 */
export function dadosDaNfe(xml: string): DadosDaNfe | null {
  const raiz = arvoreDoXml(xml);
  const inf = raiz ? infNFeDe(raiz) : null;
  if (!inf) return null;
  const ide = filho(inf, "ide");
  const numero = conteudo(filho(ide, "nNF"));
  const emissao = conteudo(filho(ide, "dhEmi")) ?? conteudo(filho(ide, "dEmi"));
  const valor = conteudo(filho(filho(filho(inf, "total"), "ICMSTot"), "vNF"));
  return {
    numero: numero && /^\d{1,9}$/.test(numero) ? numero.replace(/^0+(?=\d)/, "") : null,
    emitidaEm: emissao && /^\d{4}-\d{2}-\d{2}/.test(emissao) ? emissao.slice(0, 10) : null,
    valor: valor && /^\d+(\.\d{1,2})?$/.test(valor) ? (([i, f = ""]) => `${i}.${(f + "00").slice(0, 2)}`)(valor.split(".")) : null,
    emitente: conteudo(filho(filho(inf, "emit"), "xNome")),
    destinatario: conteudo(filho(filho(inf, "dest"), "xNome")),
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

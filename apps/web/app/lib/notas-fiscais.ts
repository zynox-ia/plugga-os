import type { CompanyKey } from "@plugga/shared";
import { dentroDoIntervalo, lerIntervalo, type IntervaloLivre } from "./periodo-livre.ts";

/**
 * Regras puras da tela de Notas fiscais (PLU-361), no PROTÓTIPO visual: o lado
 * (entradas ou saídas), os filtros, os totais e a validação de "Adicionar nota
 * fiscal". Os dados de exemplo ficam em notas-fiscais-exemplo.ts. Quando o
 * desenho for aprovado, os tipos daqui viram contrato em packages/shared e a
 * validação passa a ser também da API.
 *
 * Entradas = notas de receita, emitidas pela empresa para clientes; saídas =
 * notas de despesa, recebidas de fornecedores. O mesmo sentido de Lançamentos.
 */

export type TipoDaNota = "entrada" | "saida";
export const tiposDaNota: readonly TipoDaNota[] = ["entrada", "saida"];

export type FormatoDoArquivo = "pdf" | "xml";
export type ArquivoDaNota = { nome: string; formato: FormatoDoArquivo; tamanho: number };

/** Cliente (nas entradas) ou fornecedor (nas saídas). */
export type ContraparteDaNota = { id: string; nome: string; papel: "cliente" | "fornecedor" };

/** O lançamento que a nota acompanha: a cobrança (CR) de uma entrada ou a conta a pagar (CP) de uma saída. */
export type LancamentoParaNota = {
  codigo: string;
  tipo: TipoDaNota;
  empresa: CompanyKey;
  contraparteId: string;
  descricao: string;
  /** Decimal em texto ("1450.00"), como na API. */
  valor: string;
  vencimento: string;
  situacao: string;
};

export type NotaFiscal = {
  id: string;
  tipo: TipoDaNota;
  empresa: CompanyKey;
  /** Só algarismos, sem zeros à esquerda ("1287"). */
  numero: string;
  emitidaEm: string;
  valor: string;
  contraparte: ContraparteDaNota;
  lancamento: Pick<LancamentoParaNota, "codigo" | "descricao" | "valor" | "vencimento" | "situacao"> | null;
  arquivo: ArquivoDaNota | null;
  registradaEm: string;
  registradaPor: string;
};

export const ROTULO_DO_TIPO_DA_NOTA: Record<TipoDaNota, { lado: string; singular: string; contraparte: string; artigo: string }> = {
  entrada: { lado: "Entradas", singular: "nota de entrada", contraparte: "Cliente", artigo: "o cliente" },
  saida: { lado: "Saídas", singular: "nota de saída", contraparte: "Fornecedor", artigo: "o fornecedor" },
};

// ---------------------------------------------------------------- filtros

export const periodosDasNotas = ["mes", "mes-anterior", "90d", "ano"] as const;
export type PeriodoDasNotas = (typeof periodosDasNotas)[number];
export const ROTULO_DO_PERIODO_DAS_NOTAS: Record<PeriodoDasNotas, string> = {
  mes: "Este mês",
  "mes-anterior": "Mês passado",
  "90d": "Últimos 90 dias",
  ano: "Este ano",
};

/** `intervalo` é o período personalizado (De e Até livres) e vale mais que o atalho `periodo`. */
export type FiltrosDasNotas = { empresa?: CompanyKey; periodo?: PeriodoDasNotas; intervalo?: IntervaloLivre; busca?: string };

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const diaIso = (d: Date) => `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
const partes = (dia: string) => dia.split("-").map(Number) as [number, number, number];

/** "AAAA-MM-DD" mais (ou menos) `dias`. */
export function somarDias(dia: string, dias: number): string {
  const [ano, mes, d] = partes(dia);
  return diaIso(new Date(Date.UTC(ano, mes - 1, d + dias)));
}

/** De e até (inclusive) do período, em dias de Manaus. */
export function intervaloDasNotas(periodo: PeriodoDasNotas, hoje: string): { de: string; ate: string } {
  const [ano, mes] = partes(hoje);
  if (periodo === "mes") return { de: diaIso(new Date(Date.UTC(ano, mes - 1, 1))), ate: hoje };
  if (periodo === "mes-anterior") return { de: diaIso(new Date(Date.UTC(ano, mes - 2, 1))), ate: diaIso(new Date(Date.UTC(ano, mes - 1, 0))) };
  if (periodo === "90d") return { de: somarDias(hoje, -89), ate: hoje };
  return { de: `${ano}-01-01`, ate: hoje };
}

const semAcento = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
/** "000.001.287" → "1287": a busca e a conferência de repetida ignoram pontos e zeros à esquerda. */
export const numeroNormalizado = (texto: string): string => texto.replace(/\D/g, "").replace(/^0+/, "");

/** Busca por número (só algarismos, pontos e espaços) ou pelo nome do cliente ou fornecedor. */
export function casaComABusca(nota: Pick<NotaFiscal, "numero" | "contraparte">, busca: string): boolean {
  const termo = busca.trim();
  if (!termo) return true;
  if (/^[\d.\s/-]+$/.test(termo)) {
    const n = numeroNormalizado(termo);
    return n !== "" && nota.numero.includes(n);
  }
  return semAcento(nota.contraparte.nome).includes(semAcento(termo));
}

/** As notas que a tela mostra, sem o lado: a mais recente primeiro (no mesmo dia, o maior número). */
export function filtrarNotas(notas: readonly NotaFiscal[], filtros: FiltrosDasNotas, hoje: string): NotaFiscal[] {
  const intervalo: IntervaloLivre | null = filtros.intervalo ?? (filtros.periodo ? intervaloDasNotas(filtros.periodo, hoje) : null);
  return notas
    .filter((n) => !filtros.empresa || n.empresa === filtros.empresa)
    .filter((n) => dentroDoIntervalo(n.emitidaEm, intervalo))
    .filter((n) => casaComABusca(n, filtros.busca ?? ""))
    .sort((a, b) => b.emitidaEm.localeCompare(a.emitidaEm) || Number(b.numero) - Number(a.numero));
}

export const notasDoLado = (notas: readonly NotaFiscal[], tipo: TipoDaNota): NotaFiscal[] => notas.filter((n) => n.tipo === tipo);

export const temFiltroNasNotas = (f: FiltrosDasNotas): boolean => Boolean(f.empresa || f.periodo || f.intervalo || f.busca?.trim());

/** Soma em centavos (BigInt), para não acumular erro de ponto flutuante. */
export const centavosDaNota = (valor: string): bigint => {
  const [inteiro = "0", fracao = ""] = valor.split(".");
  const sinal = inteiro.startsWith("-") ? -1n : 1n;
  return sinal * (BigInt(inteiro.replace("-", "") || "0") * 100n + BigInt((fracao + "00").slice(0, 2)));
};
const deCentavos = (c: bigint): string => {
  const negativo = c < 0n;
  const abs = negativo ? -c : c;
  return `${negativo ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
};

export type ResumoDoLado = { quantidade: number; total: string; semLancamento: number; semArquivo: number };

export function resumoDoLado(notas: readonly NotaFiscal[]): ResumoDoLado {
  return {
    quantidade: notas.length,
    total: deCentavos(notas.reduce((soma, n) => soma + centavosDaNota(n.valor), 0n)),
    semLancamento: notas.filter((n) => !n.lancamento).length,
    semArquivo: notas.filter((n) => !n.arquivo).length,
  };
}

/**
 * O saldo das notas no período: o total das entradas menos o das saídas, com os
 * filtros de empresa e período. A busca não entra: ela acha uma nota, não muda o
 * recorte do saldo. Decimal em texto, negativo com "-" ("-1250.00").
 */
export function saldoDasNotas(notas: readonly NotaFiscal[], filtros: FiltrosDasNotas, hoje: string): string {
  const doRecorte = filtrarNotas(notas, { ...(filtros.empresa ? { empresa: filtros.empresa } : {}), ...(filtros.periodo ? { periodo: filtros.periodo } : {}), ...(filtros.intervalo ? { intervalo: filtros.intervalo } : {}) }, hoje);
  return deCentavos(doRecorte.reduce((saldo, n) => saldo + (n.tipo === "entrada" ? 1n : -1n) * centavosDaNota(n.valor), 0n));
}

export const quantasNotas =(n: number, tipo?: TipoDaNota): string =>
  `${n === 0 ? "Nenhuma" : n} ${n === 1 ? "nota" : "notas"}${tipo ? ` de ${tipo === "entrada" ? "entrada" : "saída"}` : ""}`;

// ---------------------------------------------------------------- lançamento vinculado

/**
 * Os lançamentos que a nota pode acompanhar: da mesma empresa e do mesmo sentido
 * (e do mesmo cliente ou fornecedor, quando já escolhido). Um lançamento que já
 * tem nota aparece desligado, com o número dela: a ficha guarda uma nota só.
 */
export function lancamentosParaVincular(
  lancamentos: readonly LancamentoParaNota[],
  notas: readonly NotaFiscal[],
  escolha: { tipo: TipoDaNota; empresa: CompanyKey | ""; contraparteId: string },
): { lancamento: LancamentoParaNota; jaTemNota: string | null }[] {
  if (!escolha.empresa) return [];
  const comNota = new Map(notas.filter((n) => n.lancamento).map((n) => [n.lancamento!.codigo, n.numero]));
  return lancamentos
    .filter((l) => l.tipo === escolha.tipo && l.empresa === escolha.empresa && (!escolha.contraparteId || l.contraparteId === escolha.contraparteId))
    .map((lancamento) => ({ lancamento, jaTemNota: comNota.get(lancamento.codigo) ?? null }));
}

// ---------------------------------------------------------------- arquivo

export const ARQUIVO_DA_NOTA_MAX_BYTES = 25 * 1024 * 1024;

/**
 * O formato pelo conteúdo, não pelo nome: PDF começa com "%PDF-"; XML, depois do
 * BOM e de espaços, com "<?xml" ou com uma tag. A API refaz a conferência.
 */
export function formatoPeloConteudo(inicio: Uint8Array): FormatoDoArquivo | null {
  let i = inicio[0] === 0xef && inicio[1] === 0xbb && inicio[2] === 0xbf ? 3 : 0;
  const texto = (de: number, n: number) => String.fromCharCode(...inicio.slice(de, de + n));
  if (texto(i, 5) === "%PDF-") return "pdf";
  while (i < inicio.length && [0x20, 0x09, 0x0a, 0x0d].includes(inicio[i]!)) i++;
  if (texto(i, 5) === "<?xml") return "xml";
  return inicio[i] === 0x3c && /[A-Za-z]/.test(texto(i + 1, 1)) ? "xml" : null;
}

export function problemaDoArquivo(arquivo: { tamanho: number; formato: FormatoDoArquivo | null } | null): string | null {
  if (!arquivo) return null;
  if (arquivo.tamanho === 0) return "O arquivo está vazio.";
  if (arquivo.tamanho > ARQUIVO_DA_NOTA_MAX_BYTES) return "O arquivo passa de 25 MB.";
  if (!arquivo.formato) return "Anexe o PDF (DANFE) ou o XML da nota. Este arquivo não é nenhum dos dois.";
  return null;
}

// ---------------------------------------------------------------- adicionar nota

export type CamposDaNota = {
  tipo: TipoDaNota;
  empresa: CompanyKey | "";
  numero: string;
  emitidaEm: string;
  /** Decimal em texto, como o CurrencyField devolve ("2640.00"); vazio é "". */
  valor: string;
  contraparteId: string;
  /** Código do lançamento ("CR-0916"); vazio é sem vínculo. */
  lancamento: string;
  /** O formato vem do conteúdo; nulo quando não é PDF nem XML. */
  arquivo: (Omit<ArquivoDaNota, "formato"> & { formato: FormatoDoArquivo | null }) | null;
};

export type CampoDaNota = "empresa" | "numero" | "emitidaEm" | "valor" | "contraparteId" | "lancamento" | "arquivo";
/** A ordem dos campos no formulário: o foco vai para o primeiro com erro. */
export const ORDEM_DOS_CAMPOS: readonly CampoDaNota[] = ["arquivo", "empresa", "lancamento", "contraparteId", "numero", "emitidaEm", "valor"];

const diaLegivel = (dia: string) => dia.split("-").reverse().join("/");
export const ROTULO_DA_EMPRESA_NA_NOTA: Record<CompanyKey, string> = { plugga: "Plugga", waze: "Waze Energia" };

/**
 * Confere o formulário. Número repetido: na entrada, o emitente é a própria
 * empresa (mesma empresa e tipo bastam); na saída, é o fornecedor (mesma
 * empresa, tipo e fornecedor). Sem erro, devolve a nota pronta para a lista.
 */
export function validarNota(
  campos: CamposDaNota,
  contexto: {
    hoje: string;
    notas: readonly NotaFiscal[];
    contrapartes: readonly ContraparteDaNota[];
    lancamentos: readonly LancamentoParaNota[];
    registradaPor: string;
    novoId: string;
  },
): { erros: Partial<Record<CampoDaNota, string>>; nota: NotaFiscal | null } {
  const erros: Partial<Record<CampoDaNota, string>> = {};
  const numero = numeroNormalizado(campos.numero);
  const contraparte = contexto.contrapartes.find((c) => c.id === campos.contraparteId && c.papel === (campos.tipo === "entrada" ? "cliente" : "fornecedor")) ?? null;

  if (!campos.empresa) erros.empresa = "Escolha a empresa da nota.";

  if (!campos.numero.trim()) erros.numero = "Informe o número da nota.";
  else if (/[^\d.\s]/.test(campos.numero)) erros.numero = "Use só algarismos no número, como 1287.";
  else if (!numero) erros.numero = "O número da nota começa em 1.";
  else if (numero.length > 9) erros.numero = "O número da nota tem até 9 algarismos.";

  if (!campos.emitidaEm) erros.emitidaEm = "Informe a data de emissão.";
  else if (campos.emitidaEm > contexto.hoje) erros.emitidaEm = "A data de emissão não pode ser depois de hoje.";

  if (!campos.valor) erros.valor = "Informe o valor da nota.";
  else if (centavosDaNota(campos.valor) <= 0n) erros.valor = "O valor da nota precisa ser maior que zero.";

  if (!contraparte) erros.contraparteId = campos.tipo === "entrada" ? "Escolha o cliente da nota." : "Escolha o fornecedor que emitiu a nota.";

  const lancamento = campos.lancamento ? contexto.lancamentos.find((l) => l.codigo === campos.lancamento) ?? null : null;
  if (campos.lancamento) {
    if (!lancamento || lancamento.tipo !== campos.tipo || lancamento.empresa !== campos.empresa) erros.lancamento = "O lançamento precisa ser da mesma empresa e do mesmo sentido da nota.";
    else if (contraparte && lancamento.contraparteId !== contraparte.id) erros.lancamento = `O lançamento é de outro ${campos.tipo === "entrada" ? "cliente" : "fornecedor"}.`;
    else {
      const outra = contexto.notas.find((n) => n.lancamento?.codigo === lancamento.codigo);
      if (outra) erros.lancamento = `${lancamento.codigo} já tem a nota nº ${outra.numero}.`;
    }
  }

  const problema = problemaDoArquivo(campos.arquivo);
  if (problema) erros.arquivo = problema;

  if (!erros.numero && campos.empresa && (campos.tipo === "entrada" || contraparte)) {
    const repetida = contexto.notas.find((n) => n.tipo === campos.tipo && n.empresa === campos.empresa && n.numero === numero
      && (campos.tipo === "entrada" || n.contraparte.id === contraparte!.id));
    if (repetida) {
      erros.numero = campos.tipo === "entrada"
        ? `A ${ROTULO_DA_EMPRESA_NA_NOTA[campos.empresa]} já tem a nota de entrada nº ${numero}, emitida em ${diaLegivel(repetida.emitidaEm)} para ${repetida.contraparte.nome}.`
        : `A nota nº ${numero} de ${repetida.contraparte.nome} já está registrada na ${ROTULO_DA_EMPRESA_NA_NOTA[campos.empresa]}, emitida em ${diaLegivel(repetida.emitidaEm)}.`;
    }
  }

  if (Object.keys(erros).length || !campos.empresa || !contraparte) return { erros, nota: null };
  return {
    erros,
    nota: {
      id: contexto.novoId,
      tipo: campos.tipo,
      empresa: campos.empresa,
      numero,
      emitidaEm: campos.emitidaEm,
      valor: campos.valor,
      contraparte,
      lancamento: lancamento ? { codigo: lancamento.codigo, descricao: lancamento.descricao, valor: lancamento.valor, vencimento: lancamento.vencimento, situacao: lancamento.situacao } : null,
      arquivo: campos.arquivo?.formato ? { nome: campos.arquivo.nome, formato: campos.arquivo.formato, tamanho: campos.arquivo.tamanho } : null,
      registradaEm: contexto.hoje,
      registradaPor: contexto.registradaPor,
    },
  };
}

/** Aviso que não impede salvar: o valor da nota difere do lançamento escolhido. */
export function avisoDoValor(valor: string, lancamento: Pick<LancamentoParaNota, "valor"> | null): boolean {
  return Boolean(lancamento && valor && centavosDaNota(valor) > 0n && centavosDaNota(valor) !== centavosDaNota(lancamento.valor));
}

// ---------------------------------------------------------------- visão (Cards ou Lista)

/** As visões da tela, na ordem do seletor (a mesma de Lançamentos). */
export const visoesDasNotas = ["cards", "lista"] as const;
export type VisaoDasNotas = (typeof visoesDasNotas)[number];

/** A visão do endereço (?visao=cards|lista). A Lista é a padrão: valor ausente ou desconhecido volta a ela. */
export const visaoDasNotas = (valor: string | null | undefined): VisaoDasNotas => visoesDasNotas.find((v) => v === valor) ?? "lista";

/**
 * O que o endereço diz da tela: o lado (?lado=saidas), a visão (?visao=cards) e o período
 * personalizado (?de=…&ate=…), cada um com seu padrão quando falta ou não vale. A tela
 * lê isto na primeira vez e a cada mudança do endereço (navegação suave), sem remontar.
 */
export function estadoDoEnderecoDasNotas(parametros: { get(nome: string): string | null }): { lado: TipoDaNota; visao: VisaoDasNotas; intervalo: IntervaloLivre | null } {
  return {
    lado: parametros.get("lado") === "saidas" ? "saida" : "entrada",
    visao: visaoDasNotas(parametros.get("visao")),
    intervalo: lerIntervalo(parametros.get("de"), parametros.get("ate")),
  };
}

/**
 * A tela grava o endereço (history.replaceState) e a mesma mudança volta pelo useSearchParams. A fila guarda
 * as chaves gravadas que ainda vão voltar, para a sincronização não tratá-las como navegação de fora.
 * Gravar o que já está no endereço não faz o efeito rodar de novo: não entra na fila.
 */
export const enfileirarGravacao = (fila: readonly string[], atual: string, nova: string): string[] => (nova === atual ? [...fila] : [...fila, nova]);

/** A chave que chegou é uma gravação da tela? Se sim, sai da fila com as anteriores; se não, é navegação de fora e a fila obsoleta é descartada. */
export function reconhecerGravacao(fila: readonly string[], chave: string): { propria: boolean; fila: string[] } {
  const achada = fila.indexOf(chave);
  return achada === -1 ? { propria: false, fila: [] } : { propria: true, fila: fila.slice(achada + 1) };
}

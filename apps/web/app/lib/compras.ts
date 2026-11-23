import {
  companyKeys,
  destinosDeCompra,
  rotulosDaEtapaDeCompra,
  rotulosDoDestinoDeCompra,
  type CompanyKey,
  type DestinoDeCompra,
  type NomeDaAcaoDoPedido,
  type PedidoDeCompra,
  type PedidoDeCompraResumo,
  type SituacaoDoPrazo,
} from "@plugga/shared";

/**
 * Compras (PLU-328): filtros pelo endereço, valores, prazos e rótulos do quadro,
 * da lista e da ficha. Um quadro só para Plugga e Waze; a empresa é filtro.
 */

export const ROTA_COMPRAS = "/suprimentos/compras";

export const ROTULO_DA_EMPRESA: Record<CompanyKey, string> = { plugga: "Plugga", waze: "Waze Energia" };
export const COR_DA_EMPRESA: Record<CompanyKey, string> = { plugga: "#0066CC", waze: "#0B7A57" };

/** Cor de cada coluna, a mesma do protótipo aprovado. */
export const COR_DA_ETAPA = {
  pedido_gerado: "#94A3B8",
  analise_estoque: "#00A3FF",
  cotacoes: "#7C5CFF",
  aprovacao_compra: "#F5A524",
  pagamento: "#F25601",
  retirada: "#0B7A57",
  concluido: "#126744",
} as const;

/** No quadro a etapa cabe curta; na ficha vai o nome inteiro do contrato. */
export const ROTULO_CURTO_DA_ETAPA = { ...rotulosDaEtapaDeCompra, aprovacao_compra: "Aprovação" } as const;

export const periodosDeCompra = ["7d", "mes", "mes-anterior"] as const;
export type PeriodoDeCompra = (typeof periodosDeCompra)[number];
export const ROTULO_DO_PERIODO: Record<PeriodoDeCompra, string> = {
  "7d": "Abertos nos últimos 7 dias",
  mes: "Abertos neste mês",
  "mes-anterior": "Abertos no mês passado",
};

export const situacoesDaLista = ["em_andamento", "concluido", "cancelado", "todos"] as const;
export type SituacaoDaLista = (typeof situacoesDaLista)[number];

export type FiltrosDeCompras = {
  visao: "quadro" | "lista";
  busca?: string;
  empresa?: CompanyKey;
  responsavel?: string;
  destino?: DestinoDeCompra;
  periodo?: PeriodoDeCompra;
  /** Só no quadro: mostra a coluna de cancelados. */
  cancelados: boolean;
  /** Só na lista. */
  situacao: SituacaoDaLista;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê os filtros do endereço; valor desconhecido cai no padrão em vez de virar erro da API. */
export function lerFiltrosDeCompras(p: Record<string, string | undefined>): FiltrosDeCompras {
  const empresa = companyKeys.find((e) => e === p.empresa);
  const destino = destinosDeCompra.find((d) => d === p.destino);
  const periodo = periodosDeCompra.find((x) => x === p.periodo);
  return {
    visao: p.visao === "lista" ? "lista" : "quadro",
    busca: p.busca?.trim().slice(0, 150) || undefined,
    ...(empresa ? { empresa } : {}),
    ...(p.responsavel && UUID.test(p.responsavel) ? { responsavel: p.responsavel } : {}),
    ...(destino ? { destino } : {}),
    ...(periodo ? { periodo } : {}),
    cancelados: p.cancelados === "1",
    situacao: situacoesDaLista.find((s) => s === p.situacao) ?? "em_andamento",
  };
}

/** Os filtros e a ficha vão no endereço: o mesmo link abre a mesma tela. */
export function hrefDeCompras(f: Partial<FiltrosDeCompras>, pedido?: string | null): string {
  const q = new URLSearchParams();
  if (f.visao === "lista") q.set("visao", "lista");
  if (f.busca) q.set("busca", f.busca);
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.responsavel) q.set("responsavel", f.responsavel);
  if (f.destino) q.set("destino", f.destino);
  if (f.periodo) q.set("periodo", f.periodo);
  if (f.visao !== "lista" && f.cancelados) q.set("cancelados", "1");
  if (f.visao === "lista" && f.situacao && f.situacao !== "em_andamento") q.set("situacao", f.situacao);
  if (pedido) q.set("pedido", pedido);
  const texto = q.toString();
  return texto ? `${ROTA_COMPRAS}?${texto}` : ROTA_COMPRAS;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const diaIso = (d: Date) => `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;

/** O dia de hoje em Manaus (UTC−4, sem horário de verão), como AAAA-MM-DD. */
export function hojeEmManaus(agora: Date = new Date()): string {
  return diaIso(new Date(agora.getTime() - 4 * 60 * 60 * 1000));
}

/** Período do filtro → `de`/`ate` da API, em dias de Manaus. */
export function intervaloDoPeriodo(periodo: PeriodoDeCompra | undefined, hoje: string): { de?: string; ate?: string } {
  if (!periodo) return {};
  const [ano, mes, dia] = hoje.split("-").map(Number) as [number, number, number];
  if (periodo === "7d") return { de: diaIso(new Date(Date.UTC(ano, mes - 1, dia - 6))), ate: hoje };
  if (periodo === "mes") return { de: diaIso(new Date(Date.UTC(ano, mes - 1, 1))), ate: hoje };
  return { de: diaIso(new Date(Date.UTC(ano, mes - 2, 1))), ate: diaIso(new Date(Date.UTC(ano, mes - 1, 0))) };
}

/** Consulta para a API: só os filtros que ela conhece, sem vazios. */
export function consultaDaApi(f: FiltrosDeCompras, hoje: string): Record<string, string | undefined> {
  return {
    empresa: f.empresa,
    responsavelId: f.responsavel,
    destino: f.destino,
    ...intervaloDoPeriodo(f.periodo, hoje),
  };
}

export const numeroDoPedido = (n: number): string => `PC-${String(n).padStart(4, "0")}`;

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_INTEIRO = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Os valores chegam como decimal em texto ("1450.00"). */
export function valorEmReais(valor: string | null | undefined, inteiro = false): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return (inteiro ? BRL_INTEIRO : BRL).format(n);
}

/** Soma da coluna, curta: "R$ 68,5 mil", "R$ 1,2 mi". */
export function valorCurto(valor: string | number): string {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || n === 0) return "R$ 0";
  const fmt = (x: number, casas: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: casas });
  if (n >= 1e6) return `R$ ${fmt(n / 1e6, 2)} mi`;
  if (n >= 1e3) return `R$ ${fmt(n / 1e3, n >= 1e5 ? 0 : 1)} mil`;
  return BRL_INTEIRO.format(n);
}

/** "1.450,50" ou "1450.5" digitado → "1450.50"; vazio ou inválido → null. */
export function decimalDigitado(texto: string): string | null {
  const limpo = texto.trim().replace(/\s|R\$/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return Number(normalizado).toFixed(2);
}

/** Quantidade digitada → decimal com até 3 casas, como o contrato pede. Com vírgula, o ponto é milhar ("1.234,5" → "1234.5"). */
export function quantidadeDigitada(texto: string): string | null {
  const bruto = texto.trim().replace(/\s/g, "");
  const limpo = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  if (!/^\d+(\.\d{1,3})?$/.test(limpo) || Number(limpo) <= 0) return null;
  return String(Number(limpo));
}

export const quantidadeLegivel = (q: string, unidade: string | null): string =>
  `${Number(q).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}${unidade ? ` ${unidade}` : ""}`;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "4 dez" para dia de calendário (AAAA-MM-DD). */
export function diaCurto(dia: string): string {
  const [, mes, d] = dia.slice(0, 10).split("-").map(Number) as [number, number, number];
  return `${d} ${MESES[mes - 1]}`;
}

/** Data e hora da API (ISO) mostrada no dia de Manaus: "23/11/2026". */
export function dataEmManaus(iso: string): string {
  const [ano, mes, dia] = hojeEmManaus(new Date(iso)).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Dia de calendário (AAAA-MM-DD) como "04/12/2026". */
export const diaLegivel = (dia: string): string => dia.slice(0, 10).split("-").reverse().join("/");

export const ROTULO_DO_PRAZO: Record<SituacaoDoPrazo, string> = { no_prazo: "No prazo", vence_hoje: "Vence hoje", vencido: "Vencido" };

/** Texto do selo de prazo do card: "Vence hoje", "No prazo · até 26 nov", "Concluído 19 nov". */
export function textoDoPrazo(p: Pick<PedidoDeCompraResumo, "situacao" | "situacaoDoPrazo" | "prazoDaEtapaEm">): string {
  if (p.situacao === "cancelado") return "Cancelado";
  if (p.situacao === "concluido") return "Concluído";
  if (!p.situacaoDoPrazo || !p.prazoDaEtapaEm) return "Sem prazo";
  const ate = diaCurto(hojeEmManaus(new Date(p.prazoDaEtapaEm)));
  if (p.situacaoDoPrazo === "vence_hoje") return "Vence hoje";
  return `${ROTULO_DO_PRAZO[p.situacaoDoPrazo]} · ${p.situacaoDoPrazo === "vencido" ? "era" : "até"} ${ate}`;
}

export function textoDoDestino(d: PedidoDeCompraResumo["destino"]): string {
  const nome = d.tipo === "obra" ? d.obra?.nome : d.tipo === "cliente" ? d.cliente?.nome : null;
  return `${rotulosDoDestinoDeCompra[d.tipo]}${nome ? ` · ${nome}` : ""}`;
}

/** O arquivo vem com o caminho da API; o navegador abre pela rota de proxy da web. */
export const urlDoArquivo = (url: string): string => (url.startsWith("/api/") ? url : `/api${url.startsWith("/") ? "" : "/"}${url}`);

export const ROTULO_DA_ACAO: Record<NomeDaAcaoDoPedido, string> = {
  iniciar_analise: "Iniciar análise de estoque",
  decidir_estoque: "Decidir estoque ou compra",
  selecionar_cotacao: "Escolher a vencedora",
  enviar_para_aprovacao: "Enviar para aprovação",
  aprovar: "Aprovar compra",
  revisar: "Revisar cotações",
  registrar_pagamento: "Registrar pagamento",
  confirmar_recebimento: "Confirmar recebimento",
  cancelar: "Cancelar pedido",
};

/** Mensagem do aviso depois de cada ação. */
export const AVISO_DA_ACAO: Partial<Record<NomeDaAcaoDoPedido, string>> = {
  iniciar_analise: "Pedido em análise de estoque.",
  enviar_para_aprovacao: "Pedido enviado para aprovação.",
  aprovar: "Compra aprovada.",
  revisar: "Pedido voltou para Cotações; a vencedora foi desmarcada.",
  registrar_pagamento: "Pagamento registrado.",
  confirmar_recebimento: "Recebimento confirmado: aquisição concluída.",
  cancelar: "Pedido cancelado.",
};

export const tamanhoDoArquivo = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

export type Pendencia = { feito: boolean; texto: string; opcional?: boolean };

/** Quem age em cada etapa, como no protótipo aprovado. */
export const AREA_DA_ETAPA = {
  pedido_gerado: "Suprimentos",
  analise_estoque: "Suprimentos",
  cotacoes: "Suprimentos",
  aprovacao_compra: "Financeiro",
  pagamento: "Financeiro",
  retirada: "Quem recebe o material",
} as const;

/**
 * O que falta para o pedido sair da etapa atual. Espelha as exigências da API
 * (cotação escolhida para aprovar, forma de pagamento, valor faturado na
 * aquisição); "3 cotações" é só recomendação, por isso opcional.
 */
export function pendenciasDaEtapa(p: Pick<PedidoDeCompra, "etapa" | "situacao" | "itens" | "destino" | "responsavel" | "cotacoes" | "cotacaoSelecionadaId" | "pagamento" | "comprovantePendente" | "origemAtendimento">): Pendencia[] {
  if (p.situacao !== "em_andamento") return [];
  const escolhida = p.cotacoes.find((c) => c.id === p.cotacaoSelecionadaId);
  switch (p.etapa) {
    case "pedido_gerado": return [
      { feito: p.itens.length > 0, texto: p.itens.length === 1 ? "1 item descrito" : `${p.itens.length} itens descritos` },
      { feito: p.destino.tipo === "interno" || Boolean(p.destino.obra ?? p.destino.cliente), texto: "Destino definido" },
      { feito: Boolean(p.responsavel), texto: "Responsável definido", opcional: true },
    ];
    case "analise_estoque": return [{ feito: false, texto: "Decidir: atender pelo estoque ou comprar" }];
    case "cotacoes": return [
      { feito: p.cotacoes.length > 0, texto: p.cotacoes.length === 0 ? "Registrar ao menos 1 cotação com anexo" : p.cotacoes.length === 1 ? "1 cotação com anexo" : `${p.cotacoes.length} cotações com anexo` },
      { feito: Boolean(escolhida), texto: escolhida ? `Vencedora: ${escolhida.fornecedor.nome}` : "Escolher a vencedora" },
      { feito: p.cotacoes.length >= 3, texto: "3 cotações para comparar (recomendado)", opcional: true },
    ];
    case "aprovacao_compra": return [{ feito: Boolean(escolhida), texto: "Cotação vencedora escolhida" }, { feito: false, texto: "Aprovação do Financeiro" }];
    case "pagamento": return [{ feito: false, texto: "Registrar a forma de pagamento" }, { feito: Boolean(p.comprovantePendente), texto: "Comprovante anexado", opcional: true }];
    case "retirada": return [{ feito: false, texto: "Confirmar o recebimento" }, ...(p.origemAtendimento === "estoque" ? [] : [{ feito: false, texto: "Informar o valor faturado" }])];
    default: return [];
  }
}

/**
 * O problema da data como a pessoa digitou (dd/mm/aaaa), para o formulário dizer
 * o que está errado: vazia, fora do formato, inexistente (31/02) ou já passada.
 */
export function problemaDaDataDigitada(texto: string, hoje: string): string | null {
  const t = texto.trim();
  if (!t) return "informe a data de entrega desejada.";
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!partes) return "use o formato dd/mm/aaaa.";
  const [dia, mes, ano] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return "data inexistente.";
  if (`${partes[3]}-${partes[2]}-${partes[1]}` < hoje) return "a data já passou; escolha de hoje em diante.";
  return null;
}

import type { EventoDoLancamento, TipoDeAnexo } from "@plugga/shared";

import { diaEmManaus } from "../compras/dias-uteis";

/**
 * Montagem pura do que a ficha mostra (PLU-337): o nome padronizado do comprovante
 * e a linha do tempo, a partir dos marcos do lançamento e do histórico gravado.
 */

/** "1742.18" → "R$ 1.742,18". */
export function emReais(valor: string): string {
  const [inteiro = "0", centavos = "00"] = valor.split(".");
  const milhares = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${milhares},${centavos.padEnd(2, "0").slice(0, 2)}`;
}

/** Sem barra, dois-pontos e o que o sistema de arquivos não aceita no nome do .zip. */
const limpar = (texto: string) => texto.replace(/[\\/:*?"<>|\r\n]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);

const EXTENSAO: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** "aaaa-mm-dd · código · favorecido · valor.pdf", com o dia do pagamento ou do recebimento. */
export function nomePadronizadoDoComprovante(d: { dia: Date; codigo: string; favorecido: string; valor: string; mime: string }): string {
  return `${diaEmManaus(d.dia)} · ${d.codigo} · ${limpar(d.favorecido)} · ${emReais(d.valor)}.${EXTENSAO[d.mime] ?? "pdf"}`;
}

type Pessoa = { id: string; name: string } | null;
const pessoa = (u: Pessoa) => (u ? { id: u.id, nome: u.name } : null);

export type MarcosDoLancamento = {
  tipo: "saida" | "entrada";
  createdAt: Date;
  criadoPor: Pessoa;
  aprovadoEm: Date | null;
  aprovadoPor: Pessoa;
  nfRegistradaEm: Date | null;
  nfNumero: string | null;
  nfRegistradaPor: Pessoa;
  boletoRegistradoEm: Date | null;
  boletoRegistradoPor: Pessoa;
  enviadoEm: Date | null;
  envioCanal: string | null;
  enviadoPor: Pessoa;
  pagamentoRegistradoEm: Date | null;
  pagamentoRegistradoPor: Pessoa;
  recebimentoRegistradoEm: Date | null;
  recebimentoRegistradoPor: Pessoa;
  valorRecebido: { toFixed(n: number): string } | null;
  conciliadoEm: Date | null;
  conciliadoPor: Pessoa;
  canceladoEm: Date | null;
  canceladoPor: Pessoa;
  cancelamentoMotivo: string | null;
};

export type ItemDoHistorico = { tipo: string; em: Date; por: Pessoa; dados: unknown; texto: string | null };

const NOME_DO_ANEXO: Record<TipoDeAnexo, string> = { comprovante: "Comprovante", nf: "NF", boleto: "Boleto", documento: "Documento" };

/** O resumo de um item gravado no histórico, pelo tipo e pelos dados estruturados. */
function resumoDoHistorico(h: ItemDoHistorico): { tipo: EventoDoLancamento["tipo"]; resumo: string } | null {
  const d = (h.dados ?? {}) as Record<string, unknown>;
  switch (h.tipo) {
    case "editado":
      return { tipo: "editado", resumo: "Lançamento editado" };
    case "valor_corrigido":
      return { tipo: "valor_corrigido", resumo: `Valor corrigido de ${emReais(String(d.de))} para ${emReais(String(d.para))}` };
    case "cobranca_registrada":
      return { tipo: "cobranca_registrada", resumo: `Cobrança por ${String(d.canal ?? "contato")}` };
    case "anexo_enviado":
      return { tipo: "anexo_enviado", resumo: `${NOME_DO_ANEXO[d.anexo as TipoDeAnexo] ?? "Anexo"} anexado` };
    case "conciliado":
      // O marco "Conciliado com o extrato" vem das colunas; no histórico, só o desfazer (o motivo vai no texto).
      return d.acao === "desfeito" ? { tipo: "conciliado", resumo: "Conciliação desfeita" } : null;
    case "anexo_substituido":
      return { tipo: "anexo_substituido", resumo: `${NOME_DO_ANEXO[d.anexo as TipoDeAnexo] ?? "Anexo"} substituído; o anterior segue no histórico` };
    // Os itens antigos do OMIE (integração extinta em 24/11/2026) e os desconhecidos não aparecem.
    default:
      return null;
  }
}

/** Marcos e histórico juntos, do mais recente ao mais antigo, até 200. */
export function linhaDoTempo(l: MarcosDoLancamento, historico: ItemDoHistorico[]): EventoDoLancamento[] {
  const itens: (EventoDoLancamento & { quando: number })[] = [];
  const marco = (tipo: EventoDoLancamento["tipo"], em: Date | null, por: Pessoa, resumo: string, texto: string | null = null) => {
    if (em) itens.push({ tipo, em: em.toISOString(), por: pessoa(por), resumo, texto, quando: em.getTime() });
  };
  marco("criado", l.createdAt, l.criadoPor, l.tipo === "saida" ? "Conta a pagar criada" : "Cobrança gerada");
  marco("aprovado", l.aprovadoEm, l.aprovadoPor, "Aprovada");
  marco("nf_registrada", l.nfRegistradaEm, l.nfRegistradaPor, `NF ${l.nfNumero ?? ""} registrada`.replace("  ", " "));
  marco("boleto_registrado", l.boletoRegistradoEm, l.boletoRegistradoPor, "Boleto gerado");
  marco("enviado", l.enviadoEm, l.enviadoPor, `Enviada ao cliente por ${l.envioCanal ?? "contato"}`);
  marco("pago", l.pagamentoRegistradoEm, l.pagamentoRegistradoPor, "Pagamento registrado");
  marco("recebido", l.recebimentoRegistradoEm, l.recebimentoRegistradoPor, l.valorRecebido ? `Recebido ${emReais(l.valorRecebido.toFixed(2))}` : "Recebido");
  marco("conciliado", l.conciliadoEm, l.conciliadoPor, "Conciliado com o extrato");
  marco("cancelado", l.canceladoEm, l.canceladoPor, "Cancelado", l.cancelamentoMotivo);
  for (const h of historico) {
    const r = resumoDoHistorico(h);
    if (r) itens.push({ ...r, em: h.em.toISOString(), por: pessoa(h.por), texto: h.texto, quando: h.em.getTime() });
  }
  return itens.sort((a, b) => b.quando - a.quando).slice(0, 200).map((e) => ({ tipo: e.tipo, em: e.em, por: e.por, resumo: e.resumo, texto: e.texto }));
}

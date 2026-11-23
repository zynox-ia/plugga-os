import { etapasDeCompra, rotulosDaEtapaDeCompra, rotulosDaFormaDePagamento, type EtapaDeCompra, type PedidoDeCompra } from "@plugga/shared";

import { diaCurto, hojeEmManaus, valorEmReais } from "./compras.ts";

/**
 * Ficha do pedido de compra (PLU-328): contas e textos que a tela mostra a
 * partir do pedido da API, sem React, para testar sem navegador.
 */

const diaParaData = (dia: string) => { const [a, m, d] = dia.split("-").map(Number) as [number, number, number]; return new Date(Date.UTC(a, m - 1, d)); };

/** Dia de Manaus de uma data e hora da API. */
export const diaDoIso = (iso: string): string => hojeEmManaus(new Date(iso));

/** "14:05" no relógio de Manaus. */
export function horaEmManaus(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 4 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Dias úteis (seg. a sex.) depois de `de` até `ate`, inclusive; negativo quando `ate` vem antes. */
export function diasUteisEntre(de: string, ate: string): number {
  const inicio = diaParaData(de); const fim = diaParaData(ate);
  const sinal = fim < inicio ? -1 : 1;
  const [a, b] = sinal === 1 ? [inicio, fim] : [fim, inicio];
  let n = 0;
  for (let d = new Date(a.getTime() + 86_400_000); d <= b; d = new Date(d.getTime() + 86_400_000)) {
    const semana = d.getUTCDay();
    if (semana !== 0 && semana !== 6) n++;
  }
  return n * sinal;
}

export const passagemAberta = (p: Pick<PedidoDeCompra, "passagens">) => p.passagens.find((x) => x.saiuEm === null) ?? null;

export type PrazoDaFicha = { tom: "ok" | "hoje" | "vencido"; texto: string; ate: string };

/** O prazo da etapa atual em palavras: "Faltam 2 dias úteis", "Vence hoje", "Vencida há 3 dias úteis". */
export function prazoDaEtapaAtual(p: Pick<PedidoDeCompra, "passagens" | "situacao">, hoje: string): PrazoDaFicha | null {
  const aberta = p.situacao === "em_andamento" ? passagemAberta(p) : null;
  if (!aberta) return null;
  const ate = diaDoIso(aberta.prazoEm);
  const faltam = diasUteisEntre(hoje, ate);
  const dias = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
  if (aberta.situacaoDoPrazo === "vencido" || faltam < 0) return { tom: "vencido", texto: `Etapa vencida há ${dias(Math.max(1, -faltam))}`, ate };
  if (aberta.situacaoDoPrazo === "vence_hoje" || faltam === 0) return { tom: "hoje", texto: "Vence hoje", ate };
  return { tom: "ok", texto: `Faltam ${dias(faltam)}`, ate };
}

/** Etapas que o pedido pulou: atendido pelo estoque vai da análise direto para a retirada. */
export function etapasPuladas(p: Pick<PedidoDeCompra, "origemAtendimento">): Set<EtapaDeCompra> {
  return new Set(p.origemAtendimento === "estoque" ? ["cotacoes", "aprovacao_compra", "pagamento"] : []);
}

/** Vencedora × orçado (proposta aprovada): quanto a cotação escolhida fica abaixo ou acima do valor orçado. */
export function comparacaoComOrcado(valorOrcado: string | null, totalDaVencedora: string | null): { abaixo: boolean; diferenca: string } | null {
  if (!valorOrcado || !totalDaVencedora) return null;
  const centavos = Math.round(Number(totalDaVencedora) * 100) - Math.round(Number(valorOrcado) * 100);
  if (!Number.isFinite(centavos) || centavos === 0) return centavos === 0 ? { abaixo: true, diferenca: valorEmReais("0")! } : null;
  return { abaixo: centavos < 0, diferenca: valorEmReais((Math.abs(centavos) / 100).toFixed(2))! };
}

/** Menor total e menor prazo entre as cotações, só quando há o que comparar. */
export function destaquesDasCotacoes(cotacoes: PedidoDeCompra["cotacoes"]): { menorTotal: Set<string>; menorPrazo: Set<string> } {
  const vazio = { menorTotal: new Set<string>(), menorPrazo: new Set<string>() };
  if (cotacoes.length < 2) return vazio;
  const total = Math.min(...cotacoes.map((c) => Number(c.valorTotal)));
  const prazos = cotacoes.map((c) => c.prazoEntregaDias).filter((d): d is number => d !== null);
  const prazo = prazos.length ? Math.min(...prazos) : null;
  return {
    menorTotal: new Set(cotacoes.filter((c) => Number(c.valorTotal) === total).map((c) => c.id)),
    menorPrazo: new Set(prazo === null ? [] : cotacoes.filter((c) => c.prazoEntregaDias === prazo).map((c) => c.id)),
  };
}

export type IconeDaAtividade = "criado" | "etapa" | "decisao" | "cotacao" | "vencedora" | "aprovado" | "pagamento" | "recebido" | "cancelado" | "revisao";
export type AtividadeDoPedido = {
  chave: string; em: string; quem: string | null; texto: string; icone: IconeDaAtividade;
  de?: EtapaDeCompra; para?: EtapaDeCompra; arquivo?: string; nota?: string;
};

/** Quem fez o quê, a partir dos marcos, cotações, pagamento e passagens do pedido; mais recente primeiro. */
export function atividadesDoPedido(p: PedidoDeCompra): AtividadeDoPedido[] {
  const m = p.marcos;
  const lista: AtividadeDoPedido[] = [{ chave: "criado", em: m.criado.em, quem: m.criado.por?.nome ?? null, texto: "abriu o pedido", icone: "criado", para: "pedido_gerado" }];
  if (m.analiseIniciada) lista.push({ chave: "analise", em: m.analiseIniciada.em, quem: m.analiseIniciada.por?.nome ?? null, texto: "iniciou a análise de estoque", icone: "etapa", de: "pedido_gerado", para: "analise_estoque" });
  if (m.estoqueDecidido) {
    const estoque = p.origemAtendimento === "estoque";
    lista.push({ chave: "decisao", em: m.estoqueDecidido.em, quem: m.estoqueDecidido.por?.nome ?? null, texto: estoque ? "decidiu atender pelo estoque" : "decidiu comprar", icone: "decisao", de: "analise_estoque", para: estoque ? "retirada" : "cotacoes" });
  }
  for (const c of p.cotacoes) lista.push({ chave: `cotacao-${c.id}`, em: c.criada.em, quem: c.criada.por?.nome ?? null, texto: `registrou a cotação de ${c.fornecedor.nome} (${valorEmReais(c.valorTotal)})`, icone: "cotacao", arquivo: c.arquivo.nome });
  const escolhida = p.cotacoes.find((c) => c.id === p.cotacaoSelecionadaId);
  if (m.cotacaoSelecionada && escolhida) lista.push({ chave: "vencedora", em: m.cotacaoSelecionada.em, quem: m.cotacaoSelecionada.por?.nome ?? null, texto: `escolheu a vencedora: ${escolhida.fornecedor.nome}`, icone: "vencedora" });
  m.revisoes.forEach((r, i) => lista.push({ chave: `revisao-${i}`, em: r.em, quem: r.por?.nome ?? null, texto: "pediu revisão das cotações", icone: "revisao", de: "aprovacao_compra", para: "cotacoes", nota: r.motivo }));
  if (m.aprovado) lista.push({ chave: "aprovado", em: m.aprovado.em, quem: m.aprovado.por?.nome ?? null, texto: "aprovou a compra", icone: "aprovado", de: "aprovacao_compra", para: "pagamento" });
  if (p.pagamento) lista.push({ chave: "pagamento", em: p.pagamento.registrado.em, quem: p.pagamento.registrado.por?.nome ?? null, texto: `registrou o pagamento por ${rotulosDaFormaDePagamento[p.pagamento.forma]}`, icone: "pagamento", de: "pagamento", para: "retirada", arquivo: p.pagamento.comprovante?.nome, nota: p.pagamento.observacao ?? undefined });
  if (m.recebimentoConfirmado) lista.push({ chave: "recebido", em: m.recebimentoConfirmado.em, quem: m.recebimentoConfirmado.por?.nome ?? null, texto: `confirmou o recebimento em ${diaCurto(m.recebimentoConfirmado.recebidoEm)}${p.valorFaturado ? ` (${valorEmReais(p.valorFaturado)} faturado)` : ""}`, icone: "recebido", de: "retirada", para: "concluido" });
  if (m.cancelado) lista.push({ chave: "cancelado", em: m.cancelado.em, quem: m.cancelado.por?.nome ?? null, texto: `cancelou o pedido em ${rotulosDaEtapaDeCompra[p.etapa]}`, icone: "cancelado", nota: m.cancelado.motivo });
  return lista.sort((a, b) => b.em.localeCompare(a.em));
}

/** Atividades agrupadas pelo dia de Manaus, com "Hoje" no dia atual. */
export function atividadesPorDia(lista: AtividadeDoPedido[], hoje: string): { dia: string; rotulo: string; itens: AtividadeDoPedido[] }[] {
  const grupos = new Map<string, AtividadeDoPedido[]>();
  for (const a of lista) { const dia = diaDoIso(a.em); grupos.set(dia, [...(grupos.get(dia) ?? []), a]); }
  return [...grupos].map(([dia, itens]) => ({ dia, rotulo: dia === hoje ? "Hoje" : `${diaCurto(dia)} ${dia.slice(0, 4)}`, itens }));
}

/** Só o que mudou em relação ao pedido, para o PATCH não reescrever o que outra pessoa alterou. */
export function camposDoPedidoAlterados(pedido: PedidoDeCompra, corpo: Record<string, unknown>, itensEditaveis: boolean): Record<string, unknown> {
  const original: Record<string, unknown> = {
    empresa: pedido.empresa, titulo: pedido.titulo, descricao: pedido.descricao,
    destino: pedido.destino.tipo, obraId: pedido.destino.obra?.id ?? null, clientId: pedido.destino.cliente?.id ?? null,
    itens: pedido.itens.map((i) => ({ descricao: i.descricao, quantidade: String(Number(i.quantidade)), unidade: i.unidade, ...(i.itemDeEstoque ? { itemDeEstoqueId: i.itemDeEstoque.id } : {}) })),
    prazoEntregaDesejado: pedido.prazoEntregaDesejado, valorOrcado: pedido.valorOrcado === null ? null : Number(pedido.valorOrcado).toFixed(2), responsavelId: pedido.responsavel?.id ?? null,
  };
  const mudou: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(corpo)) {
    if (campo === "itens" && !itensEditaveis) continue;
    const comparavel = campo === "itens" ? (valor as { quantidade: string }[]).map((i) => ({ ...i, quantidade: String(Number(i.quantidade)) })) : valor;
    if (JSON.stringify(comparavel) !== JSON.stringify(original[campo])) mudou[campo] = valor;
  }
  // O destino é validado junto com o vínculo: se um muda, os três vão.
  if (["destino", "obraId", "clientId"].some((c) => c in mudou)) Object.assign(mudou, { destino: corpo.destino, obraId: corpo.obraId, clientId: corpo.clientId });
  return mudou;
}

/** A trilha resumida para telas estreitas: "3 de 7 · Cotações", a barra e a próxima etapa do caminho. */
export function resumoDaTrilha(p: Pick<PedidoDeCompra, "etapa" | "situacao" | "origemAtendimento">): { posicao: number; total: number; atual: string; proxima: string | null } {
  const caminho = etapasDeCompra.filter((e) => !etapasPuladas(p).has(e));
  const i = Math.max(0, caminho.indexOf(p.etapa));
  const atual = p.situacao === "cancelado" ? `Cancelado em ${rotulosDaEtapaDeCompra[p.etapa]}` : rotulosDaEtapaDeCompra[p.etapa];
  const proxima = p.situacao === "em_andamento" ? caminho[i + 1] ?? null : null;
  return { posicao: i + 1, total: caminho.length, atual, proxima: proxima ? rotulosDaEtapaDeCompra[proxima] : null };
}

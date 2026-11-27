import { unidadeDaLinhaConflita } from "@plugga/shared";

/**
 * Unidade da linha do pedido de compra (PLU-328/332). A linha vinculada a um
 * item de estoque usa a unidade do item, e o campo fica travado enquanto o
 * vínculo existir (o saldo, a reserva e a entrada contam na unidade do item).
 * Linha sem vínculo tem unidade livre.
 *
 * O que vai para a API é sempre a unidade da própria linha: nada é convertido
 * em silêncio. Linha antiga em outra unidade ("4 cx" ligada a item em m)
 * aparece como conflito e só troca de unidade com a quantidade corrigida.
 * Mesmo critério do servidor (`unidadeDaLinhaConflita`).
 */
export type UnidadeDaLinha = {
  /** O que o campo mostra. */
  exibida: string;
  travada: boolean;
  conflito: { daLinha: string; doItem: string } | null;
  dica: string | null;
};

export function unidadeDaLinha(
  linha: { unidade: string; estoqueId: string | null },
  itensDoEstoque: readonly { id: string; unidade: string }[] | null,
): UnidadeDaLinha {
  if (!linha.estoqueId) return { exibida: linha.unidade, travada: false, conflito: null, dica: null };
  const doItem = itensDoEstoque?.find((i) => i.id.toLowerCase() === linha.estoqueId!.toLowerCase())?.unidade ?? null;
  if (doItem && unidadeDaLinhaConflita(linha.unidade, doItem)) {
    const daLinha = linha.unidade.trim();
    return { exibida: linha.unidade, travada: true, conflito: { daLinha, doItem }, dica: `Esta linha está em ${daLinha}, mas o item do estoque é controlado em ${doItem}.` };
  }
  const exibida = linha.unidade.trim() ? linha.unidade : doItem ?? linha.unidade;
  return { exibida, travada: true, conflito: null, dica: `Na unidade do item do estoque (${doItem ?? exibida}). Desvincule para mudar.` };
}

/** A unidade que vai para a API: a da própria linha, sem conversão (vazia vira null e o servidor adota a do item). */
export function unidadeParaEnviar(linha: { unidade: string }): string | null {
  return linha.unidade.trim() || null;
}

/** Ao vincular: sem quantidade digitada, a linha adota a unidade do item; com quantidade, nada muda (o conflito aparece, se houver). */
export function unidadeAoVincular(linha: { quantidade: string }, item: { unidade: string }): { unidade?: string } {
  return linha.quantidade.trim() ? {} : { unidade: item.unidade };
}

/** Corrigir para a unidade do item: a quantidade volta vazia, para ser digitada na unidade nova. */
export function corrigirParaAUnidadeDoItem(conflito: { doItem: string }): { unidade: string; quantidade: string } {
  return { unidade: conflito.doItem, quantidade: "" };
}

/** Bloqueia o envio dos itens enquanto uma linha vinculada estiver em outra unidade. */
export function problemaDaUnidade(u: UnidadeDaLinha): string | null {
  return u.conflito ? `a linha está em ${u.conflito.daLinha} e o item do estoque em ${u.conflito.doItem}: corrija a quantidade para ${u.conflito.doItem} ou desvincule o item.` : null;
}

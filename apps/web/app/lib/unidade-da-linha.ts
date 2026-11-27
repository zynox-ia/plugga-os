/**
 * Unidade da linha do pedido de compra (PLU-328/332): a linha vinculada a um
 * item de estoque usa a unidade do item, e o campo fica travado enquanto o
 * vínculo existir (o saldo, a reserva e a entrada contam na unidade do item).
 * Linha sem vínculo tem unidade livre. O servidor confere o mesmo: adota a do
 * item quando vem vazia e recusa unidade diferente.
 */
export function unidadeDaLinha(
  linha: { unidade: string; estoqueId: string | null },
  itensDoEstoque: readonly { id: string; unidade: string }[] | null,
): { unidade: string; travada: boolean; dica: string | null } {
  if (!linha.estoqueId) return { unidade: linha.unidade, travada: false, dica: null };
  const item = itensDoEstoque?.find((i) => i.id === linha.estoqueId);
  const unidade = item?.unidade ?? linha.unidade;
  return { unidade, travada: true, dica: `Na unidade do item do estoque (${unidade}). Desvincule para mudar.` };
}

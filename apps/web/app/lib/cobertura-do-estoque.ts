import type { AtendimentoPeloEstoque, MotivoSemCobertura } from "@plugga/shared";

import { qtd } from "./estoque.ts";

/**
 * Cobertura do estoque na análise do pedido de compra (PLU-328): quanto o
 * estoque da empresa atende cada linha e, quando não atende, por quê. Os números
 * vêm da API, com as mesmas condições da reserva (linhas do mesmo item dividem
 * o disponível; inativo e outra empresa não atendem).
 */

export type LinhaDaCobertura = AtendimentoPeloEstoque["itens"][number];

const MOTIVO: Readonly<Record<MotivoSemCobertura, string>> = {
  sem_vinculo: "Sem item do estoque vinculado.",
  inativo: "O item do estoque está inativo.",
  outra_empresa: "O item do estoque é de outra empresa.",
  unidade_diferente: "A linha está em outra unidade que o item do estoque.",
  insuficiente: "Disponível insuficiente.",
};

/** Atende inteira, em parte ou nada. */
export function tomDaLinha(linha: LinhaDaCobertura): "atende" | "parcial" | "nao" {
  if (linha.motivo === null) return "atende";
  return Number(linha.atende) > 0 ? "parcial" : "nao";
}

/** "Atende 4 m de 4 m" e, quando falta, o porquê com os números do item. */
export function textoDaLinha(linha: LinhaDaCobertura): { atende: string; porque: string | null } {
  const unidade = linha.itemDeEstoque?.unidade ?? "un";
  // Linha em outra unidade: a quantidade pedida aparece na unidade dela, nunca reescrita na do item.
  if (linha.motivo === "unidade_diferente") {
    const pedida = linha.unidadePedida ? qtd(linha.quantidadePedida, linha.unidadePedida) : linha.quantidadePedida;
    return {
      atende: `Unidade incompatível: ${pedida} pedidos`,
      porque: `A linha está em ${linha.unidadePedida ?? "outra unidade"} e o item é controlado em ${unidade}: corrija a unidade e a quantidade da linha.`,
    };
  }
  const atende = linha.itemDeEstoque ? `Atende ${qtd(linha.atende, unidade)} de ${qtd(linha.quantidadePedida, unidade)}` : "Não atende pelo estoque";
  if (linha.motivo === null) return { atende, porque: null };
  if (linha.motivo !== "insuficiente") return { atende, porque: MOTIVO[linha.motivo] };
  const disponivel = qtd(linha.disponivel ?? "0", unidade);
  const repetido = linha.pedidoDoItem !== null && Number(linha.pedidoDoItem) > Number(linha.quantidadePedida);
  return {
    atende,
    porque: repetido
      ? `${MOTIVO.insuficiente} ${disponivel} disponíveis para ${qtd(linha.pedidoDoItem!, unidade)} pedidos deste item no pedido.`
      : `${MOTIVO.insuficiente} ${disponivel} disponíveis.`,
  };
}

/** A frase de resumo acima das linhas. */
export function resumoDaCobertura(a: AtendimentoPeloEstoque): string {
  if (a.itens.length === 0) return "O pedido não tem itens.";
  if (a.atendeTudo) return "O estoque atende o pedido inteiro.";
  const atendidas = a.itens.filter((l) => l.motivo === null).length;
  return atendidas === 0 ? "O estoque não atende nenhum item do pedido." : `O estoque atende ${atendidas} de ${a.itens.length} itens.`;
}

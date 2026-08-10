import type { ItemConferido } from "./conferencia.js";

/**
 * Itens que aparecem na fatura mas não entram na conta.
 *
 * Bandeira tarifária é o caso clássico: a distribuidora imprime o adicional
 * mesmo quando a bandeira do ciclo é verde e o valor não é cobrado. Somar essa
 * linha estoura o total e reprova a Trava 1 — foi exatamente o que revelou, na
 * Santa Tereza de 06/2026, que a "Adicional Bandeira Amarela" de R$ 3.774,59
 * era informativa.
 *
 * A regra aqui exige **duas provas**, e é isso que a torna segura fora da
 * Roraima Energia:
 *
 * 1. o rótulo é de bandeira ou adicional tarifário;
 * 2. a aritmética da própria fatura mostra que, com o item dentro, a soma passa
 *    do total — e que sem ele fecha.
 *
 * Sem a segunda prova nada é marcado. Numa distribuidora onde a bandeira de
 * fato compõe o total, a soma já fecha com ela dentro e a regra não faz nada.
 *
 * O item nunca é removido: ele continua na lista, visível, apenas marcado como
 * fora do total, com o motivo registrado. Quem confere na tela pode discordar.
 */

/** Meio centavo, a mesma folga da conciliação. */
const TOLERANCIA = 0.005;

export const MOTIVO_INFORMATIVO = "marcado_como_informativo_por_trava_1";

/** Rótulos de bandeira e adicionais tarifários, em qualquer distribuidora. */
const BANDEIRA_OU_ADICIONAL =
  /bandeira|adicional\s+(tarif|band)|acr[ée]scimo\s+tarif/i;

export type ItemDaLeitura = ItemConferido & {
  compoeTotal: boolean;
  motivoForaDoTotal: string | null;
};

function soma(itens: readonly { valor: number }[]): number {
  return itens.reduce((total, item) => total + item.valor, 0);
}

/**
 * Marca como informativo o mínimo necessário para a soma fechar com o total.
 *
 * Tenta primeiro tirar todos os candidatos de uma vez; se isso passar do ponto,
 * tenta um a um. Não faz busca exaustiva de propósito: se nenhuma dessas duas
 * tentativas fecha, a fatura simplesmente não fecha, e é a Trava 1 que tem de
 * dizer isso — não este arquivo, adivinhando combinação.
 */
export function marcarInformativos(
  itens: readonly ItemConferido[],
  totalDaFatura: number | undefined,
): ItemDaLeitura[] {
  const comComposicao = itens.map((item) => ({
    ...item,
    compoeTotal: true,
    motivoForaDoTotal: null as string | null,
  }));

  if (totalDaFatura === undefined) return comComposicao;

  const diferenca = soma(comComposicao) - totalDaFatura;
  // Já fecha, ou falta valor em vez de sobrar: nada a marcar. Bandeira que
  // realmente compõe o total cai aqui e continua compondo.
  if (diferenca <= TOLERANCIA) return comComposicao;

  const candidatos = comComposicao.filter((item) =>
    BANDEIRA_OU_ADICIONAL.test(item.rotulo),
  );
  if (candidatos.length === 0) return comComposicao;

  const fecha = (fora: readonly ItemDaLeitura[]): boolean =>
    Math.abs(diferenca - soma(fora)) <= TOLERANCIA;

  const paraMarcar = fecha(candidatos)
    ? candidatos
    : candidatos.filter((candidato) => fecha([candidato])).slice(0, 1);

  if (paraMarcar.length === 0) return comComposicao;

  const fora = new Set(paraMarcar);
  return comComposicao.map((item) =>
    fora.has(item)
      ? { ...item, compoeTotal: false, motivoForaDoTotal: MOTIVO_INFORMATIVO }
      : item,
  );
}

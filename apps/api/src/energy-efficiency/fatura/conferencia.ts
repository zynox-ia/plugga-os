import type { ItemDaFatura } from "./itens.js";
import { folgaDoItem } from "../nucleo/conciliacao.js";

/**
 * Conferência aritmética do que foi lido da fatura.
 *
 * Esta é a garantia central do módulo, e o motivo de a leitura automática ser
 * aceitável: **a fatura confere a si mesma**. A distribuidora imprime
 * quantidade, tarifa e valor, e o produto tem que fechar. Se o leitor errar a
 * tarifa, trocar ponta com fora ponta ou perder um dígito, a conta não bate.
 *
 * Não é hipótese. No corpus real de faturas processadas hoje pelo agente, o OCR
 * corrompe números com frequência, e sempre do mesmo jeito — perdendo o dígito
 * da frente:
 *
 *     Demanda 7 kW a 22,960000 → impresso 160,72, lido 60,72
 *     Consumo F/Ponta 9.076 kWh a 0,540550 → impresso 4.906,03, lido 906,03
 *
 * Os dois casos são pegos aqui. É por isso que a conferência roda sobre
 * qualquer origem — texto, OCR ou digitação — e não só sobre o que este módulo
 * extrai.
 */

export type VeredictoDoItem = "confirmado" | "divergente" | "sem_conferencia";

export type ItemConferido = ItemDaFatura & {
  veredicto: VeredictoDoItem;
  /** Valor que a multiplicação produz; nulo quando não há o que multiplicar. */
  esperado: number | null;
  diferenca: number | null;
};

export type Conferencia = {
  itens: ItemConferido[];
  confirmados: number;
  divergentes: number;
  semConferencia: number;
  /** Verdadeiro quando algum item que dava para conferir não fechou. */
  temDivergencia: boolean;
};

/**
 * A mesma folga da conciliação normativa, não uma regra paralela da leitura.
 *
 * O leitor usava uma fórmula mais estrita baseada apenas na precisão impressa
 * da tarifa. Isso fazia o DANF3E reprovar linhas que a própria Trava 1 aceita.
 * Importar a regra elimina esse desacordo: qualquer origem é julgada pelo mesmo
 * limite, e erros grandes de OCR continuam muito além dele.
 */
export function conferir(itens: readonly ItemDaFatura[]): Conferencia {
  const conferidos: ItemConferido[] = itens.map((item) => {
    if (item.quantidade === null || item.tarifa === null) {
      return { ...item, veredicto: "sem_conferencia", esperado: null, diferenca: null };
    }

    const esperado = item.quantidade * item.tarifa;
    const diferenca = Math.abs(esperado - item.valor);

    return {
      ...item,
      veredicto: diferenca <= folgaDoItem(item.valor) ? "confirmado" : "divergente",
      esperado,
      diferenca,
    };
  });

  const contar = (v: VeredictoDoItem) => conferidos.filter((i) => i.veredicto === v).length;
  const divergentes = contar("divergente");

  return {
    itens: conferidos,
    confirmados: contar("confirmado"),
    divergentes,
    semConferencia: contar("sem_conferencia"),
    temDivergencia: divergentes > 0,
  };
}

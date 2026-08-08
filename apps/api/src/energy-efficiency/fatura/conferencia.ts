import type { ItemDaFatura } from "./itens.js";

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
 * Folga derivada da precisão que a fatura imprime, não escolhida a dedo.
 *
 * Duas fontes de diferença legítima, ambas do arredondamento da própria
 * distribuidora:
 *
 * - o **valor** sai arredondado ao centavo: até R$ 0,005 de diferença;
 * - a **tarifa** sai com seis casas, então a tarifa real pode diferir em até
 *   5×10⁻⁷ — e isso multiplica pela quantidade. Numa linha de 147.000 kWh dá
 *   quase oito centavos, o que uma folga fixa de um centavo reprovaria à toa.
 *
 * Foi exatamente o que aconteceu: 31.966 kWh × 0,574690 dá R$ 18.370,54 e a
 * fatura imprime R$ 18.370,53. Item correto, reprovado por folga cega.
 *
 * A folga continua ordens de grandeza abaixo dos erros que interessa pegar —
 * dígito perdido, vírgula deslocada — que são de dezenas por cento.
 */
export function folgaDeArredondamento(quantidade: number): number {
  return 0.01 + Math.abs(quantidade) * 5e-7;
}

export function conferir(itens: readonly ItemDaFatura[]): Conferencia {
  const conferidos: ItemConferido[] = itens.map((item) => {
    if (item.quantidade === null || item.tarifa === null) {
      return { ...item, veredicto: "sem_conferencia", esperado: null, diferenca: null };
    }

    const esperado = item.quantidade * item.tarifa;
    const diferenca = Math.abs(esperado - item.valor);

    return {
      ...item,
      veredicto: diferenca <= folgaDeArredondamento(item.quantidade) ? "confirmado" : "divergente",
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

import type { ProcessoLlm } from "./processo.js";

export type RegistroDeChamada = {
  processo: ProcessoLlm;
  modelo: string;
  modeloServido: string | null;
  tokensEntrada: number;
  tokensSaida: number;
  tokensCache: number;
  tokensRaciocinio: number;
  /** Custo em créditos informado pela OpenRouter; nulo quando ela não informou. */
  custoCreditos: number | null;
  duracaoMs: number;
  status: "ok" | "erro";
  erro: string | null;
  referencia: string | null;
  geracaoId: string | null;
};

export type ConsumoPorProcesso = {
  processo: string;
  chamadas: number;
  falhas: number;
  tokensEntrada: number;
  tokensSaida: number;
  tokensTotais: number;
  custoCreditos: number;
  /**
   * Objetos de negócio distintos atendidos — faturas lidas, por exemplo. É o
   * denominador que transforma "gastamos 3 milhões de tokens" em "cada fatura
   * custou tanto", que é a pergunta que decide se compensa.
   */
  referencias: number;
};

export type ConsumoPorModelo = {
  modelo: string;
  chamadas: number;
  tokensTotais: number;
  custoCreditos: number;
};

export type ConsumoPorDia = {
  dia: string;
  chamadas: number;
  tokensTotais: number;
  custoCreditos: number;
};

export type Janela = { desde: Date; ate: Date };

/**
 * Leitura e escrita do consumo da chave.
 *
 * Abstrato como o resto da casa, para o gateway poder ser testado sem banco.
 */
export abstract class ConsumoRepository {
  abstract registrar(dados: RegistroDeChamada): Promise<string>;
  abstract porProcesso(janela: Janela): Promise<ConsumoPorProcesso[]>;
  abstract porModelo(janela: Janela): Promise<ConsumoPorModelo[]>;
  abstract porDia(janela: Janela): Promise<ConsumoPorDia[]>;
}

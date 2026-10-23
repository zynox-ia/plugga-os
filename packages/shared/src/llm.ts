import { z } from "zod";

/** Estado da chave da OpenRouter como a tela e a API o enxergam. A chave nunca sai. */
export type EstadoDaChave = {
  /** Se há chave utilizável agora, venha do banco ou do ambiente. */
  configurada: boolean;
  /**
   * De onde a chave em uso veio: o banco tem precedência sobre o ambiente.
   * `banco_ilegivel` é o banco com uma linha que não decifra mais (chave-mestra
   * rotacionada sem regravar).
   */
  origem: "banco" | "banco_ilegivel" | "ambiente" | "nenhuma";
  /** Só os últimos quatro caracteres. */
  mascara: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/** Resposta de `GET /llm/chave`: o estado mais a prontidão do cofre. */
export type EstadoDaChaveComCofre = EstadoDaChave & { cofreConfigurado: boolean };

export const entradaDeChaveSchema = z.object({
  chave: z
    .string({
      required_error: "informe a chave da OpenRouter",
      invalid_type_error: "informe a chave da OpenRouter",
    })
    .trim()
    .min(8, "informe a chave da OpenRouter"),
});
export type EntradaDeChave = z.infer<typeof entradaDeChaveSchema>;

const dataIso = z
  .string()
  .refine((valor) => !Number.isNaN(new Date(valor).getTime()), "não é uma data válida");

export const consultaDeConsumoSchema = z.object({
  desde: dataIso.optional(),
  ate: dataIso.optional(),
});
export type ConsultaDeConsumo = z.infer<typeof consultaDeConsumoSchema>;

export type LinhaDeConsumo = {
  processo: string;
  nome: string;
  chamadas: number;
  falhas: number;
  tokensEntrada: number;
  tokensSaida: number;
  tokensTotais: number;
  custoCreditos: number;
  referencias: number;
  /** Custo por objeto de negócio atendido; nulo quando o processo não informa referência. */
  custoPorReferencia: number | null;
  tokensPorReferencia: number | null;
};

export type ResumoDeConsumo = {
  janela: { desde: string; ate: string };
  total: {
    chamadas: number;
    falhas: number;
    tokensTotais: number;
    custoCreditos: number;
  };
  porProcesso: LinhaDeConsumo[];
  porModelo: { modelo: string; chamadas: number; tokensTotais: number; custoCreditos: number }[];
  porDia: { dia: string; chamadas: number; tokensTotais: number; custoCreditos: number }[];
};

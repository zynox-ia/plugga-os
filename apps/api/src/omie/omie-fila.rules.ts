import type { OperacaoNoOmie } from "../financeiro/omie-envios.rules";
import { OmieFalhouError, type MotivoDaFalhaDoOmie } from "./omie.port";

/** O método do OMIE de cada envio, a chave do limitador e da pausa (seção 4 do desenho). */
export function metodoDoEnvio(tipo: "saida" | "entrada", operacao: OperacaoNoOmie): string {
  if (operacao === "gerar_boleto") return "GerarBoleto";
  const conta = tipo === "saida" ? "ContaPagar" : "ContaReceber";
  switch (operacao) {
    case "upsert":
      return `Upsert${conta}`;
    case "baixa":
      return tipo === "saida" ? "LancarPagamento" : "LancarRecebimento";
    case "cancelar":
      return `Cancelar${conta}`;
  }
}

/** Pausa da empresa inteira (credenciais recusadas), além da do método. */
export const TODA_A_EMPRESA = "*";

/** A empresa está pausada para este método, ou inteira. */
export const estaPausada = (pausas: readonly { company_id: string; metodo: string }[], empresa: string, metodo: string): boolean =>
  pausas.some((p) => p.company_id === empresa && (p.metodo === metodo || p.metodo === TODA_A_EMPRESA));

/**
 * O que a fila do OMIE faz com o resultado de um envio (PLU-342, seção 5 do desenho).
 * Regras puras: o relógio entra como parâmetro.
 */

export const MAXIMO_DE_TENTATIVAS = 6;
const BASE_DO_RETRY_MS = 30_000;
const TETO_DO_RETRY_MS = 30 * 60_000;
/** Bloqueio 425 do OMIE e portões fechados: espera 30 minutos, sem contar tentativa. */
export const PAUSA_MS = 30 * 60_000;

export type DestinoDaFalha =
  /** Falha permanente ou tentativas esgotadas: espera "Tentar de novo". */
  | { tipo: "erro"; motivo: MotivoDaFalhaDoOmie }
  /** Falha transitória: volta à fila, contando a tentativa. */
  | { tipo: "retentar"; motivo: MotivoDaFalhaDoOmie; tentativas: number; proximaEm: Date }
  /** Limite de consumo ou portão fechado: volta à fila sem contar a tentativa. */
  | { tipo: "adiar"; motivo: MotivoDaFalhaDoOmie; proximaEm: Date };

/** Não retentáveis: repetir só gasta a cota de erros que leva ao bloqueio do OMIE. */
const PERMANENTES: ReadonlySet<MotivoDaFalhaDoOmie> = new Set(["credenciais_invalidas", "recusada", "resposta_inesperada"]);
/** Não são falha do envio: o OMIE pediu pausa ou a escrita não está ligada. */
const ADIAVEIS: ReadonlySet<MotivoDaFalhaDoOmie> = new Set(["limite_de_consumo", "modo_mock", "modo_sem_escrita", "escrita_nao_liberada"]);

/** Atraso da tentativa `n` (1 = a primeira repetição): 30 s, 60 s, 120 s… até 30 min. */
export const atrasoDaTentativa = (n: number): number => Math.min(BASE_DO_RETRY_MS * 2 ** Math.max(0, n - 1), TETO_DO_RETRY_MS);

/**
 * `tentativasAntes`: quantas vezes o envio já falhou de forma transitória. Erro que
 * não é do OMIE (timeout, rede) conta como `indisponivel`.
 */
export function destinoDaFalha(erro: unknown, tentativasAntes: number, agora: Date): DestinoDaFalha {
  const motivo: MotivoDaFalhaDoOmie = erro instanceof OmieFalhouError ? erro.motivo : "indisponivel";
  if (PERMANENTES.has(motivo)) return { tipo: "erro", motivo };
  if (ADIAVEIS.has(motivo)) return { tipo: "adiar", motivo, proximaEm: new Date(agora.getTime() + PAUSA_MS) };
  const tentativas = tentativasAntes + 1;
  if (tentativas >= MAXIMO_DE_TENTATIVAS) return { tipo: "erro", motivo };
  return { tipo: "retentar", motivo, tentativas, proximaEm: new Date(agora.getTime() + atrasoDaTentativa(tentativas)) };
}

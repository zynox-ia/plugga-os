import type { ErroDeApi, ResultadoApi } from "./api-core";

/**
 * Dado de exemplo só existe em desenvolvimento e só por escolha explícita
 * (US12, T126). Antes, qualquer falha da API caía em `?? FALLBACK_*` sem avisar
 * e a tela mostrava números inventados como se fossem reais.
 *
 * Produção nunca usa exemplo, mesmo com a variável ligada por engano.
 */
export function exemploPermitido(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_SAMPLE_DATA === "true" && process.env.NODE_ENV === "development";
}

export type EstadoDaApi<U> =
  | { estado: "ok"; dados: U }
  | { estado: "exemplo"; dados: U }
  | { estado: "erro"; erro: ErroDeApi };

/**
 * Resolve o resultado de uma leitura. `extrair` tira da resposta o que a tela
 * usa (ex.: `(r) => r.items`). Só `indisponivel` pode ser coberto por exemplo
 * (e só se permitido): não autenticado, proibido e não encontrado são respostas
 * reais da API e sempre aparecem como tal.
 */
export function resolverEstado<T, U>(
  resultado: ResultadoApi<T>,
  extrair: (dados: T) => U,
  exemplo?: U,
): EstadoDaApi<U> {
  if (resultado.ok) return { estado: "ok", dados: extrair(resultado.dados) };
  if (exemplo !== undefined && resultado.erro.tipo === "indisponivel" && exemploPermitido()) {
    return { estado: "exemplo", dados: exemplo };
  }
  return { estado: "erro", erro: resultado.erro };
}

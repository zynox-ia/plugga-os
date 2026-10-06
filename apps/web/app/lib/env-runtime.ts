/**
 * URL interna da API, lida em TEMPO DE EXECUÇÃO (US12, T128).
 *
 * `API_INTERNAL_URL` não tem o prefixo `NEXT_PUBLIC_`, então o Next não a
 * congela no bundle: a mesma imagem serve a qualquer ambiente, e o valor vem do
 * `environment` do contêiner. Sem prefixo, ela também nunca vai para o
 * navegador.
 *
 * Compatibilidade: enquanto houver ambiente ainda configurado com o nome antigo
 * (`NEXT_PUBLIC_API_URL`), ele é aceito como reserva. Remover a reserva quando
 * o `compose.yaml` da VPS e o `.env` local estiverem migrados.
 *
 * Este módulo não importa `server-only` porque o `middleware.ts` (borda) e os
 * testes com `node --test` também o usam; o código de aplicação importa
 * `./env`, que carrega a trava.
 */
export function apiBaseUrl(): string {
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

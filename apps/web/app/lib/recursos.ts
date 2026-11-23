/**
 * Portões de recursos em construção. Um módulo que ainda não está completo não
 * pode ir pela metade à produção numa promoção da `develop` para a `main`.
 *
 * Financeiro (PLU-336 a PLU-342, decisão do Coordenador em 23/11/2026): ligado no
 * desenvolvimento e nos testes (`NODE_ENV` `development` ou `test`, o localhost do
 * André) e quando o build tem `NEXT_PUBLIC_FINANCEIRO_HABILITADO=true` (a CI, para
 * os e2e). Sem `NODE_ENV` conhecido, fica desligado (falha fechada).
 * Na produção, sem a variável, o menu fica em breve e `/financeiro/*` responde
 * 404. A API aplica o mesmo portão nas rotas `financeiro/*`, com a variável
 * `FINANCEIRO_HABILITADO` dela. Quando o módulo estiver completo, um commit tira
 * o portão dos dois lados.
 *
 * O prefixo `NEXT_PUBLIC_` faz o Next embutir o valor no bundle: o menu, que roda
 * no navegador, e o servidor leem o mesmo valor, sem mexer no `next.config.ts`.
 * Por isso o valor fica congelado no build: ligar em produção pela variável exige
 * um build novo, e pôr a variável só no `.env` do servidor não liga nada.
 */
export type AmbienteDosRecursos = { NODE_ENV?: string; NEXT_PUBLIC_FINANCEIRO_HABILITADO?: string };

export function financeiroHabilitado(
  ambiente: AmbienteDosRecursos = {
    NODE_ENV: process.env.NODE_ENV,
    // Lido por extenso: o Next só embute `process.env.NEXT_PUBLIC_*` escrito assim.
    NEXT_PUBLIC_FINANCEIRO_HABILITADO: process.env.NEXT_PUBLIC_FINANCEIRO_HABILITADO,
  },
): boolean {
  return ambiente.NODE_ENV === "development" || ambiente.NODE_ENV === "test" || ambiente.NEXT_PUBLIC_FINANCEIRO_HABILITADO === "true";
}

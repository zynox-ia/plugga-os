import { alcancaPlataforma, type Acesso } from "@plugga/shared";

/**
 * Catálogo das integrações e de quem as enxerga.
 *
 * Há dois tipos, e a diferença é de quem a integração serve, não da tecnologia:
 * - `plataforma`: infraestrutura do sistema (e-mail, chaves, serviços técnicos).
 *   Afeta todo mundo e só o desenvolvedor vê e mexe.
 * - `pessoal`: a pessoa conecta a própria conta (ex.: a agenda do Google) e usa
 *   para si. Qualquer membro vê.
 *
 * A mesma regra roda na API (o `@Plataforma` do controller); esconder aqui é só
 * o que a tela mostra, nunca a trava.
 */
export type EscopoDaIntegracao = "plataforma" | "pessoal";

export type IntegracaoDoCatalogo = {
  id: "brevo" | "google-oauth" | "cadastro" | "google-calendar";
  label: string;
  escopo: EscopoDaIntegracao;
};

export const INTEGRACOES: readonly IntegracaoDoCatalogo[] = [
  { id: "brevo", label: "Brevo", escopo: "plataforma" },
  { id: "cadastro", label: "Consulta de CNPJ e CEP", escopo: "plataforma" },
  { id: "google-oauth", label: "Google (OAuth)", escopo: "plataforma" },
  { id: "google-calendar", label: "Google Calendar", escopo: "pessoal" },
];

function enxerga(acesso: Acesso, integracao: IntegracaoDoCatalogo): boolean {
  return integracao.escopo === "pessoal" || alcancaPlataforma(acesso, "desenvolvedor");
}

/** As integrações que esta pessoa pode ver, na ordem do catálogo. */
export function integracoesParaAcesso(acesso: Acesso): IntegracaoDoCatalogo[] {
  return INTEGRACOES.filter((integracao) => enxerga(acesso, integracao));
}

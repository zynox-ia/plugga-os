import { alcancaDepartamento, alcancaPlataforma, type Acesso } from "@plugga/shared";

import { financeiroHabilitado, type AmbienteDosRecursos } from "./recursos.ts";

/**
 * Catálogo das integrações e de quem as enxerga.
 *
 * Há três tipos, e a diferença é de quem a integração serve, não da tecnologia:
 * - `plataforma`: infraestrutura do sistema (e-mail, chaves, serviços técnicos).
 *   Afeta todo mundo e só o desenvolvedor vê e mexe, na tela do Desenvolvedor.
 * - `pessoal`: a pessoa conecta a própria conta (ex.: a agenda do Google) e usa
 *   para si. Qualquer membro vê, na aba Integrações.
 * - `financeiro`: a conta das empresas que o Financeiro usa (o OMIE, PLU-342).
 *   Desenvolvedor, Admin e Gerente do Financeiro veem e mexem, na aba
 *   Integrações (decisão D6 do André, 23/11/2026). Fica atrás do portão do
 *   Financeiro: com ele fechado (produção), o OMIE volta a ser de plataforma, com
 *   o cartão da conta única na tela do Desenvolvedor.
 *
 * A mesma regra roda na API (`@Plataforma`/`@Departamento` do controller);
 * esconder aqui é só o que a tela mostra, nunca a trava.
 */
export type EscopoDaIntegracao = "plataforma" | "pessoal" | "financeiro";

/** Os dois lugares onde os cartões aparecem em Configurações. */
export type LugarDasIntegracoes = "integracoes" | "desenvolvedor";

const ESCOPOS_DO_LUGAR: Record<LugarDasIntegracoes, readonly EscopoDaIntegracao[]> = {
  integracoes: ["financeiro", "pessoal"],
  desenvolvedor: ["plataforma"],
};

export type IntegracaoDoCatalogo = {
  id: "brevo" | "google-oauth" | "cadastro" | "google-calendar" | "telegram" | "autentique" | "omie" | "openrouter" | "claude-assinatura" | "codex-assinatura";
  label: string;
  escopo: EscopoDaIntegracao;
};

export const INTEGRACOES: readonly IntegracaoDoCatalogo[] = [
  { id: "omie", label: "OMIE", escopo: "financeiro" },
  { id: "brevo", label: "Brevo", escopo: "plataforma" },
  { id: "cadastro", label: "Consulta de CNPJ e CEP", escopo: "plataforma" },
  { id: "telegram", label: "Telegram", escopo: "plataforma" },
  { id: "autentique", label: "Autentique", escopo: "plataforma" },
  { id: "openrouter", label: "OpenRouter", escopo: "plataforma" },
  { id: "claude-assinatura", label: "Claude", escopo: "plataforma" },
  { id: "codex-assinatura", label: "Codex", escopo: "plataforma" },
  { id: "google-oauth", label: "Google (OAuth)", escopo: "plataforma" },
  { id: "google-calendar", label: "Google Calendar", escopo: "pessoal" },
];

/** O escopo que vale agora: o do OMIE depende do portão do Financeiro (lib/recursos.ts). */
export function escopoDe(integracao: IntegracaoDoCatalogo, ambiente?: AmbienteDosRecursos): EscopoDaIntegracao {
  return integracao.escopo === "financeiro" && !financeiroHabilitado(ambiente) ? "plataforma" : integracao.escopo;
}

function enxerga(acesso: Acesso, escopo: EscopoDaIntegracao): boolean {
  switch (escopo) {
    case "pessoal": return true;
    // Admin e Desenvolvedor contam como gerente em todo departamento.
    case "financeiro": return alcancaDepartamento(acesso, "financeiro", "gerente");
    case "plataforma": return alcancaPlataforma(acesso, "desenvolvedor");
  }
}

/**
 * As integrações que esta pessoa pode ver, na ordem do catálogo. Com `lugar`, só
 * as daquele lugar: a aba Integrações (financeiro e pessoais) ou a tela do
 * Desenvolvedor (de plataforma). `ambiente` só existe para o teste do portão.
 */
export function integracoesParaAcesso(acesso: Acesso, lugar?: LugarDasIntegracoes, ambiente?: AmbienteDosRecursos): IntegracaoDoCatalogo[] {
  return INTEGRACOES.filter((integracao) => {
    const escopo = escopoDe(integracao, ambiente);
    return (lugar === undefined || ESCOPOS_DO_LUGAR[lugar].includes(escopo)) && enxerga(acesso, escopo);
  });
}

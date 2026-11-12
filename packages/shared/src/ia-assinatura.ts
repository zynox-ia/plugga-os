import { z } from "zod";

/**
 * IA pela assinatura (Claude e Codex) por um proxy de CLI local. O proxy guarda os
 * tokens de login no disco dele; o Plugga OS só pede o link de login, acompanha o
 * resultado e lista ou remove as contas. Nenhum token passa por aqui.
 *
 * Uso restrito a tarefas internas, sem dado de cliente: a porta que lê faturas é
 * outra (OpenRouter, com roteamento sem retenção) e não depende desta.
 */

export const provedoresDeAssinatura = ["claude", "codex"] as const;
export const provedorDeAssinaturaSchema = z.enum(provedoresDeAssinatura);
export type ProvedorDeAssinatura = z.infer<typeof provedorDeAssinaturaSchema>;

export const consultaDeLoginSchema = z.object({ estado: z.string().trim().min(1).max(200) }).strict();
export const consultaDeContaSchema = z.object({ arquivo: z.string().trim().min(1).max(200) }).strict();

export type ContaDeAssinatura = {
  /** Nome do arquivo de credencial no proxy; é o que identifica a conta para remover. */
  arquivo: string;
  email: string | null;
};

export type EstadoDaAssinatura = {
  provedor: ProvedorDeAssinatura;
  /** `nao_configurado`: faltam as variáveis do proxy na API; `fora_do_ar`: configurado, mas não responde. */
  proxy: "ok" | "fora_do_ar" | "nao_configurado";
  /** O desenvolvedor registrou que entende o risco de usar a assinatura assim. */
  riscoAceito: boolean;
  riscoAceitoEm: string | null;
  riscoAceitoPor: string | null;
  contas: ContaDeAssinatura[];
};

export type LoginDeAssinatura = {
  /** Endereço de autorização do provedor, para abrir no navegador. */
  url: string;
  /** Identificador para acompanhar o resultado do login. */
  estado: string;
};

export type SituacaoDoLogin = "aguardando" | "concluido" | "erro";

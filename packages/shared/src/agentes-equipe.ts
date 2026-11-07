import { z } from "zod";

import { acessoADepartamentoSchema, departamentoSchema, telaSchema } from "./acesso.js";
import { membroDaEquipeSchema } from "./equipe.js";

export const criacaoDeAgenteSchema = z
  .object({ name: z.string().trim().min(1).max(150), departamento: departamentoSchema, telas: z.array(telaSchema).max(50) })
  .strict()
  .superRefine((entrada, contexto) => {
    const acesso = acessoADepartamentoSchema.safeParse({ departamento: entrada.departamento, telas: entrada.telas, nivel: "membro" });
    if (!acesso.success) {
      contexto.addIssue({ code: "custom", path: ["telas"], message: "selecione telas distintas deste departamento" });
    }
  });

export const agenteDaEquipeSchema = membroDaEquipeSchema.extend({ tipo: z.literal("agente_ia") });

export const credencialDeAgenteSchema = z.object({
  userId: z.guid(),
  token: z.string(),
  expiresAt: z.string().datetime(),
}).strict();

export type CriacaoDeAgente = z.infer<typeof criacaoDeAgenteSchema>;
export type AgenteDaEquipe = z.infer<typeof agenteDaEquipeSchema>;
export type CredencialDeAgente = z.infer<typeof credencialDeAgenteSchema>;

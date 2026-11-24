import { randomBytes } from "node:crypto";

import { RUN_ID_VALIDO } from "./execucao";

/**
 * globalSetup: dá um runId à execução (ou usa o `E2E_RUN_ID` recebido). Os
 * workers herdam a variável, e os specs a usam em `marcaDaExecucao()`.
 */
export default function prepararExecucao(): void {
  const recebido = process.env.E2E_RUN_ID;
  if (recebido && !RUN_ID_VALIDO.test(recebido)) throw new Error("E2E_RUN_ID inválido: use de 6 a 40 letras, dígitos, _ ou -");
  process.env.E2E_RUN_ID = recebido || `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

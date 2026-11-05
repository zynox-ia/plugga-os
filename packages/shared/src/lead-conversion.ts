import { problemasDoCadastro, type ClienteParaValidar, type ProblemaDeCadastro } from "./clients.js";
import { leadProfileInputSchema } from "./deals.js";

const dadosDaConversaoSchema = leadProfileInputSchema.pick({
  name: true, personType: true, document: true, phone: true, email: true,
}).strip();

/** Converte dados salvos: nome e ao menos telefone, e-mail ou CPF/CNPJ válido. */
export function problemasDaConversaoDoLead(lead: ClienteParaValidar & { name: string }): ProblemaDeCadastro[] {
  const resultado = dadosDaConversaoSchema.safeParse(lead);
  if (!resultado.success) {
    return resultado.error.issues.map((issue) => ({ campo: String(issue.path[0]), problema: issue.message }));
  }

  const dados = resultado.data;
  // Na conversão, documento também identifica o cliente; as demais regras do cadastro continuam valendo.
  const problemas = problemasDoCadastro({ ...lead, ...dados }).filter((p) => p.campo !== "phone");
  if (!dados.phone && !dados.email && !dados.document) {
    problemas.unshift({ campo: "phone", problema: "Informe pelo menos um telefone, e-mail ou CPF/CNPJ antes de converter." });
  }
  return problemas;
}

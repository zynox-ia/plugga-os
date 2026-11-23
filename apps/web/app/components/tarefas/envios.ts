import {
  EVIDENCIA_DE_TAREFA_MAX_BYTES,
  tiposDeEvidenciaDeTarefa,
  type CriarTarefa,
  type DepartamentoComTarefas,
  type OcorrenciaDeTarefa,
  type Tarefa,
} from "@plugga/shared";

import { enviar, lerErro, type RespostaDeEnvio } from "../../lib/clientes";

/** Envios da tela de Tarefas pelo proxy same-origin (`/api/tarefas/:departamento/...`). */
const base = (departamento: DepartamentoComTarefas) => `/api/tarefas/${departamento}`;

export const criarTarefa = (departamento: DepartamentoComTarefas, corpo: CriarTarefa) => enviar<Tarefa>(base(departamento), "POST", corpo);
export const lerTarefa = (departamento: DepartamentoComTarefas, tarefaId: string) => enviar<Tarefa>(`${base(departamento)}/${tarefaId}`, "GET");
export const encerrarTarefa = (departamento: DepartamentoComTarefas, tarefaId: string, motivo: string) => enviar<Tarefa>(`${base(departamento)}/${tarefaId}/encerrar`, "POST", { motivo });

/** Concluir: multipart com o resultado, o checklist ("0,2") e o arquivo `evidencia`. */
export async function concluirOcorrencia(departamento: DepartamentoComTarefas, ocorrenciaId: string, dados: { resultado: string; checklist: number[]; evidencia: File | null }): Promise<RespostaDeEnvio<OcorrenciaDeTarefa>> {
  const form = new FormData();
  if (dados.resultado.trim()) form.set("resultado", dados.resultado.trim());
  form.set("checklist", dados.checklist.join(","));
  if (dados.evidencia) form.set("evidencia", dados.evidencia);
  try {
    const resposta = await fetch(`${base(departamento)}/ocorrencias/${ocorrenciaId}/concluir`, { method: "POST", body: form });
    const corpo = await resposta.json().catch(() => null);
    return resposta.ok ? { ok: true, dados: corpo as OcorrenciaDeTarefa } : { ok: false, erro: lerErro(corpo, "Não foi possível concluir a tarefa. Tente de novo.") };
  } catch {
    return { ok: false, erro: { mensagem: "Sem conexão com o servidor. Tente de novo.", porCampo: {} } };
  }
}

/** Confere a evidência antes do envio; a API confere de novo pelo conteúdo. */
export function problemaDaEvidencia(arquivo: File): string | null {
  if (!(tiposDeEvidenciaDeTarefa as readonly string[]).includes(arquivo.type)) return "envie PDF, JPG ou PNG.";
  if (arquivo.size > EVIDENCIA_DE_TAREFA_MAX_BYTES) return "o arquivo passa de 25 MB.";
  return null;
}

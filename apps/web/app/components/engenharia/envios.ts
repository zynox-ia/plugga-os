import { ARQUIVO_DE_ORDEM_MAX_BYTES, tiposDeFotoDaOrdem, type AcaoDaOrdemDeServico, type OrdemDeServico } from "@plugga/shared";

import { lerErro, type ErroDoFormulario } from "../../lib/clientes";

/**
 * Envios da ficha da O.S. pelo proxy same-origin. Todo POST/PATCH da O.S.
 * responde a ficha inteira. O erro guarda `motivo` e `agendadaPara`, que a API
 * põe no envelope do 409 do check-in antecipado (`codigo` é do catálogo fixo).
 */
export type ErroDaOrdem = ErroDoFormulario & { motivo?: string; agendadaPara?: string };
export type RespostaDaOrdem = { ok: true; dados: OrdemDeServico } | { ok: false; erro: ErroDaOrdem };

const caminhoDaOrdem = (id: string, resto = "") => `/api/engenharia/ordens-de-servico/${id}${resto}`;

async function ler(resposta: Response, padrao: string): Promise<RespostaDaOrdem> {
  const dados = await resposta.json().catch(() => null);
  if (resposta.ok) return { ok: true, dados: dados as OrdemDeServico };
  const corpo = (dados ?? {}) as { motivo?: unknown; agendadaPara?: unknown };
  return {
    ok: false,
    erro: {
      ...lerErro(dados, padrao),
      ...(typeof corpo.motivo === "string" ? { motivo: corpo.motivo } : {}),
      ...(typeof corpo.agendadaPara === "string" ? { agendadaPara: corpo.agendadaPara } : {}),
    },
  };
}

const semConexao: RespostaDaOrdem = { ok: false, erro: { mensagem: "Sem conexão com o servidor. Tente de novo.", porCampo: {} } };

export async function enviarParaAOrdem(id: string, resto: string, metodo: "GET" | "POST" | "PATCH", corpo?: unknown): Promise<RespostaDaOrdem> {
  try {
    const resposta = await fetch(caminhoDaOrdem(id, resto), {
      method: metodo,
      headers: corpo === undefined ? undefined : { "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return await ler(resposta, "Não foi possível salvar. Tente de novo.");
  } catch {
    return semConexao;
  }
}

export const agirNaOrdem = (id: string, acao: AcaoDaOrdemDeServico) => enviarParaAOrdem(id, "/acoes", "POST", acao);
export const relerOrdem = (id: string) => enviarParaAOrdem(id, "", "GET");

export async function enviarArquivoDaOrdem(id: string, resto: string, formulario: FormData): Promise<RespostaDaOrdem> {
  try {
    return await ler(await fetch(caminhoDaOrdem(id, resto), { method: "POST", body: formulario }), "Não foi possível enviar o arquivo. Tente de novo.");
  } catch {
    return semConexao;
  }
}

/** Confere a foto antes do envio; a API confere de novo pelo conteúdo. */
export function problemaDaFoto(arquivo: File): string | null {
  if (!(tiposDeFotoDaOrdem as readonly string[]).includes(arquivo.type)) return `${arquivo.name}: envie a foto em JPG ou PNG.`;
  if (arquivo.size > ARQUIVO_DE_ORDEM_MAX_BYTES) return `${arquivo.name}: a foto passa de 25 MB.`;
  return null;
}

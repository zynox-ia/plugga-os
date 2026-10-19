import {
  clientContactRoles,
  clientOrigins,
  formatarCep,
  formatarCnpj,
  formatarCpf,
  formatarTelefone,
  ufs,
  type ClientContactRole,
  type ClientDetail,
  type ClientDuplicateCandidate,
  type ClientOrigin,
  type ClientPersonType,
} from "@plugga/shared";

/** Rótulos, formatação e envio do cadastro de clientes (PLU-268), usados pela lista, pelo formulário e pela ficha. */

export const ORIGENS = clientOrigins;
export const PAPEIS = clientContactRoles;
export const UFS = ufs;

export const ROTULO_ORIGEM: Record<ClientOrigin, string> = {
  indicacao: "Indicação",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  site: "Site",
  telefone: "Telefone",
  email: "E-mail",
  evento: "Evento",
  prospeccao_ativa: "Prospecção ativa",
  cliente_existente: "Cliente existente",
  parceiro: "Parceiro",
  outro: "Outro",
};

export const ROTULO_PAPEL: Record<ClientContactRole, string> = {
  decisor: "Decisor",
  representante_legal: "Representante legal",
  tecnico: "Técnico",
  financeiro: "Financeiro",
  outro: "Outro",
};

export const ROTULO_MOTIVO: Record<ClientDuplicateCandidate["matchedOn"][number], string> = {
  document: "documento",
  phone: "telefone",
  email: "e-mail",
  name: "nome parecido",
};

export const ROTULO_TIPO: Record<ClientPersonType, string> = { pj: "Pessoa jurídica", pf: "Pessoa física" };

export function documentoFormatado(tipo: ClientPersonType, documento: string | null): string | null {
  if (!documento) return null;
  return tipo === "pj" ? formatarCnpj(documento) : formatarCpf(documento);
}

export function telefoneFormatado(telefone: string | null): string | null {
  return telefone ? formatarTelefone(telefone) : null;
}

export function enderecoEmUmaLinha(
  cliente: Pick<ClientDetail, "street" | "addressComplement" | "district" | "city" | "state" | "postalCode">,
): string | null {
  const cidade = [cliente.city, cliente.state].filter(Boolean).join("/");
  const partes = [
    [cliente.street, cliente.addressComplement].filter(Boolean).join(", "),
    cliente.district,
    cidade,
    cliente.postalCode ? `CEP ${formatarCep(cliente.postalCode)}` : null,
  ].filter((parte): parte is string => !!parte);
  return partes.length > 0 ? partes.join(" · ") : null;
}

const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "Hotel Mirante do Rio" → "HM": duas primeiras palavras, sem conectivos. */
export function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter((p) => p && !CONECTIVOS.has(p.toLowerCase()));
  return ((palavras[0]?.[0] ?? "") + (palavras[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** A ficha abre por cima da lista e tem endereço próprio: o mesmo link mostra a mesma ficha. */
export function hrefDaFicha(id: string | null, filtros: { q?: string; active?: string } = {}): string {
  const consulta = new URLSearchParams();
  if (filtros.q) consulta.set("q", filtros.q);
  if (filtros.active) consulta.set("active", filtros.active);
  if (id) consulta.set("cliente", id);
  const texto = consulta.toString();
  return texto ? `/clientes?${texto}` : "/clientes";
}

export type ErroDoFormulario = { mensagem: string; codigo?: string; porCampo: Record<string, string> };

/** Envelope da API (`{ codigo, mensagem, detalhes }`) ou do proxy (`{ codigo, message }`). */
export function lerErro(corpo: unknown, padrao: string): ErroDoFormulario {
  const dados = (corpo ?? {}) as { codigo?: string; mensagem?: string; message?: string; detalhes?: Array<{ campo: string; problema: string }> };
  const porCampo: Record<string, string> = {};
  for (const detalhe of dados.detalhes ?? []) {
    const campo = detalhe.campo.split(".")[0] ?? detalhe.campo;
    porCampo[campo] ??= detalhe.problema;
  }
  const mensagem = Object.keys(porCampo).length > 0 ? "Confira os campos destacados." : (dados.mensagem ?? dados.message ?? padrao);
  return { mensagem, codigo: dados.codigo, porCampo };
}

export type RespostaDeEnvio<T> = { ok: true; dados: T } | { ok: false; erro: ErroDoFormulario };

export async function enviar<T>(caminho: string, metodo: "GET" | "POST" | "PATCH" | "DELETE", corpo?: unknown): Promise<RespostaDeEnvio<T>> {
  try {
    const resposta = await fetch(caminho, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) return { ok: false, erro: lerErro(dados, "Não foi possível salvar. Tente de novo.") };
    return { ok: true, dados: dados as T };
  } catch {
    return { ok: false, erro: { mensagem: "Sem conexão com o servidor. Tente de novo.", porCampo: {} } };
  }
}

import {
  companyKeys,
  departamentosDosProtocolos,
  protocoloEncerrado,
  situacoesDoProtocolo,
  type CompanyKey,
  type DepartamentoDoProtocolo,
  type ListarProtocolosResposta,
  type ProtocoloResumo,
  type SituacaoDoProtocolo,
  type TipoDeProtocolo,
} from "@plugga/shared";

import { diaDaAgenda } from "./ordens-de-servico.ts";

/**
 * Protocolos na distribuidora (PLU-348): filtros pelo endereço, textos da data-limite
 * e da próxima verificação, a trilha e as regras dos formulários. Uma tela só,
 * /engenharia/protocolos, para a Engenharia e o Operacional (o departamento é filtro).
 */

export const ROTA_PROTOCOLOS = "/engenharia/protocolos";

/** O filtro Situação da tela, em grupos (protótipo de 23/11/2026): um valor só no endereço. */
export const filtrosDeSituacaoDosProtocolos = ["em_andamento", "aberto", "em_analise", "com_pendencia", "verificar_hoje", "vencendo", "respondido", "liberado", "indeferido"] as const;
export type FiltroDeSituacaoDoProtocolo = (typeof filtrosDeSituacaoDosProtocolos)[number];

export const GRUPOS_DO_FILTRO_DOS_PROTOCOLOS: { rotulo: string; valores: readonly FiltroDeSituacaoDoProtocolo[] }[] = [
  { rotulo: "Em andamento", valores: ["em_andamento", "aberto", "em_analise", "com_pendencia"] },
  { rotulo: "Atenção", valores: ["verificar_hoje", "vencendo"] },
  { rotulo: "Encerrados", valores: ["respondido", "liberado", "indeferido"] },
];

export const ROTULO_DO_FILTRO_DOS_PROTOCOLOS: Record<FiltroDeSituacaoDoProtocolo, string> = {
  em_andamento: "Todos em andamento",
  aberto: "Abertos",
  em_analise: "Em análise",
  com_pendencia: "Com pendência",
  verificar_hoje: "Verificar hoje",
  vencendo: "Data-limite em 7 dias",
  respondido: "Respondidos",
  liberado: "Liberados",
  indeferido: "Indeferidos",
};

/** Contagem ao lado da opção, quando a API manda (as contagens ignoram o filtro de situação). */
export function contagemDoFiltroDosProtocolos(valor: FiltroDeSituacaoDoProtocolo, c: ListarProtocolosResposta["contagens"]): number | null {
  if (valor === "em_andamento") return c.emAndamento;
  if (valor === "verificar_hoje") return c.verificarHoje;
  if (valor === "vencendo") return c.vencemEm7Dias;
  return null;
}

export const ROTULO_DO_TIPO_DE_PROTOCOLO: Record<TipoDeProtocolo, string> = {
  orcamento_de_conexao: "Orçamento de conexão",
  liberacao: "Liberação",
  cusd: "CUSD",
  carta_denuncia: "Carta-denúncia",
  permanencia_no_cativo: "Permanência no cativo",
  retorno_ao_cativo: "Retorno ao cativo",
  outros: "Outros",
};

export const ROTULO_DA_SITUACAO_DO_PROTOCOLO: Record<SituacaoDoProtocolo, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  com_pendencia: "Com pendência",
  respondido: "Respondido",
  liberado: "Liberado",
  indeferido: "Indeferido",
};

export const ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO: Record<DepartamentoDoProtocolo, string> = {
  "engenharia-obras": "Engenharia",
  "energia-opm": "Operacional",
};

export type FiltrosDosProtocolos = {
  situacao?: FiltroDeSituacaoDoProtocolo;
  distribuidoraId?: string;
  empresa?: CompanyKey;
  departamento?: DepartamentoDoProtocolo;
  busca?: string;
};

const ID_DE_DISTRIBUIDORA = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuidDeProtocolo = (v: string | undefined | null): v is string => Boolean(v && UUID.test(v));

export function lerFiltrosDosProtocolos(p: Record<string, string | undefined>): FiltrosDosProtocolos {
  const situacao = filtrosDeSituacaoDosProtocolos.find((s) => s === p.situacao);
  const empresa = companyKeys.find((e) => e === p.empresa);
  const departamento = departamentosDosProtocolos.find((d) => d === p.departamento);
  const distribuidoraId = p.distribuidora && p.distribuidora.length <= 60 && ID_DE_DISTRIBUIDORA.test(p.distribuidora) ? p.distribuidora : undefined;
  return {
    ...(situacao ? { situacao } : {}),
    ...(distribuidoraId ? { distribuidoraId } : {}),
    ...(empresa ? { empresa } : {}),
    ...(departamento ? { departamento } : {}),
    ...(p.busca?.trim() ? { busca: p.busca.trim().slice(0, 150) } : {}),
  };
}

export function hrefDosProtocolos(f: FiltrosDosProtocolos, protocolo?: string | null): string {
  const q = new URLSearchParams();
  if (f.situacao) q.set("situacao", f.situacao);
  if (f.distribuidoraId) q.set("distribuidora", f.distribuidoraId);
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.departamento) q.set("departamento", f.departamento);
  if (f.busca) q.set("busca", f.busca);
  if (protocolo) q.set("protocolo", protocolo);
  const texto = q.toString();
  return texto ? `${ROTA_PROTOCOLOS}?${texto}` : ROTA_PROTOCOLOS;
}

/** Filtros que "Limpar" desfaz (a empresa fica, como nas outras telas). */
export const temFiltroNosProtocolos = (f: FiltrosDosProtocolos): boolean => Boolean(f.situacao || f.distribuidoraId || f.departamento || f.busca);

/** A consulta da API. "Data-limite em 7 dias" pede os em andamento e a tela corta (`soVencendo`). */
export function consultaDosProtocolos(f: FiltrosDosProtocolos): Record<string, string | undefined> {
  const s = f.situacao;
  return {
    departamento: f.departamento,
    distribuidoraId: f.distribuidoraId,
    empresa: f.empresa,
    busca: f.busca,
    ...(s === "em_andamento" || s === "vencendo" ? { grupo: "em_andamento" } : s === "verificar_hoje" ? { verificarHoje: "sim" } : s ? { situacao: s } : {}),
  };
}

/** Os em andamento com a data-limite em até 7 dias (inclui os vencidos). */
export const soVencendo = (itens: readonly ProtocoloResumo[]): ProtocoloResumo[] =>
  itens.filter((p) => !protocoloEncerrado(p.situacao) && p.diasParaOLimite !== null && p.diasParaOLimite <= 7);

// ---------------------------------------------------------------- textos

export type TomDoProtocolo = "perigo" | "alerta" | null;

/** A data-limite do card: "venceu há 2 dias", "vence hoje", "vence em 5 dias"; encerrado, a situação. */
export function prazoDoProtocolo(p: Pick<ProtocoloResumo, "situacao" | "dataLimite" | "diasParaOLimite">): { texto: string; tom: TomDoProtocolo } {
  if (protocoloEncerrado(p.situacao) || p.diasParaOLimite === null) return { texto: ROTULO_DA_SITUACAO_DO_PROTOCOLO[p.situacao].toLowerCase(), tom: null };
  const n = p.diasParaOLimite;
  if (n < 0) return { texto: `venceu há ${-n} ${n === -1 ? "dia" : "dias"}`, tom: "perigo" };
  if (n === 0) return { texto: "vence hoje", tom: "alerta" };
  return { texto: `vence em ${n} ${n === 1 ? "dia" : "dias"}`, tom: n <= 2 ? "alerta" : null };
}

/** "verificar hoje", "verificar amanhã", "verificar qui 26 nov", "sem lembrete" ou "encerrado". */
export function textoDaVerificacao(p: Pick<ProtocoloResumo, "situacao" | "proximaVerificacao" | "verificarHoje">, hoje: string): string {
  if (protocoloEncerrado(p.situacao)) return "encerrado";
  if (p.verificarHoje) return "verificar hoje";
  if (!p.proximaVerificacao) return "sem lembrete";
  return `verificar ${diaDaAgenda(p.proximaVerificacao, hoje).toLowerCase()}`;
}

/** A trilha da ficha: Aberto → Em análise → o desfecho. Pendência fica em análise. */
export const ETAPAS_DO_PROTOCOLO = ["aberto", "em_analise", "desfecho"] as const;
export function passoDoProtocolo(situacao: SituacaoDoProtocolo): number {
  if (situacao === "aberto") return 0;
  if (situacao === "em_analise" || situacao === "com_pendencia") return 1;
  return 2;
}
export const rotuloDoDesfecho = (situacao: SituacaoDoProtocolo): string =>
  situacao === "liberado" || situacao === "indeferido" ? ROTULO_DA_SITUACAO_DO_PROTOCOLO[situacao] : "Respondido";

/** O dia + n dias (AAAA-MM-DD). */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- formulários

export type NovoProtocolo = {
  empresa: CompanyKey | "";
  departamento: DepartamentoDoProtocolo | "";
  tipo: TipoDeProtocolo | "";
  clienteId: string;
  ucId: string;
  distribuidoraId: string;
  numero: string;
  abertoEm: string;
  dataLimite: string;
  proximaVerificacao: string;
  observacao: string;
};
export type ProblemasDoProtocolo = Partial<Record<keyof NovoProtocolo, string>>;

/** As regras do contrato antes de enviar: nada no passado; a abertura nunca no futuro. */
export function problemasDoNovoProtocolo(p: NovoProtocolo, hoje: string): ProblemasDoProtocolo {
  const e: ProblemasDoProtocolo = {};
  if (!p.empresa) e.empresa = "escolha a empresa.";
  if (!p.departamento) e.departamento = "escolha o departamento.";
  if (!p.tipo) e.tipo = "escolha o tipo.";
  if (!p.clienteId) e.clienteId = "escolha o cliente.";
  else if (!p.ucId) e.ucId = "escolha a UC.";
  if (!p.distribuidoraId) e.distribuidoraId = "escolha a distribuidora.";
  if (!p.numero.trim()) e.numero = "informe o número do protocolo.";
  if (!p.abertoEm) e.abertoEm = "informe quando o protocolo foi aberto.";
  else if (p.abertoEm > hoje) e.abertoEm = "a abertura não pode estar no futuro.";
  if (!p.dataLimite) e.dataLimite = "informe a data-limite.";
  else if (p.dataLimite < hoje) e.dataLimite = "a data-limite não pode estar no passado.";
  else if (p.abertoEm && p.dataLimite < p.abertoEm) e.dataLimite = "a data-limite vem depois da abertura.";
  if (p.proximaVerificacao && p.proximaVerificacao < hoje) e.proximaVerificacao = "a verificação não pode estar no passado.";
  return e;
}

export type Verificacao = { situacao: SituacaoDoProtocolo; nota: string; acaoPendente: string; proximaVerificacao: string };
export type ProblemasDaVerificacao = Partial<Record<keyof Verificacao, string>>;

/** O resultado da verificação vira a nova situação (o contrato não aceita voltar a "aberto"). */
export const RESULTADOS_DA_VERIFICACAO: readonly SituacaoDoProtocolo[] = situacoesDoProtocolo.filter((s) => s !== "aberto");
export const ROTULO_DO_RESULTADO: Record<SituacaoDoProtocolo, string> = {
  aberto: "Aberto",
  em_analise: "Sem resposta · em análise",
  com_pendencia: "Pendência da distribuidora",
  respondido: "Respondido",
  liberado: "Liberado",
  indeferido: "Indeferido",
};

export function problemasDaVerificacao(v: Verificacao, hoje: string): ProblemasDaVerificacao {
  const e: ProblemasDaVerificacao = {};
  if (v.situacao === "com_pendencia" && !v.acaoPendente.trim()) e.acaoPendente = "diga o que precisa ser feito.";
  if (!protocoloEncerrado(v.situacao)) {
    if (!v.proximaVerificacao) e.proximaVerificacao = "marque a próxima verificação.";
    else if (v.proximaVerificacao < hoje) e.proximaVerificacao = "a verificação não pode estar no passado.";
  }
  return e;
}

/** O corpo da verificação: a ação só em pendência; a próxima só enquanto não encerra. */
export function corpoDaVerificacao(v: Verificacao): { situacao: SituacaoDoProtocolo; nota: string | null; acaoPendente: string | null; proximaVerificacao: string | null } {
  const fecha = protocoloEncerrado(v.situacao);
  return {
    situacao: v.situacao,
    nota: v.nota.trim() || null,
    acaoPendente: v.situacao === "com_pendencia" ? v.acaoPendente.trim() : null,
    proximaVerificacao: fecha ? null : v.proximaVerificacao,
  };
}

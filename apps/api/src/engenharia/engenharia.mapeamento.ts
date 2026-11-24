import type { Prisma } from "@prisma/client";
import {
  codigoDaOrdemDeServico,
  type Acesso,
  type ArquivoDaOrdem,
  type CompanyKey,
  type EventoDaOrdem,
  type OrdemDeServico,
  type OrdemDeServicoResumo,
  type PessoaDaEngenharia,
} from "@plugga/shared";

import { diaEmManaus } from "../compras/dias-uteis";
import { acoesPermitidas, colunaDa, estaAtrasada, mascararDocumento } from "./engenharia.rules";
import { kwpCurto } from "./usinas.rules";

/** Linha da lista e do quadro: escalares, sem relações com pessoas (o RLS de users não as entrega). */
export const SELECT_DO_RESUMO = {
  id: true,
  numero: true,
  companyId: true,
  tipo: true,
  situacao: true,
  prioridade: true,
  origem: true,
  descricao: true,
  clientId: true,
  local: true,
  tecnicoId: true,
  apoioId: true,
  agendadaPara: true,
  adiadaPara: true,
  prazo: true,
  createdAt: true,
  usina: { select: { id: true, nome: true, potenciaKwp: true, plataforma: { select: { nome: true } } } },
  _count: { select: { arquivos: { where: { categoria: "foto", substituidoEm: null } } } },
} satisfies Prisma.OrdemDeServicoSelect;
export type LinhaDoResumo = Prisma.OrdemDeServicoGetPayload<{ select: typeof SELECT_DO_RESUMO }>;

export const INCLUDE_DA_FICHA = {
  arquivos: { where: { substituidoEm: null }, orderBy: { enviadoEm: "asc" } },
  termo: true,
  historico: { orderBy: { em: "asc" } },
  pedidosDeCompra: {
    select: { id: true, numero: true, titulo: true, etapa: true, canceladoEm: true, concluidoEm: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
  ordemAnterior: { select: { id: true, numero: true } },
  obra: { select: { id: true, nome: true } },
  // A usina que nasceu desta O.S. de comissionamento (no máximo uma, pelo índice único).
  usinasComissionadas: { select: { id: true, nome: true }, take: 1 },
  usina: { select: { id: true, nome: true, potenciaKwp: true, plataforma: { select: { nome: true } } } },
  _count: { select: { arquivos: { where: { categoria: "foto", substituidoEm: null } } } },
} satisfies Prisma.OrdemDeServicoInclude;
export type LinhaDaFicha = Prisma.OrdemDeServicoGetPayload<{ include: typeof INCLUDE_DA_FICHA }>;

export type Nomes = ReadonlyMap<string, string>;
export type UcDaOrdem = { id: string; clientId: string; codigo: string; distribuidora: string };

const pessoa = (id: string | null, nomes: Nomes): PessoaDaEngenharia | null => (id ? { id, nome: nomes.get(id) ?? "Pessoa sem acesso" } : null);
const registro = (porId: string | null, em: Date, nomes: Nomes) => ({ por: pessoa(porId, nomes), em: em.toISOString() });

export function paraResumo(linha: LinhaDoResumo, pessoas: Nomes, clientes: Nomes, agora: Date): OrdemDeServicoResumo {
  return {
    id: linha.id,
    numero: linha.numero,
    codigo: codigoDaOrdemDeServico(linha.numero),
    empresa: linha.companyId as CompanyKey,
    tipo: linha.tipo,
    situacao: linha.situacao,
    coluna: colunaDa(linha.situacao),
    prioridade: linha.prioridade,
    origem: linha.origem,
    descricao: linha.descricao,
    cliente: { id: linha.clientId, nome: clientes.get(linha.clientId) ?? "Cliente" },
    local: linha.local,
    usina: linha.usina
      ? { id: linha.usina.id, nome: linha.usina.nome, potenciaKwp: kwpCurto(linha.usina.potenciaKwp.toString()), plataforma: linha.usina.plataforma.nome }
      : null,
    tecnico: pessoa(linha.tecnicoId, pessoas),
    apoio: pessoa(linha.apoioId, pessoas),
    agendadaPara: linha.agendadaPara?.toISOString() ?? null,
    novaData: linha.situacao === "adiada" && linha.adiadaPara ? diaEmManaus(linha.adiadaPara) : null,
    prazo: diaEmManaus(linha.prazo),
    atrasada: estaAtrasada(linha, agora),
    fotos: linha._count.arquivos,
    createdAt: linha.createdAt.toISOString(),
  };
}

const BASE = "/engenharia/ordens-de-servico";
type LinhaDeArquivo = LinhaDaFicha["arquivos"][number];
const paraArquivo = (ordemId: string, arquivo: LinhaDeArquivo, nomes: Nomes): ArquivoDaOrdem => ({
  id: arquivo.id,
  nome: arquivo.arquivoNome,
  tamanhoBytes: arquivo.arquivoTamanho,
  tipo: arquivo.arquivoTipo,
  url: `${BASE}/${ordemId}/arquivos/${arquivo.id}`,
  enviado: registro(arquivo.enviadoPorId, arquivo.enviadoEm, nomes),
});

const SITUACAO: Record<string, string> = {
  aberta: "aberta", agendada: "agendada", em_campo: "em campo", laudo: "com laudo", concluida: "concluída", adiada: "adiada", cancelada: "cancelada",
};

const quando = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const instante = new Date(iso);
  const [, mes, dia] = diaEmManaus(instante).split("-");
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instante);
  return `${dia}/${mes} às ${hora}`;
};
const dia = (valor: string | null | undefined): string => (valor ? valor.split("-").reverse().slice(0, 2).join("/") : "");

type Dados = Record<string, string | null | undefined>;

/** Texto pronto da linha do tempo. Nunca leva o documento de quem assinou. */
export function descricaoDoEvento(tipo: string, dados: Dados, nomes: Nomes): string {
  const nome = (id: string | null | undefined) => (id ? nomes.get(id) ?? "pessoa sem acesso" : "");
  const comQuem = () => [nome(dados.tecnicoId), dados.apoioId ? `apoio de ${nome(dados.apoioId)}` : ""].filter(Boolean).join(", ");
  switch (tipo) {
    case "criada": return "O.S. aberta";
    case "editada": return "Dados da O.S. alterados";
    case "agendada": return `Agendada para ${quando(dados.agendadaPara)} com ${comQuem()}`;
    case "remarcada": return `Remarcada para ${quando(dados.agendadaPara)} com ${comQuem()}`;
    case "checkin": return "Chegada ao local registrada";
    case "checkin_antecipado": return `Chegada antes do dia agendado (${quando(dados.agendadaPara)}); remarcada para agora`;
    case "foto_enviada": return "Foto enviada";
    case "laudo_registrado": return "Laudo registrado";
    case "termo_assinado": return dados.modo === "pdf_externo" ? "Termo assinado à parte anexado" : "Termo assinado pelo cliente na tela";
    case "concluida": return "O.S. concluída";
    case "adiada": return `Adiada para ${dia(dados.novaData)}${dados.horario ? ` às ${dados.horario}` : ""}`;
    case "cancelada": return `Cancelada quando estava ${SITUACAO[dados.situacaoAnterior ?? ""] ?? dados.situacaoAnterior ?? ""}`.trim();
    case "material_pedido": return `Material pedido a Compras (PC-${String(dados.numero ?? "").padStart(4, "0")})`;
    default: return tipo;
  }
}

/** Pessoas citadas nos dados da linha do tempo (técnico e apoio). */
export function pessoasDosDados(dados: Prisma.JsonValue): string[] {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return [];
  return ["tecnicoId", "apoioId"].flatMap((chave) => {
    const valor = (dados as Record<string, unknown>)[chave];
    return typeof valor === "string" ? [valor] : [];
  });
}

/** Todas as pessoas que a ficha precisa nomear. */
export function pessoasDaFicha(linha: LinhaDaFicha): string[] {
  return [
    linha.tecnicoId, linha.apoioId, linha.criadoPorId, linha.laudoPorId, linha.adiadaPorId, linha.canceladaPorId, linha.termo?.coletadoPorId ?? null,
    ...linha.historico.flatMap((h) => [h.porId, ...pessoasDosDados(h.dados)]),
    ...linha.arquivos.map((a) => a.enviadoPorId),
  ].filter((id): id is string => id !== null);
}

const ETAPA_DO_PEDIDO: Record<string, string> = {
  pedido_gerado: "Pedido gerado", analise_estoque: "Análise de estoque", cotacoes: "Cotações", aprovacao_compra: "Aprovação",
  pagamento: "Pagamento", retirada: "Retirada", concluido: "Concluído",
};

export function paraFicha(
  linha: LinhaDaFicha,
  pessoas: Nomes,
  clientes: Nomes,
  ucs: readonly UcDaOrdem[],
  acesso: Acesso | undefined,
  agora: Date,
): OrdemDeServico {
  const resumo = paraResumo(linha, pessoas, clientes, agora);
  const fotos = linha.arquivos.filter((a) => a.categoria === "foto");
  const uc = linha.consumerUnitId ? ucs.find((u) => u.id === linha.consumerUnitId) : undefined;
  const pdf = linha.termo ? linha.arquivos.find((a) => a.id === linha.termo!.pdfArquivoId) : undefined;
  const historico: EventoDaOrdem[] = linha.historico.map((h) => ({
    id: h.id,
    tipo: h.tipo as EventoDaOrdem["tipo"],
    em: h.em.toISOString(),
    por: pessoa(h.porId, pessoas),
    descricao: descricaoDoEvento(h.tipo, (h.dados ?? {}) as Dados, pessoas),
    detalhe: h.detalhe,
  }));
  return {
    ...resumo,
    canal: linha.canal,
    uc: uc ? { id: uc.id, codigo: uc.codigo, distribuidora: uc.distribuidora } : null,
    equipamento: { equipamento: linha.equipamento, fabricante: linha.fabricante, modelo: linha.modelo, numeroSerie: linha.numeroSerie },
    checkinEm: linha.checkinEm?.toISOString() ?? null,
    laudo: linha.laudoEm && linha.laudoEncontrado !== null && linha.laudoFeito !== null
      ? { encontrado: linha.laudoEncontrado, feito: linha.laudoFeito, recomendacao: linha.laudoRecomendacao, registrado: registro(linha.laudoPorId, linha.laudoEm, pessoas) }
      : null,
    adiamento: linha.situacao === "adiada" && linha.adiadaEm && linha.adiadaPara && linha.adiamentoMotivo
      ? { ...registro(linha.adiadaPorId, linha.adiadaEm, pessoas), motivo: linha.adiamentoMotivo, novaData: diaEmManaus(linha.adiadaPara) }
      : null,
    cancelamento: linha.canceladaEm && linha.cancelamentoMotivo && linha.canceladaEmSituacao
      ? { ...registro(linha.canceladaPorId, linha.canceladaEm, pessoas), motivo: linha.cancelamentoMotivo, situacaoAnterior: linha.canceladaEmSituacao }
      : null,
    termo: linha.termo && pdf
      ? {
          modo: linha.termo.modo,
          nome: linha.termo.nome,
          documentoMascarado: linha.termo.documento ? mascararDocumento(linha.termo.documento) : null,
          assinado: registro(linha.termo.coletadoPorId, linha.termo.assinadoEm, pessoas),
          pdf: paraArquivo(linha.id, pdf, pessoas),
        }
      : null,
    fotos: fotos.map((a) => paraArquivo(linha.id, a, pessoas)),
    pedidosDeMaterial: linha.pedidosDeCompra.map((p) => ({
      id: p.id,
      numero: p.numero,
      titulo: p.titulo,
      etapa: p.etapa,
      situacao: p.canceladoEm ? "Cancelado" : p.concluidoEm ? "Concluído" : ETAPA_DO_PEDIDO[p.etapa] ?? p.etapa,
      createdAt: p.createdAt.toISOString(),
    })),
    ordemAnterior: linha.ordemAnterior ? { id: linha.ordemAnterior.id, codigo: codigoDaOrdemDeServico(linha.ordemAnterior.numero) } : null,
    obra: linha.obra ? { id: linha.obra.id, nome: linha.obra.nome } : null,
    usinaDoComissionamento: linha.usinasComissionadas[0] ? { id: linha.usinasComissionadas[0].id, nome: linha.usinasComissionadas[0].nome } : null,
    historico,
    criada: registro(linha.criadoPorId, linha.createdAt, pessoas),
    concluidaEm: linha.concluidaEm?.toISOString() ?? null,
    acoesPermitidas: acoesPermitidas(linha.situacao, acesso),
    updatedAt: linha.updatedAt.toISOString(),
  };
}

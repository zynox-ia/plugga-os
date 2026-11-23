import type { Prisma } from "@prisma/client";
import {
  etapasDeCompra,
  type ArquivoDeCompra,
  type CotacaoDeCompra,
  type EtapaDeCompra,
  type PassagemDeEtapa,
  type PedidoDeCompra,
  type PedidoDeCompraResumo,
  type QuadroDeComprasResposta,
} from "@plugga/shared";

import { acoesPermitidas, aceitaCotacao, problemaDaEdicao, situacaoDoPedido, somarValores, type PapelEmCompras } from "./compras.rules";
import { diaEmManaus, situacaoDoPrazo } from "./dias-uteis";

/**
 * Conversão das linhas do banco nos contratos de Compras (PLU-327). Pura: o
 * nome dos clientes chega pronto (vem de uma função de segurança, não de join)
 * e o instante "agora" é parâmetro.
 */

const PESSOA = { select: { id: true, name: true } } as const;

export const INCLUDE_DO_RESUMO = {
  solicitante: PESSOA,
  responsavel: PESSOA,
  obra: { select: { id: true, nome: true } },
  etapas: { where: { saiuEm: null }, select: { entrouEm: true, prazoEm: true } },
  _count: { select: { cotacoes: true } },
} satisfies Prisma.PedidoDeCompraInclude;

export const INCLUDE_DO_DETALHE = {
  solicitante: PESSOA,
  responsavel: PESSOA,
  criadoPor: PESSOA,
  estoqueDecididoPor: PESSOA,
  selecionouCotacao: PESSOA,
  aprovou: PESSOA,
  pagamentoRegistradoPor: PESSOA,
  recebimentoConfirmadoPor: PESSOA,
  canceladoPor: PESSOA,
  obra: { select: { id: true, nome: true } },
  itens: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  cotacoes: { include: { fornecedor: { select: { id: true, nome: true, ativo: true } }, criadoPor: PESSOA }, orderBy: { createdAt: "asc" } },
  etapas: { include: { responsavel: PESSOA, saiuPor: PESSOA }, orderBy: { entrouEm: "asc" } },
} satisfies Prisma.PedidoDeCompraInclude;

export type LinhaDoResumo = Prisma.PedidoDeCompraGetPayload<{ include: typeof INCLUDE_DO_RESUMO }>;
export type LinhaDoDetalhe = Prisma.PedidoDeCompraGetPayload<{ include: typeof INCLUDE_DO_DETALHE }>;
export type NomesDeClientes = ReadonlyMap<string, string>;

type Usuario = { id: string; name: string } | null;
const pessoa = (usuario: Usuario) => (usuario ? { id: usuario.id, nome: usuario.name } : null);
const registro = (usuario: Usuario, em: Date | null) => (em ? { por: pessoa(usuario), em: em.toISOString() } : null);
const valor = (decimal: Prisma.Decimal | null) => (decimal === null ? null : decimal.toFixed(2));

export const urlDoAnexoDaCotacao = (pedidoId: string, cotacaoId: string) => `/suprimentos/compras/pedidos/${pedidoId}/cotacoes/${cotacaoId}/arquivo`;
export const urlDoComprovante = (pedidoId: string) => `/suprimentos/compras/pedidos/${pedidoId}/comprovante`;

function destino(linha: { destino: LinhaDoResumo["destino"]; obra: { id: string; nome: string } | null; clientId: string | null }, clientes: NomesDeClientes) {
  return {
    tipo: linha.destino,
    obra: linha.obra ? { id: linha.obra.id, nome: linha.obra.nome } : null,
    cliente: linha.clientId ? { id: linha.clientId, nome: clientes.get(linha.clientId) ?? "Cliente" } : null,
  };
}

export function paraResumo(linha: LinhaDoResumo, clientes: NomesDeClientes, agora: Date): PedidoDeCompraResumo {
  const aberta = linha.etapas[0] ?? null;
  const situacao = situacaoDoPedido(linha);
  const emAndamento = situacao === "em_andamento" && aberta;
  return {
    id: linha.id,
    empresa: linha.companyId as PedidoDeCompraResumo["empresa"],
    numero: linha.numero,
    titulo: linha.titulo,
    destino: destino(linha, clientes),
    etapa: linha.etapa,
    situacao,
    responsavel: pessoa(linha.responsavel),
    solicitante: pessoa(linha.solicitante)!,
    valor: valor(linha.valorFaturado ?? linha.valorCotado ?? linha.valorOrcado),
    prazoEntregaDesejado: diaEmManaus(linha.prazoEntregaDesejado),
    entrouNaEtapaEm: emAndamento ? aberta.entrouEm.toISOString() : null,
    prazoDaEtapaEm: emAndamento ? aberta.prazoEm.toISOString() : null,
    situacaoDoPrazo: emAndamento ? situacaoDoPrazo(aberta.prazoEm, agora) : null,
    cotacoes: linha._count.cotacoes,
    createdAt: linha.createdAt.toISOString(),
  };
}

function arquivo(nome: string, tamanho: number | null, tipo: string | null, url: string): ArquivoDeCompra {
  return { nome, tamanhoBytes: tamanho ?? 1, tipo: tipo ?? "application/octet-stream", url };
}

function cotacao(pedidoId: string, linha: LinhaDoDetalhe["cotacoes"][number], selecionadaId: string | null): CotacaoDeCompra {
  const frete = valor(linha.valorFrete);
  const principal = valor(linha.valor)!;
  return {
    id: linha.id,
    fornecedor: { id: linha.fornecedor.id, nome: linha.fornecedor.nome, ativo: linha.fornecedor.ativo },
    valor: principal,
    valorFrete: frete,
    valorTotal: somarValores(principal, frete),
    prazoEntregaDias: linha.prazoEntregaDias,
    condicoesPagamento: linha.condicoesPagamento,
    arquivo: arquivo(linha.arquivoNome, linha.arquivoTamanho, linha.arquivoTipo, urlDoAnexoDaCotacao(pedidoId, linha.id)),
    selecionada: linha.id === selecionadaId,
    criada: { por: pessoa(linha.criadoPor), em: linha.createdAt.toISOString() },
  };
}

function passagem(linha: LinhaDoDetalhe["etapas"][number], agora: Date): PassagemDeEtapa {
  return {
    etapa: linha.etapa as PassagemDeEtapa["etapa"],
    entrouEm: linha.entrouEm.toISOString(),
    prazoDiasUteis: linha.prazoDiasUteis,
    prazoEm: linha.prazoEm.toISOString(),
    saiuEm: linha.saiuEm?.toISOString() ?? null,
    cumpriuPrazo: linha.cumpriuPrazo,
    situacaoDoPrazo: linha.saiuEm ? null : situacaoDoPrazo(linha.prazoEm, agora),
    responsavel: pessoa(linha.responsavel),
  };
}

export function paraDetalhe(linha: LinhaDoDetalhe, clientes: NomesDeClientes, papel: PapelEmCompras, agora: Date): PedidoDeCompra {
  const situacao = situacaoDoPedido(linha);
  const comprovante = linha.comprovanteChave && linha.comprovanteNome
    ? arquivo(linha.comprovanteNome, linha.comprovanteTamanho, linha.comprovanteTipo, urlDoComprovante(linha.id))
    : null;
  const pagamento = linha.formaPagamento && linha.pagamentoRegistradoEm
    ? {
        forma: linha.formaPagamento,
        comprovante,
        observacao: linha.pagamentoObservacao,
        registrado: registro(linha.pagamentoRegistradoPor, linha.pagamentoRegistradoEm)!,
      }
    : null;
  const analise = linha.etapas.find((item) => item.etapa === "pedido_gerado" && item.saiuEm);
  const estado = { etapa: linha.etapa, canceladoEm: linha.canceladoEm };
  return {
    id: linha.id,
    empresa: linha.companyId as PedidoDeCompra["empresa"],
    numero: linha.numero,
    titulo: linha.titulo,
    descricao: linha.descricao,
    destino: destino(linha, clientes),
    itens: linha.itens.map((item) => ({ id: item.id, descricao: item.descricao, quantidade: item.quantidade.toString(), unidade: item.unidade })),
    prazoEntregaDesejado: diaEmManaus(linha.prazoEntregaDesejado),
    etapa: linha.etapa,
    situacao,
    origemAtendimento: linha.origemAtendimento,
    valorOrcado: valor(linha.valorOrcado),
    valorCotado: valor(linha.valorCotado),
    valorFaturado: valor(linha.valorFaturado),
    solicitante: pessoa(linha.solicitante)!,
    responsavel: pessoa(linha.responsavel),
    cotacoes: linha.cotacoes.map((item) => cotacao(linha.id, item, linha.cotacaoSelecionadaId)),
    cotacaoSelecionadaId: linha.cotacaoSelecionadaId,
    pagamento,
    comprovantePendente: pagamento ? null : comprovante,
    passagens: linha.etapas.map((item) => passagem(item, agora)),
    marcos: {
      criado: { por: pessoa(linha.criadoPor), em: linha.createdAt.toISOString() },
      analiseIniciada: analise ? registro(analise.saiuPor, analise.saiuEm) : null,
      estoqueDecidido: registro(linha.estoqueDecididoPor, linha.estoqueDecididoEm),
      cotacaoSelecionada: registro(linha.selecionouCotacao, linha.cotacaoSelecionadaEm),
      aprovado: registro(linha.aprovou, linha.aprovadoEm),
      recebimentoConfirmado: registro(linha.recebimentoConfirmadoPor, linha.concluidoEm),
      cancelado: linha.canceladoEm ? { ...registro(linha.canceladoPor, linha.canceladoEm)!, motivo: linha.motivoCancelamento ?? "" } : null,
    },
    acoesPermitidas: acoesPermitidas(estado, papel),
    podeEditar: papel.operaCompras && problemaDaEdicao(estado, false) === null,
    podeRegistrarCotacao: papel.operaCompras && aceitaCotacao(estado),
    createdAt: linha.createdAt.toISOString(),
    updatedAt: linha.updatedAt.toISOString(),
  };
}

/** Uma coluna por etapa, na ordem do fluxo, com contagem, total e situação dos prazos. */
export function montarQuadro(resumos: readonly PedidoDeCompraResumo[]): QuadroDeComprasResposta {
  const porEtapa = new Map<EtapaDeCompra, PedidoDeCompraResumo[]>(etapasDeCompra.map((etapa) => [etapa, []]));
  for (const resumo of resumos) {
    if (resumo.situacao !== "cancelado") porEtapa.get(resumo.etapa)!.push(resumo);
  }
  return {
    colunas: etapasDeCompra.map((etapa) => {
      const pedidos = porEtapa.get(etapa)!;
      return {
        etapa,
        quantidade: pedidos.length,
        valorTotal: pedidos.reduce((total, pedido) => somarValores(total, pedido.valor ?? "0"), "0.00"),
        vencidos: pedidos.filter((pedido) => pedido.situacaoDoPrazo === "vencido").length,
        vencemHoje: pedidos.filter((pedido) => pedido.situacaoDoPrazo === "vence_hoje").length,
        pedidos,
      };
    }),
  };
}

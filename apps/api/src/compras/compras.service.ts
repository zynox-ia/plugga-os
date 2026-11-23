import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ARQUIVO_DE_COMPRA_MAX_BYTES,
  LIMITE_DA_LISTA_DE_PEDIDOS,
  buscarClientesDeCompraRespostaSchema,
  listarPedidosDeCompraRespostaSchema,
  obraDeCompraSchema,
  opcoesDeCompraRespostaSchema,
  pedidoDeCompraSchema,
  quadroDeComprasRespostaSchema,
  tiposDeArquivoDeCompra,
  type AcaoDoPedido,
  type BuscarClientesDeCompraQuery,
  type BuscarClientesDeCompraResposta,
  type CriarObra,
  type CriarPedidoDeCompra,
  type EditarPedidoDeCompra,
  type ListarPedidosDeCompraQuery,
  type ListarPedidosDeCompraResposta,
  type ObraDeCompra,
  type OpcoesDeCompraResposta,
  type PedidoDeCompra,
  type QuadroDeComprasQuery,
  type QuadroDeComprasResposta,
  type RegistrarCotacao,
} from "@plugga/shared";

import { AcessoNegado, ArquivoRecusado, LimiteExcedido, RequisicaoInvalida, TipoNaoPermitido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { detectarTipo } from "../lead-documentos/deteccao-de-tipo";
import { nomeSeguro } from "../lead-documentos/lead-documentos.rules";
import { montarQuadro, paraDetalhe } from "./compras.mapeamento";
import { papelEmCompras, podeExecutar, podeVerCompras, type PapelEmCompras } from "./compras.rules";
import { PrismaComprasRepository, type ArquivoGuardado } from "./prisma-compras.repository";

export const RELOGIO_DE_COMPRAS = Symbol("RELOGIO_DE_COMPRAS");
export type Relogio = () => Date;

export type ArquivoRecebido = { buffer: Buffer; nomeOriginal: string };
export type ArquivoParaBaixar = { arquivo: ArquivoGuardado; stream: NodeJS.ReadableStream; encerrar: () => void };

/**
 * Regras de acesso e arquivos de Compras (PLU-327). O controller garante que a
 * pessoa é de Compras ou do Financeiro; aqui se decide o que cada papel faz:
 * operar é de Compras, aprovar e revisar do gerente do Financeiro, pagar de
 * quem é do Financeiro. Sem segregação de função: a mesma pessoa pode tudo
 * que os papéis dela alcançam.
 */
@Injectable()
export class ComprasService {
  private readonly logger = new Logger(ComprasService.name);

  constructor(
    @Inject(PrismaComprasRepository) private readonly repositorio: PrismaComprasRepository,
    @Inject(ArmazenamentoDeDocumentos) private readonly armazenamento: ArmazenamentoDeDocumentos,
    @Inject(RELOGIO_DE_COMPRAS) private readonly agora: Relogio,
  ) {}

  async quadro(query: QuadroDeComprasQuery, principal: AuthPrincipal): Promise<QuadroDeComprasResposta> {
    this.exigirLeitura(principal);
    const agora = this.agora();
    const { itens } = await this.repositorio.resumos(this.repositorio.filtroDoQuadro(query, agora), agora);
    return quadroDeComprasRespostaSchema.parse(montarQuadro(itens));
  }

  async listar(query: ListarPedidosDeCompraQuery, principal: AuthPrincipal): Promise<ListarPedidosDeCompraResposta> {
    this.exigirLeitura(principal);
    const resposta = await this.repositorio.resumos(this.repositorio.filtroDaLista(query), this.agora(), LIMITE_DA_LISTA_DE_PEDIDOS);
    return listarPedidosDeCompraRespostaSchema.parse(resposta);
  }

  async obter(id: string, principal: AuthPrincipal): Promise<PedidoDeCompra> {
    const papel = this.exigirLeitura(principal);
    const { linha, clientes } = await this.repositorio.detalhe(id);
    return pedidoDeCompraSchema.parse(paraDetalhe(linha, clientes, papel, this.agora()));
  }

  async opcoes(principal: AuthPrincipal): Promise<OpcoesDeCompraResposta> {
    this.exigirLeitura(principal);
    return opcoesDeCompraRespostaSchema.parse(await this.repositorio.opcoes(principal));
  }

  async buscarClientes(query: BuscarClientesDeCompraQuery, principal: AuthPrincipal): Promise<BuscarClientesDeCompraResposta> {
    this.exigirOperacao(principal);
    return buscarClientesDeCompraRespostaSchema.parse({ itens: await this.repositorio.buscarClientes(query.busca) });
  }

  async criarObra(input: CriarObra, principal: AuthPrincipal): Promise<ObraDeCompra> {
    this.exigirOperacao(principal);
    return obraDeCompraSchema.parse(await this.repositorio.criarObra(input, principal));
  }

  async criar(input: CriarPedidoDeCompra, principal: AuthPrincipal): Promise<PedidoDeCompra> {
    this.exigirOperacao(principal);
    const id = await this.repositorio.criar(input, principal, this.agora());
    return this.obter(id, principal);
  }

  async editar(id: string, input: EditarPedidoDeCompra, principal: AuthPrincipal): Promise<PedidoDeCompra> {
    this.exigirOperacao(principal);
    await this.repositorio.editar(id, input, principal);
    return this.obter(id, principal);
  }

  async executarAcao(id: string, acao: AcaoDoPedido, principal: AuthPrincipal): Promise<PedidoDeCompra> {
    const papel = this.exigirLeitura(principal);
    if (!podeExecutar(papel, acao.acao)) throw new AcessoNegado("Esta ação não está entre as suas no processo de compras.");
    await this.repositorio.executarAcao(id, acao, principal, this.agora());
    return this.obter(id, principal);
  }

  async registrarCotacao(id: string, dados: RegistrarCotacao, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<PedidoDeCompra> {
    this.exigirOperacao(principal);
    await this.repositorio.estado(id);
    const guardado = await this.guardar(id, "cotacoes", arquivo);
    try {
      await this.repositorio.registrarCotacao(id, dados, guardado, principal);
    } catch (erro) {
      await this.descartar(guardado.chave);
      throw erro;
    }
    return this.obter(id, principal);
  }

  async registrarComprovante(id: string, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<PedidoDeCompra> {
    const papel = this.exigirLeitura(principal);
    if (!podeExecutar(papel, "registrar_pagamento")) throw new AcessoNegado("O comprovante é de quem registra o pagamento.");
    await this.repositorio.estado(id);
    const guardado = await this.guardar(id, "comprovantes", arquivo);
    try {
      // O comprovante anterior continua guardado: o repositório só o marca como substituído.
      await this.repositorio.registrarComprovante(id, guardado, principal, this.agora());
    } catch (erro) {
      await this.descartar(guardado.chave);
      throw erro;
    }
    return this.obter(id, principal);
  }

  async baixarAnexoDaCotacao(id: string, cotacaoId: string, principal: AuthPrincipal): Promise<ArquivoParaBaixar> {
    this.exigirLeitura(principal);
    return this.abrir(await this.repositorio.arquivoDaCotacao(id, cotacaoId));
  }

  async baixarComprovante(id: string, principal: AuthPrincipal): Promise<ArquivoParaBaixar> {
    this.exigirLeitura(principal);
    return this.abrir(await this.repositorio.comprovante(id));
  }

  // ------------------------------------------------------------ apoio

  private exigirLeitura(principal: AuthPrincipal): PapelEmCompras {
    const papel = papelEmCompras(principal.acesso);
    if (!podeVerCompras(papel)) throw new AcessoNegado("Você não tem acesso a Compras.");
    return papel;
  }

  private exigirOperacao(principal: AuthPrincipal): PapelEmCompras {
    const papel = this.exigirLeitura(principal);
    if (!papel.operaCompras) throw new AcessoNegado("Só quem opera Compras faz esta ação.");
    return papel;
  }

  /** PDF ou imagem, conferido pelo conteúdo, nunca pela extensão ou pelo tipo que o navegador declarou. */
  private async guardar(pedidoId: string, pasta: "cotacoes" | "comprovantes", arquivo: ArquivoRecebido | undefined): Promise<ArquivoGuardado> {
    if (!arquivo) throw new RequisicaoInvalida("Envie o arquivo.", [{ campo: "arquivo", problema: "Anexe um PDF ou uma imagem." }]);
    if (arquivo.buffer.length === 0) throw new TipoNaoPermitido("O arquivo está vazio.");
    if (arquivo.buffer.length > ARQUIVO_DE_COMPRA_MAX_BYTES) throw new LimiteExcedido("O arquivo é maior que o limite de 25 MiB.", "ARQUIVO_GRANDE_DEMAIS");
    const deteccao = detectarTipo(arquivo.buffer);
    if (deteccao.status === "arquivo_recusado") throw new ArquivoRecusado("O arquivo está corrompido ou truncado.");
    if (deteccao.status !== "aceito" || !(tiposDeArquivoDeCompra as readonly string[]).includes(deteccao.tipo)) {
      throw new TipoNaoPermitido("Envie um PDF, JPEG ou PNG.");
    }
    const nome = arquivo.nomeOriginal.trim().slice(0, 200) || "arquivo";
    const chave = `suprimentos/compras/${pedidoId}/${pasta}/${randomUUID()}-${nomeSeguro(nome)}`;
    await this.armazenamento.enviar(chave, arquivo.buffer, deteccao.tipo);
    return { chave, nome, tamanho: arquivo.buffer.length, tipo: deteccao.tipo };
  }

  /**
   * Limpeza de melhor esforço do arquivo recém-enviado cuja gravação falhou. Um
   * objeto órfão não é motivo para falhar a requisição. Nunca apaga arquivo já
   * registrado: anexo de cotação e comprovante são evidência.
   */
  private async descartar(chave: string): Promise<void> {
    try {
      await this.armazenamento.excluir(chave);
    } catch {
      this.logger.warn("arquivo de compras não pôde ser removido do armazenamento");
    }
  }

  private async abrir(arquivo: ArquivoGuardado): Promise<ArquivoParaBaixar> {
    const { objeto, cliente } = await this.armazenamento.ler(arquivo.chave);
    return { arquivo, stream: objeto.corpo, encerrar: () => cliente.destroy() };
  }
}

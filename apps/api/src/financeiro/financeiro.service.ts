import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  lancamentoSchema,
  listarLancamentosRespostaSchema,
  opcoesDoFinanceiroSchema,
  quadroFinanceiroSchema,
  resumoDosLancamentosRespostaSchema,
  type AcaoDoLancamento,
  type CriarContaAPagar,
  type EditarLancamento,
  type Lancamento,
  type ListarLancamentosQuery,
  type ListarLancamentosResposta,
  type OpcoesDoFinanceiro,
  type QuadroFinanceiro,
  type QuadroFinanceiroQuery,
  type ResumoDosLancamentosQuery,
  type ResumoDosLancamentosResposta,
} from "@plugga/shared";

import {
  ANEXO_DO_LANCAMENTO_MAX_BYTES,
  LIMITE_DE_COMPROVANTES_NO_ZIP,
  clientesDoFinanceiroRespostaSchema,
  sugestaoDeCobrancaRespostaSchema,
  type BaixarComprovantesQuery,
  type ClientesDoFinanceiroResposta,
  type CriarCobranca,
  type SugestaoDeCobrancaQuery,
  type SugestaoDeCobrancaResposta,
  type TipoDeAnexo,
} from "@plugga/shared";
import type { Writable } from "node:stream";

import { AcessoNegado, ArquivoRecusado, EstadoInvalido, LimiteExcedido, RequisicaoInvalida, TipoNaoPermitido } from "../common/errors/dominio";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { detectarTipo } from "../lead-documentos/deteccao-de-tipo";
import { nomeSeguro } from "../lead-documentos/lead-documentos.rules";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { papelNoFinanceiro, tiposVisiveis, type PapelNoFinanceiro } from "./financeiro.rules";
import { LIMITE_DO_ZIP_BYTES, escreverZip } from "./zip-armazenado";
import { PrismaFinanceiroRepository, type ArquivoDoLancamento } from "./prisma-financeiro.repository";

export type ArquivoRecebido = { buffer: Buffer; nomeOriginal: string };
export type ArquivoParaBaixar = { arquivo: ArquivoDoLancamento; stream: NodeJS.ReadableStream; encerrar: () => void };
const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png"];

export const RELOGIO_DO_FINANCEIRO = Symbol("RELOGIO_DO_FINANCEIRO");
export type Relogio = () => Date;

/** Lançamentos do Financeiro (PLU-336). O acesso por tipo sai do papel; o RLS confere de novo no banco. */
@Injectable()
export class FinanceiroService {
  private readonly logger = new Logger(FinanceiroService.name);

  constructor(
    @Inject(PrismaFinanceiroRepository) private readonly repositorio: PrismaFinanceiroRepository,
    @Inject(RELOGIO_DO_FINANCEIRO) private readonly agora: Relogio,
    @Inject(ArmazenamentoDeDocumentos) private readonly armazenamento: ArmazenamentoDeDocumentos,
  ) {}

  async listar(query: ListarLancamentosQuery, principal: AuthPrincipal): Promise<ListarLancamentosResposta> {
    const papel = this.papel(principal);
    return listarLancamentosRespostaSchema.parse(await this.repositorio.listar(query, papel, this.agora()));
  }

  async quadro(query: QuadroFinanceiroQuery, principal: AuthPrincipal): Promise<QuadroFinanceiro> {
    const papel = this.papel(principal);
    return quadroFinanceiroSchema.parse(await this.repositorio.quadro(query, papel, this.agora()));
  }

  async resumo(query: ResumoDosLancamentosQuery, principal: AuthPrincipal): Promise<ResumoDosLancamentosResposta> {
    const papel = this.papel(principal);
    return resumoDosLancamentosRespostaSchema.parse({
      resumo: await this.repositorio.resumo(papel, query.empresa, this.agora()),
      alcance: { saidas: papel.saidas, entradas: papel.entradas },
    });
  }

  async obter(id: string, principal: AuthPrincipal): Promise<Lancamento> {
    const papel = this.papel(principal);
    return lancamentoSchema.parse(await this.repositorio.obter(id, papel, this.agora()));
  }

  async opcoes(): Promise<OpcoesDoFinanceiro> {
    return opcoesDoFinanceiroSchema.parse(await this.repositorio.opcoes());
  }

  async criarContaAPagar(input: CriarContaAPagar, principal: AuthPrincipal): Promise<Lancamento> {
    const papel = this.papel(principal);
    if (!papel.saidas) throw new AcessoNegado("Conta a pagar é de quem tem a tela Contas a pagar.");
    const id = await this.repositorio.criarContaAPagar(input, principal);
    return this.obter(id, principal);
  }

  async editar(id: string, input: EditarLancamento, principal: AuthPrincipal): Promise<Lancamento> {
    await this.repositorio.editar(id, input, principal, this.papel(principal));
    return this.obter(id, principal);
  }

  async executarAcao(id: string, acao: AcaoDoLancamento, principal: AuthPrincipal): Promise<Lancamento> {
    await this.repositorio.executarAcao(id, acao, principal, this.papel(principal), this.agora());
    return this.obter(id, principal);
  }


  /**
   * Anexo do lançamento (PLU-337): PDF, JPEG ou PNG conferido pelo conteúdo, nunca
   * pela extensão; guardado em `financeiro/lancamentos/<id>/`. Se a gravação falhar,
   * o arquivo recém-enviado sai do armazenamento; um anexo registrado nunca sai.
   */
  async enviarAnexo(id: string, tipo: TipoDeAnexo, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<Lancamento> {
    const papel = this.papel(principal);
    if (!arquivo) throw new RequisicaoInvalida("Envie o arquivo.", [{ campo: "arquivo", problema: "Anexe um PDF ou uma imagem." }]);
    if (arquivo.buffer.length === 0) throw new TipoNaoPermitido("O arquivo está vazio.");
    if (arquivo.buffer.length > ANEXO_DO_LANCAMENTO_MAX_BYTES) throw new LimiteExcedido("O arquivo é maior que o limite de 25 MiB.", "ARQUIVO_GRANDE_DEMAIS");
    const deteccao = detectarTipo(arquivo.buffer);
    if (deteccao.status === "arquivo_recusado") throw new ArquivoRecusado("O arquivo está corrompido ou truncado.");
    if (deteccao.status !== "aceito" || !TIPOS_ACEITOS.includes(deteccao.tipo)) throw new TipoNaoPermitido("Envie um PDF, JPEG ou PNG.");
    // Antes de subir o arquivo: o lançamento existe para a pessoa e não está cancelado.
    const antes = await this.repositorio.obter(id, papel, this.agora());
    if (antes.cancelado) throw new EstadoInvalido("O lançamento está cancelado.");
    const nome = arquivo.nomeOriginal.trim().slice(0, 200) || "arquivo";
    const guardado: ArquivoDoLancamento = { chave: `financeiro/lancamentos/${id}/${tipo}/${randomUUID()}-${nomeSeguro(nome)}`, nome, tamanho: arquivo.buffer.length, tipo: deteccao.tipo };
    await this.armazenamento.enviar(guardado.chave, arquivo.buffer, guardado.tipo);
    try {
      await this.repositorio.registrarAnexo(id, tipo, guardado, principal, papel, this.agora());
    } catch (erro) {
      try {
        await this.armazenamento.excluir(guardado.chave);
      } catch {
        this.logger.warn("anexo do lançamento não pôde ser removido do armazenamento");
      }
      throw erro;
    }
    return this.obter(id, principal);
  }

  async baixarAnexo(id: string, anexoId: string, principal: AuthPrincipal): Promise<ArquivoParaBaixar> {
    const arquivo = await this.repositorio.arquivoDoAnexo(id, anexoId, this.papel(principal));
    const { objeto, cliente } = await this.armazenamento.ler(arquivo.chave);
    return { arquivo, stream: objeto.corpo, encerrar: () => cliente.destroy() };
  }

  /** Cobrança manual (A7): só quem tem Contas a receber. */
  async criarCobranca(input: CriarCobranca, principal: AuthPrincipal): Promise<Lancamento> {
    if (!this.papel(principal).entradas) throw new AcessoNegado("Cobrança é de quem tem a tela Contas a receber.");
    const id = await this.repositorio.criarCobranca(input, principal);
    return this.obter(id, principal);
  }

  async buscarClientes(busca: string, principal: AuthPrincipal): Promise<ClientesDoFinanceiroResposta> {
    if (!this.papel(principal).entradas) throw new AcessoNegado("A busca de clientes é de quem tem a tela Contas a receber.");
    return clientesDoFinanceiroRespostaSchema.parse({ itens: await this.repositorio.buscarClientesComUcs(busca) });
  }

  async sugestaoDeCobranca(query: SugestaoDeCobrancaQuery, principal: AuthPrincipal): Promise<SugestaoDeCobrancaResposta> {
    if (!this.papel(principal).entradas) throw new AcessoNegado("A sugestão é de quem tem a tela Contas a receber.");
    return sugestaoDeCobrancaRespostaSchema.parse(await this.repositorio.sugestaoDeCobranca(query.empresa, query.clientId, query.competencia));
  }

  /**
   * "Baixar comprovantes": confere o período antes de abrir a resposta (acima do teto,
   * 400 pedindo período menor) e devolve quem escreve o .zip no destino.
   */
  async prepararZipDeComprovantes(query: BaixarComprovantesQuery, principal: AuthPrincipal): Promise<{ arquivos: number; escrever: (destino: Writable) => Promise<void> }> {
    const tipos = tiposVisiveis(this.papel(principal), query.tipo);
    if (tipos.length === 0) throw new AcessoNegado("Você não alcança os lançamentos pedidos.");
    const { total, itens } = await this.repositorio.comprovantesDoPeriodo({ empresa: query.empresa, de: query.de, ate: query.ate, tipos }, LIMITE_DE_COMPROVANTES_NO_ZIP);
    if (total > LIMITE_DE_COMPROVANTES_NO_ZIP) {
      throw new RequisicaoInvalida(`São ${total} comprovantes no período; o limite é ${LIMITE_DE_COMPROVANTES_NO_ZIP}. Escolha um período menor.`, [{ campo: "ate", problema: "Período grande demais." }]);
    }
    if (itens.reduce((n, i) => n + i.tamanho, 0) > LIMITE_DO_ZIP_BYTES - 1_000_000) {
      throw new RequisicaoInvalida("Os comprovantes do período passam de 4 GiB. Escolha um período menor.", [{ campo: "ate", problema: "Período grande demais." }]);
    }
    return {
      arquivos: itens.length,
      escrever: async (destino) => {
        await escreverZip(destino, itens.map((i) => ({
          nome: i.nomePadronizado,
          data: i.data,
          abrir: async () => {
            const { objeto, cliente } = await this.armazenamento.ler(i.chave);
            const corpo = objeto.corpo as NodeJS.ReadableStream & import("node:stream").Readable;
            corpo.once("close", () => cliente.destroy());
            return corpo;
          },
        })));
      },
    };
  }

  private papel(principal: AuthPrincipal): PapelNoFinanceiro {
    return papelNoFinanceiro(principal.acesso);
  }
}

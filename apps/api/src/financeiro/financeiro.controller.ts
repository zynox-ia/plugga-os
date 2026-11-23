import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  ANEXO_DO_LANCAMENTO_MAX_BYTES,
  acaoDoLancamentoSchema,
  baixarComprovantesQuerySchema,
  buscarClientesDoFinanceiroQuerySchema,
  criarCobrancaSchema,
  sugestaoDeCobrancaQuerySchema,
  type BaixarComprovantesQuery,
  type BuscarClientesDoFinanceiroQuery,
  type ClientesDoFinanceiroResposta,
  type CriarCobranca,
  type SugestaoDeCobrancaQuery,
  type SugestaoDeCobrancaResposta,
  enviarAnexoSchema,
  type EnviarAnexo,
  criarContaAPagarSchema,
  editarLancamentoSchema,
  listarLancamentosQuerySchema,
  quadroFinanceiroQuerySchema,
  resumoDosLancamentosQuerySchema,
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

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";
import { cabecalhoDisposicao } from "../lead-documentos/lead-documentos.rules";
import { FinanceiroService, type ArquivoParaBaixar } from "./financeiro.service";

const COM_ARQUIVO = FileInterceptor("arquivo", { limits: { fileSize: ANEXO_DO_LANCAMENTO_MAX_BYTES * 2 } });

/**
 * Financeiro (PLU-336). Os Lançamentos são de quem tem Contas a pagar ou Contas
 * a receber; cada um vê só o seu tipo (o serviço e o RLS recortam). Atrás do
 * portão `FinanceiroHabilitadoGuard` até o módulo ficar completo.
 */
@Controller("financeiro")
@UseGuards(FinanceiroHabilitadoGuard, SessionAuthGuard, AcessoGuard)
@Departamento("financeiro")
@Tela("financeiro.pagar", "financeiro.receber")
export class FinanceiroController {
  constructor(@Inject(FinanceiroService) private readonly financeiro: FinanceiroService) {}

  @Get("lancamentos")
  listar(
    @Query(new ZodValidationPipe(listarLancamentosQuerySchema)) query: ListarLancamentosQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ListarLancamentosResposta> {
    return this.financeiro.listar(query, principal);
  }

  @Get("lancamentos/quadro")
  quadro(
    @Query(new ZodValidationPipe(quadroFinanceiroQuerySchema)) query: QuadroFinanceiroQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<QuadroFinanceiro> {
    return this.financeiro.quadro(query, principal);
  }

  /** Só os metric cards, para o quadro não buscar a lista inteira. */
  @Get("lancamentos/resumo")
  resumo(
    @Query(new ZodValidationPipe(resumoDosLancamentosQuerySchema)) query: ResumoDosLancamentosQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ResumoDosLancamentosResposta> {
    return this.financeiro.resumo(query, principal);
  }

  @Get("lancamentos/:id")
  obter(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Lancamento> {
    return this.financeiro.obter(id, principal);
  }

  @Post("lancamentos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(
    @Body(new ZodValidationPipe(criarContaAPagarSchema)) input: CriarContaAPagar,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Lancamento> {
    return this.financeiro.criarContaAPagar(input, principal);
  }

  @Patch("lancamentos/:id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarLancamentoSchema)) input: EditarLancamento,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Lancamento> {
    return this.financeiro.editar(id, input, principal);
  }

  @Post("lancamentos/:id/acoes")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  executarAcao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acaoDoLancamentoSchema)) acao: AcaoDoLancamento,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Lancamento> {
    return this.financeiro.executarAcao(id, acao, principal);
  }

  /** Anexo novo (multipart: `arquivo` e `tipo`); comprovante, NF e boleto substituem o atual. */
  @Post("lancamentos/:id/anexos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_ARQUIVO)
  enviarAnexo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(enviarAnexoSchema)) dados: EnviarAnexo,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Lancamento> {
    return this.financeiro.enviarAnexo(id, dados.tipo, arquivo && { buffer: arquivo.buffer, nomeOriginal: arquivo.originalname }, principal);
  }

  @Get("lancamentos/:id/anexos/:anexoId")
  async baixarAnexo(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("anexoId", ParseUUIDPipe) anexoId: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    this.enviarArquivo(res, await this.financeiro.baixarAnexo(id, anexoId, principal));
  }

  /** Cobrança manual (A7): uma por cliente, empresa e competência. */
  @Post("cobrancas")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criarCobranca(@Body(new ZodValidationPipe(criarCobrancaSchema)) input: CriarCobranca, @CurrentPrincipal() principal: AuthPrincipal): Promise<Lancamento> {
    return this.financeiro.criarCobranca(input, principal);
  }

  /** F4: o valor da competência anterior, para a tela sugerir. Antes de `:id` não há conflito: é outro prefixo. */
  @Get("cobrancas/sugestao")
  sugestao(@Query(new ZodValidationPipe(sugestaoDeCobrancaQuerySchema)) query: SugestaoDeCobrancaQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<SugestaoDeCobrancaResposta> {
    return this.financeiro.sugestaoDeCobranca(query, principal);
  }

  @Get("clientes")
  @Tela("financeiro.receber")
  buscarClientes(@Query(new ZodValidationPipe(buscarClientesDoFinanceiroQuerySchema)) query: BuscarClientesDoFinanceiroQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientesDoFinanceiroResposta> {
    return this.financeiro.buscarClientes(query.busca, principal);
  }

  /** "Baixar comprovantes": os comprovantes atuais do período, com o nome padronizado. */
  @Get("comprovantes.zip")
  async baixarComprovantes(@Query(new ZodValidationPipe(baixarComprovantesQuerySchema)) query: BaixarComprovantesQuery, @CurrentPrincipal() principal: AuthPrincipal, @Res() res: Response): Promise<void> {
    const zip = await this.financeiro.prepararZipDeComprovantes(query, principal);
    res.status(200);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", cabecalhoDisposicao("attachment", `comprovantes ${query.de} a ${query.ate}.zip`));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    try {
      await zip.escrever(res);
      res.end();
    } catch {
      // O cabeçalho já saiu: corta a resposta para o arquivo chegar incompleto e não parecer válido.
      res.destroy();
    }
  }

  /** Menus dos formulários e filtros: vale para qualquer tela do Financeiro. */
  @Get("opcoes")
  @Tela("financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal")
  opcoes(): Promise<OpcoesDoFinanceiro> {
    return this.financeiro.opcoes();
  }

  /** PDF e imagem abrem no navegador; o tipo é o detectado no envio, e `nosniff` impede reinterpretação. */
  private enviarArquivo(res: Response, { arquivo, stream, encerrar }: ArquivoParaBaixar): void {
    stream.once("close", encerrar);
    stream.once("error", encerrar);
    res.status(200);
    res.setHeader("Content-Type", arquivo.tipo);
    res.setHeader("Content-Disposition", cabecalhoDisposicao("inline", arquivo.nome));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    stream.pipe(res);
  }
}

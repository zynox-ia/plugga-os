import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  EVIDENCIA_DE_TAREFA_MAX_BYTES,
  concluirOcorrenciaSchema,
  criarTarefaSchema,
  departamentoComTarefasSchema,
  encerrarTarefaSchema,
  listarTarefasQuerySchema,
  type ConcluirOcorrencia,
  type CriarTarefa,
  type DepartamentoComTarefas,
  type EncerrarTarefa,
  type ListarTarefasQuery,
  type ListarTarefasResposta,
  type OcorrenciaDeTarefa,
  type OpcoesDeTarefasResposta,
  type Tarefa,
} from "@plugga/shared";
import type { Response } from "express";

import { UmArquivo } from "../common/upload";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { cabecalhoDisposicao } from "../lead-documentos/lead-documentos.rules";
import { PortaoDoDepartamentoGuard } from "./portao-do-departamento.guard";
import { TarefasService, type ArquivoParaBaixar } from "./tarefas.service";

const COM_EVIDENCIA = UmArquivo("evidencia", EVIDENCIA_DE_TAREFA_MAX_BYTES * 2);
const DEPARTAMENTO = new ZodValidationPipe(departamentoComTarefasSchema);

/**
 * Tarefas dos departamentos (PLU-349, PLU-340), em `/tarefas/:departamento`.
 * O portão do departamento vem antes da sessão; o serviço confere que a pessoa
 * é do departamento da rota.
 */
@Controller("tarefas/:departamento")
@UseGuards(PortaoDoDepartamentoGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["financeiro", "engenharia-obras", "energia-opm"])
export class TarefasController {
  constructor(@Inject(TarefasService) private readonly tarefas: TarefasService) {}

  @Get()
  listar(
    @Param("departamento", DEPARTAMENTO) departamento: DepartamentoComTarefas,
    @Query(new ZodValidationPipe(listarTarefasQuerySchema)) query: ListarTarefasQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ListarTarefasResposta> {
    return this.tarefas.listar(departamento, query, principal);
  }

  @Get("opcoes")
  opcoes(@Param("departamento", DEPARTAMENTO) departamento: DepartamentoComTarefas, @CurrentPrincipal() principal: AuthPrincipal): Promise<OpcoesDeTarefasResposta> {
    return this.tarefas.opcoes(departamento, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(
    @Param("departamento", DEPARTAMENTO) departamento: DepartamentoComTarefas,
    @Body(new ZodValidationPipe(criarTarefaSchema)) input: CriarTarefa,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Tarefa> {
    return this.tarefas.criar(departamento, input, principal);
  }

  @Post("ocorrencias/:id/concluir")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_EVIDENCIA)
  concluir(
    @Param("departamento", DEPARTAMENTO) departamento: DepartamentoComTarefas,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(concluirOcorrenciaSchema)) dados: ConcluirOcorrencia,
    @UploadedFile() evidencia: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OcorrenciaDeTarefa> {
    return this.tarefas.concluir(departamento, id, dados, evidencia && { buffer: evidencia.buffer, nomeOriginal: evidencia.originalname }, principal);
  }

  @Get("ocorrencias/:id/evidencias/:evidenciaId")
  async evidencia(
    @Param("departamento", DEPARTAMENTO) departamento: DepartamentoComTarefas,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("evidenciaId", ParseUUIDPipe) evidenciaId: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    this.enviar(res, await this.tarefas.baixarEvidencia(departamento, id, evidenciaId, principal));
  }

  @Get(":tarefaId")
  obter(
    @Param("departamento", DEPARTAMENTO) departamento: DepartamentoComTarefas,
    @Param("tarefaId", ParseUUIDPipe) tarefaId: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Tarefa> {
    return this.tarefas.obter(departamento, tarefaId, principal);
  }

  @Post(":tarefaId/encerrar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  encerrar(
    @Param("departamento", DEPARTAMENTO) departamento: DepartamentoComTarefas,
    @Param("tarefaId", ParseUUIDPipe) tarefaId: string,
    @Body(new ZodValidationPipe(encerrarTarefaSchema)) input: EncerrarTarefa,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Tarefa> {
    return this.tarefas.encerrar(departamento, tarefaId, input.motivo, principal);
  }

  private enviar(res: Response, { arquivo, stream, encerrar }: ArquivoParaBaixar): void {
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

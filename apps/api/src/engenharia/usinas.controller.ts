import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  PLANILHA_DE_USINAS_MAX_BYTES,
  PRINT_DA_CONFERENCIA_MAX_BYTES,
  importarUsinasSchema,
  type ImportacaoDeUsinas,
  type ImportarUsinas,
  conferirPlataformaSchema,
  criarPlataformaSchema,
  criarUsinaSchema,
  editarPlataformaSchema,
  editarUsinaSchema,
  idDePlataformaSchema,
  listarUsinasQuerySchema,
  monitoramentoQuerySchema,
  type ConferirPlataforma,
  type CriarPlataforma,
  type CriarUsina,
  type EditarPlataforma,
  type EditarUsina,
  type ListarPlataformasResposta,
  type ListarUsinasQuery,
  type ListarUsinasResposta,
  type MonitoramentoDoDia,
  type MonitoramentoQuery,
  type Usina,
} from "@plugga/shared";
import type { Response } from "express";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { cabecalhoDisposicao } from "../lead-documentos/lead-documentos.rules";
import { EngenhariaHabilitadaGuard } from "./engenharia-habilitada.guard";
import { UsinasService } from "./usinas.service";

const COM_PRINT = FileInterceptor("print", { limits: { fileSize: PRINT_DA_CONFERENCIA_MAX_BYTES * 2 } });
const PLATAFORMA = new ZodValidationPipe(idDePlataformaSchema);
const COM_PLANILHA = FileInterceptor("arquivo", { limits: { fileSize: PLANILHA_DE_USINAS_MAX_BYTES * 2 } });

/**
 * Usinas da Engenharia (PLU-347). Entra quem é da Engenharia; o serviço decide
 * quem cadastra (tela de Usinas). O portão vem antes da sessão.
 */
@Controller("engenharia/usinas")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["engenharia-obras"])
export class UsinasController {
  constructor(@Inject(UsinasService) private readonly usinas: UsinasService) {}

  @Get()
  listar(@Query(new ZodValidationPipe(listarUsinasQuerySchema)) query: ListarUsinasQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarUsinasResposta> {
    return this.usinas.usinas(query, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(@Body(new ZodValidationPipe(criarUsinaSchema)) input: CriarUsina, @CurrentPrincipal() principal: AuthPrincipal): Promise<Usina> {
    return this.usinas.criarUsina(input, principal);
  }

  /** Importação única da planilha de levantamento (E3): confere por padrão; grava com `gravar=sim`. */
  @Post("importacao")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_PLANILHA)
  importar(
    @Body(new ZodValidationPipe(importarUsinasSchema)) dados: ImportarUsinas,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ImportacaoDeUsinas> {
    return this.usinas.importar(dados, arquivo && { buffer: arquivo.buffer, nomeOriginal: arquivo.originalname }, principal);
  }

  @Get(":id")
  obter(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Usina> {
    return this.usinas.usina(id, principal);
  }

  @Patch(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(editarUsinaSchema)) input: EditarUsina, @CurrentPrincipal() principal: AuthPrincipal): Promise<Usina> {
    return this.usinas.editarUsina(id, input, principal);
  }
}

/** Monitoramento do dia por plataforma (PLU-347). */
@Controller("engenharia/monitoramento")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["engenharia-obras"])
export class MonitoramentoController {
  constructor(@Inject(UsinasService) private readonly usinas: UsinasService) {}

  @Get()
  doDia(@Query(new ZodValidationPipe(monitoramentoQuerySchema)) query: MonitoramentoQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<MonitoramentoDoDia> {
    return this.usinas.monitoramentoDoDia(query.empresa, principal);
  }

  @Post(":plataformaId/conferir")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_PRINT)
  conferir(
    @Param("plataformaId", PLATAFORMA) plataformaId: string,
    @Body(new ZodValidationPipe(conferirPlataformaSchema)) dados: ConferirPlataforma,
    @UploadedFile() print: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MonitoramentoDoDia> {
    return this.usinas.conferir(plataformaId, dados, print && { buffer: print.buffer, nomeOriginal: print.originalname }, principal);
  }

  /** O print abre no navegador; o tipo é o detectado no envio, e `nosniff` impede reinterpretação. */
  @Get("conferencias/:id/print")
  async print(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal, @Res() res: Response): Promise<void> {
    const { arquivo, stream, encerrar } = await this.usinas.baixarPrint(id, principal);
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

/** Plataformas de inversor (Configurações da Engenharia, PLU-347). Muda só o gerente. */
@Controller("engenharia/plataformas")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["engenharia-obras"])
export class PlataformasController {
  constructor(@Inject(UsinasService) private readonly usinas: UsinasService) {}

  @Get()
  listar(@CurrentPrincipal() principal: AuthPrincipal): Promise<ListarPlataformasResposta> {
    return this.usinas.plataformas(principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(@Body(new ZodValidationPipe(criarPlataformaSchema)) input: CriarPlataforma, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarPlataformasResposta> {
    return this.usinas.criarPlataforma(input, principal);
  }

  @Patch(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(@Param("id", PLATAFORMA) id: string, @Body(new ZodValidationPipe(editarPlataformaSchema)) input: EditarPlataforma, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarPlataformasResposta> {
    return this.usinas.editarPlataforma(id, input, principal);
  }
}

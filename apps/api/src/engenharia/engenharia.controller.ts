import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  ARQUIVO_DE_ORDEM_MAX_BYTES,
  acaoDaOrdemDeServicoSchema,
  buscarClientesDaEngenhariaQuerySchema,
  colherTermoSchema,
  criarOrdemDeServicoSchema,
  editarOrdemDeServicoSchema,
  listarOrdensDeServicoQuerySchema,
  pedirMaterialSchema,
  quadroDeOrdensQuerySchema,
  type AcaoDaOrdemDeServico,
  type BuscarClientesDaEngenhariaQuery,
  type BuscarClientesDaEngenhariaResposta,
  type ColherTermo,
  type CriarOrdemDeServico,
  type EditarOrdemDeServico,
  type ListarOrdensDeServicoQuery,
  type ListarOrdensDeServicoResposta,
  type OpcoesDaEngenhariaResposta,
  type OrdemDeServico,
  type PedirMaterial,
  type QuadroDeOrdensQuery,
  type QuadroDeOrdensResposta,
  type VisaoGeralDaEngenharia,
  editarConfiguracaoDeTipoDeOrdemSchema,
  tipoDeOrdemDeServicoSchema,
  type ConfiguracoesDaEngenharia,
  type EditarConfiguracaoDeTipoDeOrdem,
  type TipoDeOrdemDeServico,
  type VisaoGeralDaEngenhariaQuery,
  visaoGeralDaEngenhariaQuerySchema,
} from "@plugga/shared";
import type { Response } from "express";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { cabecalhoDisposicao } from "../lead-documentos/lead-documentos.rules";
import { EngenhariaHabilitadaGuard } from "./engenharia-habilitada.guard";
import { EngenhariaService, type ArquivoParaBaixar } from "./engenharia.service";
import { TELAS_DAS_ORDENS } from "./engenharia.rules";

/** Backstop de memória do multer; o limite preciso é conferido no serviço. */
const LIMITE_MULTER_BYTES = ARQUIVO_DE_ORDEM_MAX_BYTES * 2;
const COM_ARQUIVO = FileInterceptor("arquivo", { limits: { fileSize: LIMITE_MULTER_BYTES } });
const COM_ASSINATURA = FileInterceptor("assinatura", { limits: { fileSize: LIMITE_MULTER_BYTES } });

/**
 * Ordens de serviço da Engenharia (PLU-345), uma fila global para Plugga e
 * Waze. O portão vem antes da sessão: desligado, tudo responde 404.
 */
@Controller("engenharia/ordens-de-servico")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["engenharia-obras"])
@Tela(...TELAS_DAS_ORDENS)
export class EngenhariaController {
  constructor(@Inject(EngenhariaService) private readonly engenharia: EngenhariaService) {}

  @Get()
  listar(@Query(new ZodValidationPipe(listarOrdensDeServicoQuerySchema)) query: ListarOrdensDeServicoQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarOrdensDeServicoResposta> {
    return this.engenharia.listar(query, principal);
  }

  @Get("quadro")
  quadro(@Query(new ZodValidationPipe(quadroDeOrdensQuerySchema)) query: QuadroDeOrdensQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<QuadroDeOrdensResposta> {
    return this.engenharia.quadro(query, principal);
  }

  @Get("opcoes")
  opcoes(@CurrentPrincipal() principal: AuthPrincipal): Promise<OpcoesDaEngenhariaResposta> {
    return this.engenharia.opcoes(principal);
  }

  @Get("clientes")
  clientes(@Query(new ZodValidationPipe(buscarClientesDaEngenhariaQuerySchema)) query: BuscarClientesDaEngenhariaQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<BuscarClientesDaEngenhariaResposta> {
    return this.engenharia.buscarClientes(query.busca, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(@Body(new ZodValidationPipe(criarOrdemDeServicoSchema)) input: CriarOrdemDeServico, @CurrentPrincipal() principal: AuthPrincipal): Promise<OrdemDeServico> {
    return this.engenharia.criar(input, principal);
  }

  @Get(":id")
  obter(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<OrdemDeServico> {
    return this.engenharia.obter(id, principal);
  }

  @Patch(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarOrdemDeServicoSchema)) input: EditarOrdemDeServico,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OrdemDeServico> {
    return this.engenharia.editar(id, input, principal);
  }

  @Post(":id/acoes")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  acao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acaoDaOrdemDeServicoSchema)) acao: AcaoDaOrdemDeServico,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OrdemDeServico> {
    return this.engenharia.executarAcao(id, acao, principal);
  }

  @Post(":id/fotos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_ARQUIVO)
  enviarFoto(@Param("id", ParseUUIDPipe) id: string, @UploadedFile() arquivo: Express.Multer.File | undefined, @CurrentPrincipal() principal: AuthPrincipal): Promise<OrdemDeServico> {
    return this.engenharia.enviarFoto(id, arquivo && { buffer: arquivo.buffer, nomeOriginal: arquivo.originalname }, principal);
  }

  @Get(":id/arquivos/:arquivoId")
  async arquivo(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("arquivoId", ParseUUIDPipe) arquivoId: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    this.enviar(res, await this.engenharia.baixarArquivo(id, arquivoId, principal));
  }

  @Post(":id/termo")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_ASSINATURA)
  colherTermo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(colherTermoSchema)) dados: ColherTermo,
    @UploadedFile() assinatura: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OrdemDeServico> {
    return this.engenharia.colherTermo(id, dados, assinatura && { buffer: assinatura.buffer, nomeOriginal: assinatura.originalname }, principal);
  }

  @Post(":id/termo/pdf-assinado")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_ARQUIVO)
  anexarTermo(@Param("id", ParseUUIDPipe) id: string, @UploadedFile() arquivo: Express.Multer.File | undefined, @CurrentPrincipal() principal: AuthPrincipal): Promise<OrdemDeServico> {
    return this.engenharia.anexarTermoAssinado(id, arquivo && { buffer: arquivo.buffer, nomeOriginal: arquivo.originalname }, principal);
  }

  @Get(":id/termo/pdf")
  async termo(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal, @Res() res: Response): Promise<void> {
    this.enviar(res, await this.engenharia.baixarTermo(id, principal));
  }

  @Post(":id/pedidos-de-material")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  pedirMaterial(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pedirMaterialSchema)) input: PedirMaterial,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OrdemDeServico> {
    return this.engenharia.pedirMaterial(id, input, principal);
  }

  /** PDF e imagem abrem no navegador; o tipo é o detectado no envio, e `nosniff` impede reinterpretação. */
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

/**
 * Visão geral da Engenharia (PLU-349): o dia do departamento. Entra quem é da
 * Engenharia; cada bloco mostra o que as telas da pessoa alcançam (o RLS recorta).
 */
@Controller("engenharia/visao-geral")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["engenharia-obras"])
export class VisaoGeralDaEngenhariaController {
  constructor(@Inject(EngenhariaService) private readonly engenharia: EngenhariaService) {}

  @Get()
  visaoGeral(@Query(new ZodValidationPipe(visaoGeralDaEngenhariaQuerySchema)) query: VisaoGeralDaEngenhariaQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<VisaoGeralDaEngenharia> {
    return this.engenharia.visaoGeral(query, principal);
  }
}

/**
 * Configurações da Engenharia (PLU-349): os tipos de O.S., com o prazo padrão
 * e quem agenda. Lê quem opera as O.S.; muda o gerente da Engenharia.
 */
@Controller("engenharia/configuracoes")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["engenharia-obras"])
@Tela(...TELAS_DAS_ORDENS)
export class ConfiguracoesDaEngenhariaController {
  constructor(@Inject(EngenhariaService) private readonly engenharia: EngenhariaService) {}

  @Get()
  configuracoes(@CurrentPrincipal() principal: AuthPrincipal): Promise<ConfiguracoesDaEngenharia> {
    return this.engenharia.configuracoes(principal);
  }

  @Put("tipos/:tipo")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editarTipo(
    @Param("tipo", new ZodValidationPipe(tipoDeOrdemDeServicoSchema)) tipo: TipoDeOrdemDeServico,
    @Body(new ZodValidationPipe(editarConfiguracaoDeTipoDeOrdemSchema)) input: EditarConfiguracaoDeTipoDeOrdem,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ConfiguracoesDaEngenharia> {
    return this.engenharia.editarTipo(tipo, input, principal);
  }
}

import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  clientesParaProtocoloQuerySchema,
  criarDistribuidoraSchema,
  criarProtocoloSchema,
  editarDistribuidoraSchema,
  editarProtocoloSchema,
  idDeDistribuidoraSchema,
  listarProtocolosQuerySchema,
  verificarProtocoloSchema,
  type ClientesParaProtocoloQuery,
  type ClientesParaProtocoloResposta,
  type CriarDistribuidora,
  type CriarProtocolo,
  type EditarDistribuidora,
  type EditarProtocolo,
  type ListarDistribuidorasResposta,
  type ListarProtocolosQuery,
  type ListarProtocolosResposta,
  type OpcoesDosProtocolosResposta,
  type Protocolo,
  type VerificarProtocolo,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { EngenhariaHabilitadaGuard } from "./engenharia-habilitada.guard";
import { ProtocolosService } from "./protocolos.service";

const DISTRIBUIDORA = new ZodValidationPipe(idDeDistribuidoraSchema);

/**
 * Protocolos na distribuidora (PLU-348), da Engenharia e do Operacional. Entra
 * quem é de um dos dois departamentos; o serviço e o RLS decidem pela tela de
 * protocolos de cada um. Atrás do portão da Engenharia, que vem antes da sessão.
 * As rotas fixas vêm antes de `:id`.
 */
@Controller("protocolos")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcessoGuard)
@Departamento(["engenharia-obras", "energia-opm"])
export class ProtocolosController {
  constructor(@Inject(ProtocolosService) private readonly protocolos: ProtocolosService) {}

  @Get()
  listar(@Query(new ZodValidationPipe(listarProtocolosQuerySchema)) query: ListarProtocolosQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarProtocolosResposta> {
    return this.protocolos.listar(query, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(@Body(new ZodValidationPipe(criarProtocoloSchema)) input: CriarProtocolo, @CurrentPrincipal() principal: AuthPrincipal): Promise<Protocolo> {
    return this.protocolos.criar(input, principal);
  }

  @Get("opcoes")
  opcoes(@CurrentPrincipal() principal: AuthPrincipal): Promise<OpcoesDosProtocolosResposta> {
    return this.protocolos.opcoes(principal);
  }

  @Get("clientes")
  clientes(@Query(new ZodValidationPipe(clientesParaProtocoloQuerySchema)) query: ClientesParaProtocoloQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientesParaProtocoloResposta> {
    return this.protocolos.clientes(query.busca, principal);
  }

  @Get("distribuidoras")
  distribuidoras(@CurrentPrincipal() principal: AuthPrincipal): Promise<ListarDistribuidorasResposta> {
    return this.protocolos.distribuidoras(principal);
  }

  @Post("distribuidoras")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criarDistribuidora(@Body(new ZodValidationPipe(criarDistribuidoraSchema)) input: CriarDistribuidora, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarDistribuidorasResposta> {
    return this.protocolos.criarDistribuidora(input, principal);
  }

  @Patch("distribuidoras/:id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editarDistribuidora(@Param("id", DISTRIBUIDORA) id: string, @Body(new ZodValidationPipe(editarDistribuidoraSchema)) input: EditarDistribuidora, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListarDistribuidorasResposta> {
    return this.protocolos.editarDistribuidora(id, input, principal);
  }

  @Get(":id")
  obter(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Protocolo> {
    return this.protocolos.protocolo(id, principal);
  }

  @Patch(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(editarProtocoloSchema)) input: EditarProtocolo, @CurrentPrincipal() principal: AuthPrincipal): Promise<Protocolo> {
    return this.protocolos.editar(id, input, principal);
  }

  @Post(":id/verificacoes")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  verificar(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(verificarProtocoloSchema)) input: VerificarProtocolo, @CurrentPrincipal() principal: AuthPrincipal): Promise<Protocolo> {
    return this.protocolos.verificar(id, input, principal);
  }
}

import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseEnumPipe,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  cnpjDaEmpresaSchema,
  companyKeys,
  confirmarConexaoOmieSchema,
  entradaDoOmieSchema,
  type CnpjDaEmpresa,
  type CompanyKey,
  type ConfirmarConexaoOmie,
  type EntradaDoOmie,
  type EstadoDasConexoesOmie,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { FinanceiroHabilitadoGuard } from "../financeiro/financeiro-habilitado.guard";
import { chaveMestraConfigurada } from "../llm/cripto.js";
import { MENSAGEM_DO_OMIE } from "./omie.controller";
import { OmieConexoesService } from "./omie-conexoes.service";
import { OmieFalhouError } from "./omie.port";

const EMPRESA = new ParseEnumPipe(companyKeys);

/**
 * O OMIE por empresa (PLU-342) em Configurações › Integrações. Quem gere: Desenvolvedor,
 * Admin e Gerente do Financeiro (D6). O segredo é escrita-apenas. O CNPJ da empresa,
 * contra o qual a conexão é conferida, é só da plataforma. Atrás do portão do
 * Financeiro até o módulo ficar completo (decisão do Coordenador): fechado, 404, e
 * o cartão da conta única segue valendo.
 */
@Controller("integracoes/omie/empresas")
@UseGuards(FinanceiroHabilitadoGuard, SessionAuthGuard, AcessoGuard)
@Departamento("financeiro", "gerente")
export class OmieEmpresasController {
  constructor(@Inject(OmieConexoesService) private readonly conexoes: OmieConexoesService) {}

  @Get()
  estado(): Promise<EstadoDasConexoesOmie> {
    return this.conexoes.estado();
  }

  @Put(":empresa")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  gravar(
    @Param("empresa", EMPRESA) empresa: CompanyKey,
    @Body(new ZodValidationPipe(entradaDoOmieSchema)) entrada: EntradaDoOmie,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<EstadoDasConexoesOmie> {
    if (!chaveMestraConfigurada()) {
      throw new ServiceUnavailableException("o cofre não está configurado: defina SECRETS_ENCRYPTION_KEY no ambiente e reinicie a API");
    }
    return this.conexoes.gravar(empresa, entrada, principal);
  }

  @Delete(":empresa")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  apagar(@Param("empresa", EMPRESA) empresa: CompanyKey, @CurrentPrincipal() principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    return this.conexoes.apagar(empresa, principal);
  }

  /** Chama o ListarEmpresas com o par. Só a pedido de quem está na tela. */
  @Post(":empresa/teste")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  testar(@Param("empresa", EMPRESA) empresa: CompanyKey, @CurrentPrincipal() principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    return comMotivoDoOmie(() => this.conexoes.testar(empresa, principal));
  }

  @Post(":empresa/confirmar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  confirmar(
    @Param("empresa", EMPRESA) empresa: CompanyKey,
    @Body(new ZodValidationPipe(confirmarConexaoOmieSchema)) entrada: ConfirmarConexaoOmie,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<EstadoDasConexoesOmie> {
    return this.conexoes.confirmar(empresa, entrada.cnpj, principal);
  }

  /** A conta única de antes vira o par da Plugga, testada com as mesmas regras. */
  @Post("plugga/mover-conta-antiga")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  moverContaAntiga(@CurrentPrincipal() principal: AuthPrincipal): Promise<EstadoDasConexoesOmie> {
    return comMotivoDoOmie(() => this.conexoes.moverContaAntiga(principal));
  }

  /** O CNPJ de referência: quem conecta não define a própria referência. */
  @Put(":empresa/cnpj")
  @Plataforma("admin")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  definirCnpj(
    @Param("empresa", EMPRESA) empresa: CompanyKey,
    @Body(new ZodValidationPipe(cnpjDaEmpresaSchema)) entrada: CnpjDaEmpresa,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<EstadoDasConexoesOmie> {
    return this.conexoes.definirCnpj(empresa, entrada.cnpj, principal);
  }
}

/** Só um texto fixo por motivo: nunca a chave, o segredo ou a mensagem do OMIE. */
async function comMotivoDoOmie<T>(fazer: () => Promise<T>): Promise<T> {
  try {
    return await fazer();
  } catch (erro) {
    if (erro instanceof OmieFalhouError) throw new BadGatewayException(MENSAGEM_DO_OMIE[erro.motivo]);
    throw erro;
  }
}

import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { EmpresaConsultada, EnderecoConsultado } from "@plugga/shared";

import { Authenticated } from "../core/auth/access.decorators";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { ConsultaCadastralService } from "./consulta-cadastral.service";

/**
 * Consulta de CNPJ e CEP para as telas. Qualquer pessoa logada consulta (é dado
 * público, usado no cadastro de cliente e de lead); o que a plataforma controla é
 * se a integração está ligada. Limite de taxa para a fonte pública não virar alvo.
 */
@Controller("cadastro")
@Authenticated()
@UseGuards(SessionAuthGuard, ThrottlerGuard)
export class CadastroController {
  constructor(@Inject(ConsultaCadastralService) private readonly consulta: ConsultaCadastralService) {}

  @Get("cnpj/:cnpj")
  cnpj(@Param("cnpj") cnpj: string): Promise<EmpresaConsultada> {
    return this.consulta.empresa(cnpj);
  }

  @Get("cep/:cep")
  cep(@Param("cep") cep: string): Promise<EnderecoConsultado> {
    return this.consulta.endereco(cep);
  }
}

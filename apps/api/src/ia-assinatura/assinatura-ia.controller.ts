import {
  BadGatewayException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  consultaDeContaSchema,
  consultaDeLoginSchema,
  provedorDeAssinaturaSchema,
  type EstadoDaAssinatura,
  type LoginDeAssinatura,
  type ProvedorDeAssinatura,
  type SituacaoDoLogin,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Plataforma } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { AssinaturaIaService } from "./assinatura-ia.service";
import { CliProxyFalhouError } from "./cliproxy.port";

const MENSAGEM: Record<CliProxyFalhouError["motivo"], string> = {
  nao_configurado: "O proxy de assinatura não está configurado na API: faltam CLIPROXY_URL e CLIPROXY_MANAGEMENT_KEY no ambiente.",
  fora_do_ar: "O proxy de assinatura não está respondendo. Confira se o serviço está rodando.",
  chave_recusada: "O proxy recusou a chave de gerenciamento. Confira CLIPROXY_MANAGEMENT_KEY.",
  resposta_inesperada: "O proxy respondeu de um jeito inesperado. Confira a versão dele e tente de novo.",
};

const provedorPipe = new ZodValidationPipe(provedorDeAssinaturaSchema);

/** Só um texto fixo por motivo: nunca a chave, o corpo do proxy ou dado de conta. */
async function comTraducao<T>(trabalho: () => Promise<T>): Promise<T> {
  try {
    return await trabalho();
  } catch (erro) {
    if (erro instanceof CliProxyFalhouError) throw new BadGatewayException(MENSAGEM[erro.motivo]);
    throw erro;
  }
}

/**
 * Claude e Codex pela assinatura, via proxy de CLI. Só desenvolvedor: é infraestrutura
 * da plataforma e o login usa a conta de uma pessoa. O aceite do risco é registrado
 * e exigido antes do login.
 */
@Controller("integracoes/ia-assinatura/:provedor")
@UseGuards(SessionAuthGuard, AcessoGuard)
export class AssinaturaIaController {
  constructor(@Inject(AssinaturaIaService) private readonly servico: AssinaturaIaService) {}

  @Get()
  @Plataforma("desenvolvedor")
  estado(@Param("provedor", provedorPipe) provedor: ProvedorDeAssinatura): Promise<EstadoDaAssinatura> {
    return this.servico.estado(provedor);
  }

  @Post("risco")
  @HttpCode(200)
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  aceitarRisco(@Param("provedor", provedorPipe) provedor: ProvedorDeAssinatura, @CurrentPrincipal() quem?: AuthPrincipal): Promise<EstadoDaAssinatura> {
    return this.servico.aceitarRisco(provedor, quem?.id ?? "desconhecido");
  }

  @Post("login")
  @HttpCode(200)
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  iniciarLogin(@Param("provedor", provedorPipe) provedor: ProvedorDeAssinatura, @CurrentPrincipal() quem?: AuthPrincipal): Promise<LoginDeAssinatura> {
    return comTraducao(() => this.servico.iniciarLogin(provedor, quem?.id ?? "desconhecido"));
  }

  @Get("login")
  @Plataforma("desenvolvedor")
  async situacaoDoLogin(
    @Param("provedor", provedorPipe) _provedor: ProvedorDeAssinatura,
    @Query(new ZodValidationPipe(consultaDeLoginSchema)) { estado }: { estado: string },
  ): Promise<{ situacao: SituacaoDoLogin }> {
    return { situacao: await comTraducao(() => this.servico.situacaoDoLogin(estado)) };
  }

  @Delete("contas")
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  removerConta(
    @Param("provedor", provedorPipe) provedor: ProvedorDeAssinatura,
    @Query(new ZodValidationPipe(consultaDeContaSchema)) { arquivo }: { arquivo: string },
    @CurrentPrincipal() quem?: AuthPrincipal,
  ): Promise<EstadoDaAssinatura> {
    return comTraducao(() => this.servico.removerConta(provedor, arquivo, quem?.id ?? "desconhecido"));
  }

  /** Confere a conexão listando os modelos do provedor no proxy. Não gasta cota da assinatura. */
  @Post("teste")
  @HttpCode(200)
  @Plataforma("desenvolvedor")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  testar(@Param("provedor", provedorPipe) provedor: ProvedorDeAssinatura): Promise<{ modelos: string[] }> {
    return comTraducao(() => this.servico.testar(provedor));
  }
}

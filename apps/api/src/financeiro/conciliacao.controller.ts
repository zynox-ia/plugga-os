import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  conciliarSchema,
  desfazerConciliacaoSchema,
  escopoDaConciliacaoSchema,
  listarMovimentosDoExtratoQuerySchema,
  marcarNaConciliacaoSchema,
  type Conciliar,
  type DesfazerConciliacao,
  type EscopoDaConciliacao,
  type ExtratoImportado,
  type ListarMovimentosDoExtratoQuery,
  type MarcarNaConciliacao,
  type MovimentosDoExtratoResposta,
  type PainelDaConciliacao,
} from "@plugga/shared";

import { UmArquivo } from "../common/upload";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { ConciliacaoService } from "./conciliacao.service";
import { EXTRATO_MAX_BYTES } from "./extrato-ofx";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";

/** O limite do multer folga sobre o do extrato: quem diz "grande demais" é o serviço, com a mensagem certa. */
const COM_EXTRATO = UmArquivo("arquivo", EXTRATO_MAX_BYTES * 2);

/** A conciliação (PLU-339): de quem tem a tela Conciliação do Financeiro. */
@Controller("financeiro")
@UseGuards(FinanceiroHabilitadoGuard, SessionAuthGuard, AcessoGuard)
@Departamento("financeiro")
@Tela("financeiro.conciliacao")
export class ConciliacaoController {
  constructor(@Inject(ConciliacaoService) private readonly conciliacao: ConciliacaoService) {}

  /** O extrato da conta, em OFX (multipart: `arquivo`). */
  @Post("contas-correntes/:id/extratos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @UseInterceptors(COM_EXTRATO)
  importarExtrato(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ExtratoImportado> {
    return this.conciliacao.importarExtrato(id, arquivo && { buffer: arquivo.buffer, nomeOriginal: arquivo.originalname }, principal);
  }

  @Get("conciliacao/movimentos")
  movimentos(@Query(new ZodValidationPipe(listarMovimentosDoExtratoQuerySchema)) query: ListarMovimentosDoExtratoQuery): Promise<MovimentosDoExtratoResposta> {
    return this.conciliacao.movimentos(query);
  }

  /** O painel: sugeridos, valor diferente, sem par e conciliados, de uma conta ou de todas do escopo. */
  @Get("conciliacao")
  painel(@Query(new ZodValidationPipe(escopoDaConciliacaoSchema)) escopo: EscopoDaConciliacao): Promise<PainelDaConciliacao> {
    return this.conciliacao.painel(escopo);
  }

  @Post("conciliacao/conciliar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async conciliar(@Body(new ZodValidationPipe(conciliarSchema)) entrada: Conciliar, @CurrentPrincipal() principal: AuthPrincipal): Promise<{ conciliado: true }> {
    await this.conciliacao.conciliar(entrada.movimentoId, entrada.lancamentoId, principal);
    return { conciliado: true };
  }

  @Post("conciliacao/conciliar-sugeridos")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  conciliarSugeridos(@Body(new ZodValidationPipe(escopoDaConciliacaoSchema)) escopo: EscopoDaConciliacao, @CurrentPrincipal() principal: AuthPrincipal): Promise<{ conciliados: number }> {
    return this.conciliacao.conciliarSugeridos(escopo, principal);
  }

  @Post("conciliacao/desfazer")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async desfazer(@Body(new ZodValidationPipe(desfazerConciliacaoSchema)) entrada: DesfazerConciliacao, @CurrentPrincipal() principal: AuthPrincipal): Promise<{ desfeito: true }> {
    await this.conciliacao.desfazer(entrada.movimentoId, entrada.motivo, principal);
    return { desfeito: true };
  }

  @Post("conciliacao/marcar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async marcar(@Body(new ZodValidationPipe(marcarNaConciliacaoSchema)) entrada: MarcarNaConciliacao): Promise<{ marcado: boolean }> {
    await this.conciliacao.marcar(entrada);
    return { marcado: entrada.marcado };
  }
}

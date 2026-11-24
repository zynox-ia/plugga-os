import { Inject, Injectable } from "@nestjs/common";

import { AuditAppender } from "../audit/audit-appender";
import { EstadoInvalido, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

/**
 * O que o conector do OMIE faz com um lançamento a pedido de quem opera o Financeiro
 * (PLU-342). Fica no conector, não no Financeiro: desligado o OMIE, o Financeiro segue igual.
 */
@Injectable()
export class PrismaOmieLancamentosRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  /**
   * "Tentar de novo": os envios do lançamento que estão com erro voltam ao início da
   * fila, com as tentativas zeradas. Nada sai daqui: a fila confere o modo. O RLS
   * recorta o lançamento que a pessoa alcança (saída de Contas a pagar, entrada de a receber).
   */
  async tentarDeNovo(id: string, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      const [lancamento] = await tx.$queryRaw<{ company_id: string }[]>`SELECT company_id FROM public.lancamentos WHERE id = ${id}::uuid FOR UPDATE`;
      if (!lancamento) throw new NaoEncontrado("Lançamento não encontrado.");
      const voltaram = await tx.$executeRaw`
        UPDATE public.omie_envios SET estado = 'pendente', tentativas = 0, ultimo_erro = NULL, proxima_tentativa_em = now()
        WHERE lancamento_id = ${id}::uuid AND estado = 'erro'`;
      if (voltaram === 0) throw new EstadoInvalido("Não há envio ao OMIE com erro neste lançamento.");
      await tx.historicoDeLancamento.create({ data: { lancamentoId: id, tipo: "omie", porId: principal.id, dados: { acao: "tentar_de_novo", envios: voltaram }, em: agora } });
      await this.auditoria.append(tx, {
        eventName: "financeiro.lancamento.updated",
        entityType: "lancamento",
        entityId: id,
        companyId: lancamento.company_id,
        actorType: principal.kind === "user" ? "user" : "agent",
        actorId: principal.id,
        payload: { campos: ["omie"] },
        occurredAt: new Date(),
      });
    });
  }
}


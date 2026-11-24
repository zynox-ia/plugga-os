import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { codigoDaOrdemDeServico, eventNames, ordemPeloAgenteRespostaSchema, type CriarOrdemPeloAgente, type OrdemPeloAgenteResposta } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, NaoProcessavel } from "../common/errors/dominio";
import { diaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

const ACAO = "engenharia.ordem.criar" as const;

export type PedidoDoAgente = { chave: string; hash: string; input: CriarOrdemPeloAgente };

/**
 * Persistência da entrada de O.S. pelo robô (PLU-351): o pedido por chave de
 * idempotência, a chave natural do cliente, a trilha do agente e a resposta,
 * na mesma transação da O.S. (que o repositório das O.S. cria pelo callback).
 */
@Injectable()
export class PrismaOrdensPeloAgenteRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  /**
   * Devolve a O.S. do pedido já feito (mesma chave e corpo) ou cria pela chave
   * natural. Na corrida com a mesma chave, o unique (agente, chave) decide e a
   * O.S. da tentativa perdedora é desfeita junto; o Prisma nem sempre diz o alvo
   * do P2002, então relê o pedido; sem pedido gravado, o erro era outro e segue.
   */
  async executar(pedido: PedidoDoAgente, principal: AuthPrincipal, criarOrdem: (chave: { clienteId: string; ucId: string | null }) => Promise<string>): Promise<{ resposta: OrdemPeloAgenteResposta; criada: boolean }> {
    const canal = pedido.input.origem.canal;
    try {
      return await this.prisma.comContexto(async (tx) => {
        const anterior = await this.repetido(tx, pedido.chave, pedido.hash, canal, principal);
        if (anterior) return { resposta: anterior, criada: false };
        const id = await criarOrdem(await this.resolverChave(tx, pedido.input));
        await tx.pedidoDeAgente.create({ data: { agentUserId: principal.id, chave: pedido.chave, acao: ACAO, hashDoCorpo: pedido.hash, entityType: "ordem_de_servico", entityId: id } });
        await this.trilha(tx, id, canal, "criada", principal);
        return { resposta: await this.resposta(tx, id, false), criada: true };
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        return this.prisma.comContexto(async (tx) => {
          const anterior = await this.repetido(tx, pedido.chave, pedido.hash, canal, principal);
          if (!anterior) throw erro;
          return { resposta: anterior, criada: false };
        });
      }
      throw erro;
    }
  }

  /** O pedido já feito com esta chave: a mesma O.S. (corpo igual) ou 409 (corpo diferente). */
  private async repetido(tx: Prisma.TransactionClient, chave: string, hash: string, canal: string, principal: AuthPrincipal): Promise<OrdemPeloAgenteResposta | null> {
    const pedido = await tx.pedidoDeAgente.findUnique({ where: { agentUserId_chave: { agentUserId: principal.id, chave } }, select: { hashDoCorpo: true, entityId: true, acao: true } });
    if (!pedido) return null;
    if (pedido.acao !== ACAO || pedido.hashDoCorpo !== hash) throw new Conflito("Esta Idempotency-Key já foi usada com outro pedido.");
    await this.trilha(tx, pedido.entityId, canal, "repetida", principal);
    return this.resposta(tx, pedido.entityId, true);
  }

  /** A UC pelo código (com o documento, se veio, para desempatar) ou o cliente pelo documento. */
  private async resolverChave(tx: Prisma.TransactionClient, input: CriarOrdemPeloAgente): Promise<{ clienteId: string; ucId: string | null }> {
    const linhas = await tx.$queryRaw<{ client_id: string; uc_id: string | null }[]>`
      SELECT client_id, uc_id FROM plugga_security.chave_natural_para_engenharia(${input.documento ?? null}::text, ${input.uc ?? null}::text)`;
    if (linhas.length === 0) {
      throw new NaoProcessavel(input.uc
        ? `Nenhuma UC ativa com esse código${input.documento ? " para esse documento" : ""}.`
        : "Nenhum cliente ativo com esse documento.", [{ campo: input.uc ? "uc" : "documento", problema: "Confira o dado enviado." }]);
    }
    if (linhas.length > 1) {
      throw new NaoProcessavel("Mais de uma UC com esse código; envie também o documento do cliente.", [{ campo: "documento", problema: "Envie o CNPJ/CPF para desempatar." }]);
    }
    return { clienteId: linhas[0]!.client_id, ucId: linhas[0]!.uc_id };
  }

  private async resposta(tx: Prisma.TransactionClient, id: string, repetido: boolean): Promise<OrdemPeloAgenteResposta> {
    const ordem = await tx.ordemDeServico.findUniqueOrThrow({ where: { id }, select: { id: true, numero: true, situacao: true, prazo: true } });
    return ordemPeloAgenteRespostaSchema.parse({ ordem: { id: ordem.id, codigo: codigoDaOrdemDeServico(ordem.numero), situacao: ordem.situacao, prazo: diaEmManaus(ordem.prazo) }, repetido });
  }

  /** Trilha do agente: só a ação, o canal e o resultado; nada do corpo. */
  private async trilha(tx: Prisma.TransactionClient, id: string, canal: string, resultado: "criada" | "repetida", principal: AuthPrincipal): Promise<void> {
    await tx.agentAction.create({
      data: {
        agent: principal.id, agentUserId: principal.id, requestedById: null, channel: canal, action: ACAO,
        entityType: "ordem_de_servico", entityId: id, input: {}, payload: {},
        decision: "allowed", approvalStatus: "not_required", status: "recorded", result: resultado,
      },
    });
    await this.auditoria.append(tx, {
      eventName: eventNames.agentActionRecorded,
      entityType: "ordem_de_servico",
      entityId: id,
      actorType: "agent",
      actorId: principal.id,
      payload: { action: ACAO, channel: canal, decision: "allowed", status: "recorded", result: resultado },
      occurredAt: new Date(),
    });
  }
}

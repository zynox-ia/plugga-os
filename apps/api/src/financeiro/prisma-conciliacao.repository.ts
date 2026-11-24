import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CompanyKey, ExtratoImportado, ListarMovimentosDoExtratoQuery, MovimentoDoExtrato, MovimentosDoExtratoResposta } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, NaoEncontrado } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { conteudoDoMovimento, type ExtratoLido, type MovimentoLido } from "./extrato-ofx";

export type ContaDoExtrato = { id: string; companyId: CompanyKey; nome: string; numero: string | null };
export type ArquivoDoExtrato = { chave: string; nome: string; tamanho: number; sha256: string; origem: "ofx" | "csv" };

type LinhaDoExtrato = Prisma.ExtratoBancarioGetPayload<object>;
const paraExtrato = (e: LinhaDoExtrato, repetidos: number): ExtratoImportado => ({
  id: e.id,
  contaCorrenteId: e.contaCorrenteId,
  origem: e.origem as ExtratoImportado["origem"],
  arquivoNome: e.arquivoNome,
  periodo: { de: diaEmManaus(e.periodoDe), ate: diaEmManaus(e.periodoAte) },
  saldoInformado: e.saldoInformado && e.saldoInformadoEm ? { valor: e.saldoInformado.toFixed(2), em: diaEmManaus(e.saldoInformadoEm) } : null,
  movimentos: e.movimentos,
  novos: e.novos,
  repetidos,
  importadoEm: e.importadoEm.toISOString(),
});

/**
 * A conciliação (PLU-339): o extrato bancário importado e os movimentos dele. Quem tem a
 * tela Conciliação lê e importa (RLS); nada se apaga. A descrição dos movimentos é dado
 * bancário: não vai a evento nem a log.
 */
@Injectable()
export class PrismaConciliacaoRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  async conta(id: string): Promise<ContaDoExtrato> {
    const conta = await this.prisma.comContexto((tx) => tx.contaCorrente.findUnique({ where: { id }, select: { id: true, companyId: true, nome: true, numero: true } }));
    if (!conta) throw new NaoEncontrado("Conta corrente não encontrada.");
    return { ...conta, companyId: conta.companyId as CompanyKey };
  }

  /**
   * O extrato e os movimentos novos, numa transação, com a conta travada (duas importações
   * ao mesmo tempo não duplicam nada). O mesmo arquivo na mesma conta é recusado; o
   * movimento que já entrou por outro arquivo conta como repetido.
   */
  async importar(conta: ContaDoExtrato, arquivo: ArquivoDoExtrato, lido: ExtratoLido, principal: AuthPrincipal, agora: Date): Promise<ExtratoImportado> {
    return this.prisma.comContexto(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`extrato.${conta.id}`}))`;
      const mesmo = await tx.extratoBancario.findUnique({ where: { contaCorrenteId_arquivoSha256: { contaCorrenteId: conta.id, arquivoSha256: arquivo.sha256 } }, select: { id: true, importadoEm: true } });
      if (mesmo) {
        throw new Conflito(`Este arquivo já foi importado nesta conta em ${diaEmManaus(mesmo.importadoEm).split("-").reverse().join("/")}.`, undefined, { existente: { id: mesmo.id } });
      }
      const novos = await this.movimentosNovos(tx, conta.id, lido.movimentos);

      const extrato = await tx.extratoBancario.create({
        data: {
          companyId: conta.companyId,
          contaCorrenteId: conta.id,
          origem: arquivo.origem,
          arquivoChave: arquivo.chave,
          arquivoNome: arquivo.nome,
          arquivoTamanho: arquivo.tamanho,
          arquivoSha256: arquivo.sha256,
          periodoDe: inicioDoDiaEmManaus(lido.periodo!.de),
          periodoAte: inicioDoDiaEmManaus(lido.periodo!.ate),
          saldoInformado: lido.saldo ? new Prisma.Decimal(lido.saldo.valor) : null,
          saldoInformadoEm: lido.saldo ? inicioDoDiaEmManaus(lido.saldo.em) : null,
          movimentos: lido.movimentos.length,
          novos: novos.length,
          importadoPorId: principal.kind === "user" ? principal.id : null,
          importadoEm: agora,
        },
      });
      if (novos.length > 0) {
        await tx.movimentoDoExtrato.createMany({
          data: novos.map((m) => ({
            companyId: conta.companyId, contaCorrenteId: conta.id, extratoId: extrato.id,
            dia: inicioDoDiaEmManaus(m.dia), valor: new Prisma.Decimal(m.valor), descricao: m.descricao, identificador: m.identificador,
          })),
        });
      }
      // Só contagens: o conteúdo do extrato é dado bancário.
      await this.auditoria.append(tx, {
        eventName: "financeiro.extrato.importado",
        entityType: "extrato_bancario",
        entityId: extrato.id,
        companyId: conta.companyId,
        actorType: principal.kind === "user" ? "user" : "agent",
        actorId: principal.id,
        payload: { origem: arquivo.origem, movimentos: lido.movimentos.length, novos: novos.length },
        occurredAt: agora,
      });
      return paraExtrato(extrato, lido.movimentos.length - novos.length);
    });
  }

  /**
   * Os movimentos do arquivo que ainda não entraram na conta. Repetido é só o de mesmo
   * identificador E mesmo conteúdo (dia, valor e descrição). Há bancos que repetem o FITID:
   * com outro conteúdo, no arquivo ou contra o que já entrou, o movimento entra com o
   * identificador sufixado pelo conteúdo, e nada some em silêncio.
   */
  private async movimentosNovos(tx: Prisma.TransactionClient, contaId: string, movimentos: readonly MovimentoLido[]): Promise<MovimentoLido[]> {
    const sufixado = (m: MovimentoLido) => `${m.identificador}~${m.conteudo}`;
    const candidatos = [...new Set(movimentos.flatMap((m) => [m.identificador, sufixado(m)]))];
    const ja = await tx.$queryRaw<{ identificador: string; dia: Date; valor: Prisma.Decimal; descricao: string }[]>`
      SELECT identificador, dia, valor, descricao FROM public.movimentos_do_extrato
      WHERE conta_corrente_id = ${contaId}::uuid AND identificador = ANY(${candidatos}::text[])`;
    const existentes = new Map(ja.map((m) => [m.identificador, conteudoDoMovimento(diaEmManaus(m.dia), m.valor.toFixed(2), m.descricao)]));
    const doArquivo = new Map<string, string>();
    const novos: MovimentoLido[] = [];
    for (const m of movimentos) {
      const conflita = (conteudo: string | undefined) => conteudo !== undefined && conteudo !== m.conteudo;
      const identificador = conflita(existentes.get(m.identificador)) || conflita(doArquivo.get(m.identificador)) ? sufixado(m) : m.identificador;
      if (existentes.get(identificador) === m.conteudo || doArquivo.get(identificador) === m.conteudo) continue;
      doArquivo.set(identificador, m.conteudo);
      novos.push({ ...m, identificador });
    }
    return novos;
  }

  async listar(query: ListarMovimentosDoExtratoQuery): Promise<MovimentosDoExtratoResposta> {
    const de = inicioDoDiaEmManaus(query.de);
    const ate = inicioDoDiaEmManaus(query.ate);
    return this.prisma.comContexto(async (tx) => {
      const [movimentos, extratos] = await Promise.all([
        tx.movimentoDoExtrato.findMany({
          where: { contaCorrenteId: query.contaCorrenteId, dia: { gte: de, lte: ate } },
          orderBy: [{ dia: "desc" }, { identificador: "asc" }],
        }),
        tx.extratoBancario.findMany({
          where: { contaCorrenteId: query.contaCorrenteId, periodoDe: { lte: ate }, periodoAte: { gte: de } },
          orderBy: { importadoEm: "desc" },
        }),
      ]);
      return {
        itens: movimentos.map((m): MovimentoDoExtrato => ({
          id: m.id, contaCorrenteId: m.contaCorrenteId, dia: diaEmManaus(m.dia), valor: m.valor.toFixed(2), descricao: m.descricao,
          estado: m.estado as MovimentoDoExtrato["estado"],
        })),
        extratos: extratos.map((e) => paraExtrato(e, e.movimentos - e.novos)),
      };
    });
  }
}

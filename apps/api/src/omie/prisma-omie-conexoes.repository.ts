import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CompanyKey, EmpresaDoOmie, NomeDeEventoDoCatalogo } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, Conflito, EstadoInvalido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { EMPRESAS_GUARDADAS_DO_TESTE, avaliarTeste, outraEmpresa, type OutraEmpresa, type ResultadoDoTeste } from "./omie-conexoes.rules";

const PESSOA = { select: { id: true, name: true } } as const;
const INCLUDE = { ultimoTestePor: PESSOA, confirmadaPor: PESSOA } satisfies Prisma.OmieConexaoInclude;
export type LinhaDaConexao = Prisma.OmieConexaoGetPayload<{ include: typeof INCLUDE }>;

const PAR_MUDOU = "O par mudou ou o teste já não é o mesmo. Teste de novo.";

/** O que o teste guardou: as primeiras empresas e o total (aceita a lista solta de antes). */
export function empresasDoTeste(guardado: Prisma.JsonValue | null): { empresas: EmpresaDoOmie[]; total: number } {
  if (Array.isArray(guardado)) return { empresas: guardado as unknown as EmpresaDoOmie[], total: guardado.length };
  const g = (guardado ?? {}) as { empresas?: EmpresaDoOmie[]; total?: number };
  return { empresas: g.empresas ?? [], total: g.total ?? g.empresas?.length ?? 0 };
}

/**
 * A conferência dos pares do OMIE (PLU-342) e o CNPJ das empresas. O par em si
 * fica no cofre (`SegredoRepository`); aqui só o que não é segredo, com os
 * eventos na mesma transação.
 */
@Injectable()
export class PrismaOmieConexoesRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  async linhas(): Promise<Map<CompanyKey, LinhaDaConexao>> {
    const linhas = await this.prisma.comContexto((tx) => tx.omieConexao.findMany({ include: INCLUDE }));
    return new Map(linhas.map((l) => [l.companyId as CompanyKey, l]));
  }

  async cnpjsDoCadastro(): Promise<Map<CompanyKey, string | null>> {
    const empresas = await this.prisma.comContexto((tx) => tx.company.findMany({ select: { id: true, cnpj: true } }));
    return new Map(empresas.map((e) => [e.id as CompanyKey, e.cnpj]));
  }

  /**
   * Pela função do banco: só a plataforma grava. Na mesma transação, com as duas
   * conferências travadas, reavalia as conexões já confirmadas contra o cadastro
   * novo: bloqueia a que tiver o confirmado diferente do próprio cadastro e a que
   * tiver o confirmado igual ao cadastro da outra empresa.
   */
  async definirCnpj(empresa: CompanyKey, cnpj: string | null, principal: AuthPrincipal): Promise<CompanyKey[]> {
    return this.prisma.comContexto(async (tx) => {
      await this.travar(tx);
      try {
        await tx.$executeRaw`SELECT plugga_security.definir_cnpj_da_empresa(${empresa}, ${cnpj})`;
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && /insufficient_privilege|42501/.test(erro.message)) {
          throw new AcessoNegado("Só Admin e Desenvolvedor definem o CNPJ da empresa.");
        }
        if (erro instanceof Prisma.PrismaClientKnownRequestError && /companies_cnpj_key|23505/.test(erro.message)) {
          throw new Conflito("Este CNPJ já é o da outra empresa.", [{ campo: "cnpj", problema: "Este CNPJ já é o da outra empresa." }]);
        }
        throw erro;
      }
      await this.registrar(tx, "organizacao.empresa.cnpj_definido", empresa, principal, { definido: cnpj !== null });

      const bloqueadas: CompanyKey[] = [];
      for (const alvo of ["plugga", "waze"] as const) {
        const conferencia = await tx.omieConexao.findUnique({ where: { companyId: alvo }, select: { confirmadaEm: true, cnpjConfirmado: true } });
        if (!conferencia?.confirmadaEm || !conferencia.cnpjConfirmado) continue;
        const { cnpjDoCadastro, outra } = await this.contexto(tx, alvo);
        const bloqueio = conferencia.cnpjConfirmado === outra.cnpjDoCadastro ? "cnpj_de_outra_empresa"
          : cnpjDoCadastro && conferencia.cnpjConfirmado !== cnpjDoCadastro ? "cnpj_diferente_do_cadastro" : null;
        if (!bloqueio) continue;
        await tx.omieConexao.update({
          where: { companyId: alvo },
          data: { bloqueio, confirmadaEm: null, confirmadaPorId: null, cnpjConfirmado: null, razaoSocialConfirmada: null },
        });
        await this.registrar(tx, "integracoes.omie.bloqueada", alvo, principal, { motivo: bloqueio, por: "cadastro" });
        bloqueadas.push(alvo);
      }
      return bloqueadas;
    });
  }

  /** Par novo gravado: o teste e a confirmação do par anterior deixam de valer. */
  async reiniciar(empresa: CompanyKey, segredoAtualizadoEm: Date, principal: AuthPrincipal, troca: boolean): Promise<void> {
    const vazio = { segredoAtualizadoEm, ultimoTesteEm: null, ultimoTestePorId: null, ultimoTeste: Prisma.DbNull, bloqueio: null, confirmadaEm: null, confirmadaPorId: null, cnpjConfirmado: null, razaoSocialConfirmada: null };
    await this.prisma.comContexto(async (tx) => {
      await tx.omieConexao.upsert({ where: { companyId: empresa }, create: { companyId: empresa, ...vazio }, update: vazio });
      await this.registrar(tx, "integracoes.omie.conectada", empresa, principal, { troca });
    });
  }

  /**
   * Grava o resultado do teste, decidido aqui com as duas conferências travadas: o
   * CNPJ da outra empresa (cadastrado ou confirmado) é lido no estado de agora. Um
   * teste de um par que foi trocado no meio do caminho não é gravado.
   */
  async registrarTeste(empresa: CompanyKey, versao: Date, empresas: EmpresaDoOmie[], principal: AuthPrincipal, agora: Date): Promise<ResultadoDoTeste> {
    return this.comCnpjUnico(() => this.prisma.comContexto(async (tx) => {
      await this.travar(tx);
      const atual = await tx.omieConexao.findUnique({ where: { companyId: empresa }, select: { segredoAtualizadoEm: true } });
      if (!atual || atual.segredoAtualizadoEm.getTime() !== versao.getTime()) throw new EstadoInvalido(PAR_MUDOU);
      const { cnpjDoCadastro, outra } = await this.contexto(tx, empresa);
      const resultado = avaliarTeste(empresas, cnpjDoCadastro, outra);
      const confirmar = resultado.tipo === "conectada" ? resultado : null;
      await tx.omieConexao.update({
        where: { companyId: empresa },
        data: {
          ultimoTesteEm: agora,
          ultimoTestePorId: principal.id,
          // Só o bastante para mostrar o bloqueio: as duas primeiras e o total.
          ultimoTeste: { empresas: empresas.slice(0, EMPRESAS_GUARDADAS_DO_TESTE), total: empresas.length } as unknown as Prisma.InputJsonValue,
          bloqueio: resultado.tipo === "bloqueada" ? resultado.bloqueio : null,
          confirmadaEm: confirmar ? agora : null,
          confirmadaPorId: confirmar ? principal.id : null,
          cnpjConfirmado: confirmar?.cnpj ?? null,
          razaoSocialConfirmada: confirmar?.razaoSocial ?? null,
        },
      });
      await this.registrar(tx, "integracoes.omie.testada", empresa, principal, {
        resultado: resultado.tipo === "bloqueada" ? resultado.bloqueio : resultado.tipo,
        empresas: empresas.length,
      });
      if (confirmar) {
        await this.registrar(tx, "integracoes.omie.confirmada", empresa, principal, { automatica: true });
        await this.retomarFila(tx, empresa);
      }
      return resultado;
    }));
  }

  /**
   * "É esta a empresa?": reavalia com o estado de agora, com as duas conferências
   * travadas, e só confirma a mesma versão do par e o mesmo teste que a pessoa viu.
   * Se o CNPJ virou o da outra empresa nesse meio-tempo, grava o bloqueio.
   */
  async confirmar(
    empresa: CompanyKey,
    visto: { versao: Date; testeEm: Date; cnpj: string },
    principal: AuthPrincipal,
    agora: Date,
  ): Promise<ResultadoDoTeste> {
    return this.comCnpjUnico(() => this.prisma.comContexto(async (tx) => {
      await this.travar(tx);
      const linha = await tx.omieConexao.findUnique({ where: { companyId: empresa } });
      if (!linha || linha.segredoAtualizadoEm.getTime() !== visto.versao.getTime() || linha.ultimoTesteEm?.getTime() !== visto.testeEm.getTime()
        || linha.confirmadaEm !== null || linha.bloqueio !== null) {
        throw new EstadoInvalido(PAR_MUDOU);
      }
      const testadas = empresasDoTeste(linha.ultimoTeste).empresas;
      if (testadas.length !== 1 || testadas[0]!.cnpj !== visto.cnpj) throw new EstadoInvalido("O CNPJ não é o que o teste trouxe. Teste de novo.");
      const { cnpjDoCadastro, outra } = await this.contexto(tx, empresa);
      const resultado = avaliarTeste(testadas, cnpjDoCadastro, outra);
      const ondeOTesteVisto = { companyId: empresa, segredoAtualizadoEm: visto.versao, ultimoTesteEm: visto.testeEm, confirmadaEm: null };
      const { count } = await tx.omieConexao.updateMany({
        where: ondeOTesteVisto,
        data: resultado.tipo === "bloqueada"
          ? { bloqueio: resultado.bloqueio }
          : { confirmadaEm: agora, confirmadaPorId: principal.id, cnpjConfirmado: visto.cnpj, razaoSocialConfirmada: testadas[0]!.razaoSocial },
      });
      if (count !== 1) throw new EstadoInvalido(PAR_MUDOU);
      if (resultado.tipo === "bloqueada") {
        await this.registrar(tx, "integracoes.omie.bloqueada", empresa, principal, { motivo: resultado.bloqueio, por: "confirmacao" });
      } else {
        await this.registrar(tx, "integracoes.omie.confirmada", empresa, principal, { automatica: false });
        await this.retomarFila(tx, empresa);
      }
      return resultado;
    }));
  }

  /**
   * O par confirmado voltou a funcionar: a fila do OMIE da empresa sai da pausa por
   * credencial recusada, e os envios que falharam por ela voltam à fila (PLU-342).
   */
  private async retomarFila(tx: Prisma.TransactionClient, empresa: CompanyKey): Promise<void> {
    await tx.$queryRaw`SELECT plugga_security.omie_retomar_empresa(${empresa}::text)`;
  }

  /** As duas conferências, na mesma ordem para não haver impasse. */
  private async travar(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT company_id FROM public.omie_conexoes WHERE company_id IN ('plugga', 'waze') ORDER BY company_id FOR UPDATE`;
  }

  private async contexto(tx: Prisma.TransactionClient, empresa: CompanyKey): Promise<{ cnpjDoCadastro: string | null; outra: OutraEmpresa }> {
    const outraId = outraEmpresa(empresa);
    const [cadastros, conferenciaDaOutra] = await Promise.all([
      tx.company.findMany({ where: { id: { in: [empresa, outraId] } }, select: { id: true, cnpj: true } }),
      tx.omieConexao.findUnique({ where: { companyId: outraId }, select: { confirmadaEm: true, cnpjConfirmado: true } }),
    ]);
    const cadastroDe = (id: string) => cadastros.find((c) => c.id === id)?.cnpj ?? null;
    return {
      cnpjDoCadastro: cadastroDe(empresa),
      outra: { cnpjDoCadastro: cadastroDe(outraId), cnpjConfirmado: conferenciaDaOutra?.confirmadaEm ? conferenciaDaOutra.cnpjConfirmado : null },
    };
  }

  /** A última barreira: o índice único de cnpj_confirmado entre as conexões confirmadas. */
  private async comCnpjUnico<T>(fazer: () => Promise<T>): Promise<T> {
    try {
      return await fazer();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new Conflito("Este CNPJ já está confirmado na outra empresa.");
      }
      throw erro;
    }
  }

  async registrarDesconexao(empresa: CompanyKey, principal: AuthPrincipal): Promise<void> {
    await this.prisma.comContexto((tx) => this.registrar(tx, "integracoes.omie.desconectada", empresa, principal, {}));
  }

  async registrarContaAntigaMovida(principal: AuthPrincipal, apagada: boolean): Promise<void> {
    await this.prisma.comContexto((tx) => this.registrar(tx, "integracoes.omie.conta_antiga_movida", "plugga", principal, { apagada }));
  }

  private registrar(tx: Prisma.TransactionClient, eventName: NomeDeEventoDoCatalogo, empresa: CompanyKey, principal: AuthPrincipal, payload: Record<string, unknown>): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType: "integracao_omie",
      entityId: empresa,
      companyId: empresa,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}

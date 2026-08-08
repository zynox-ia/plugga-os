import { Injectable, NotFoundException } from "@nestjs/common";
import {
  energyPremisesSchema,
  invoiceDataSchema,
  type EnergyPremises,
  type EnergyStudyDetail,
  type EnergyStudyListQuery,
  type EnergyStudySummary,
  type ListEnergyStudiesResponse,
  type ProblemaDeValidacao,
} from "@plugga/shared";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  EstudoRepository,
  type AtualizarEstudoInput,
  type CriarEstudoInput,
  type EstudoRegistro,
} from "./estudo.repository.js";

/** Colunas necessárias para montar resumo e detalhe sem segunda consulta. */
const INCLUSAO = {
  client: { select: { name: true } },
  consumerUnit: { select: { code: true } },
  premiseVersion: { select: { versao: true } },
} satisfies Prisma.EnergyEfficiencyStudyInclude;

type LinhaComRelacoes = Prisma.EnergyEfficiencyStudyGetPayload<{ include: typeof INCLUSAO }>;

/**
 * O estudo nasce com `invoiceData` vazio, porque a ficha da fatura só chega
 * depois. Objeto vazio vira null em vez de estourar no schema — o "ainda não
 * informado" é estado legítimo do fluxo, não dado corrompido.
 */
const faturaOuNulo = (bruto: Prisma.JsonValue | null) => {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  if (Object.keys(bruto).length === 0) return null;
  return invoiceDataSchema.parse(bruto);
};

/** Decimal do Prisma vira number; o motor trabalha em ponto flutuante. */
const numeroOuNulo = (valor: Prisma.Decimal | null): number | null =>
  valor === null ? null : Number(valor);

@Injectable()
export class PrismaEstudoRepository extends EstudoRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listar(query?: EnergyStudyListQuery): Promise<ListEnergyStudiesResponse> {
    const linhas = await this.prisma.energyEfficiencyStudy.findMany({
      where: query?.status ? { status: query.status } : {},
      include: INCLUSAO,
      orderBy: [{ competenceYear: "desc" }, { competenceMonth: "desc" }, { createdAt: "desc" }],
    });

    return { items: linhas.map((linha) => this.resumo(linha)) };
  }

  async carregar(id: string): Promise<EstudoRegistro> {
    const linha = await this.buscar(id);

    return {
      id: linha.id,
      clientId: linha.clientId,
      consumerUnitId: linha.consumerUnitId,
      competenceMonth: linha.competenceMonth,
      competenceYear: linha.competenceYear,
      status: linha.status,
      calculationMode: linha.calculationMode,
      premiseVersion: linha.premiseVersion.versao,
      // O snapshot é revalidado na leitura: um estudo antigo cuja forma mudou
      // deve falhar alto, não entrar no motor com campo faltando.
      invoice: faturaOuNulo(linha.invoiceData),
      demandHistory: Array.isArray(linha.demandHistory) ? (linha.demandHistory as number[]) : [],
      hasLoadProfile: linha.calculationMode === "memoria_massa",
      results: (linha.results as Record<string, unknown> | null) ?? null,
      validationIssues: (linha.validationIssues as ProblemaDeValidacao[] | null) ?? null,
      documentHtml: linha.documentHtml,
      approvedById: linha.approvedById,
      approvedAt: linha.approvedAt,
      sentAt: linha.sentAt,
    };
  }

  async detalhar(id: string): Promise<EnergyStudyDetail> {
    const linha = await this.buscar(id);
    const resultados = (linha.results ?? {}) as Record<string, never>;

    return {
      ...this.resumo(linha),
      premiseVersion: linha.premiseVersion.versao,
      invoice: faturaOuNulo(linha.invoiceData),
      demandHistory: Array.isArray(linha.demandHistory) ? (linha.demandHistory as number[]) : [],
      audit: resultados.auditoria ?? null,
      demand: resultados.demanda ?? null,
      sizing: resultados.dimensionamento ?? null,
      savings: resultados.economia ?? null,
      financial: resultados.financeiro ?? null,
      validationIssues: (linha.validationIssues as ProblemaDeValidacao[] | null) ?? null,
      hasDocument: linha.documentHtml !== null,
    };
  }

  async criar(input: CriarEstudoInput): Promise<EnergyStudyDetail> {
    const premissa = await this.prisma.energyPremiseVersion.findUniqueOrThrow({
      where: { versao: input.premiseVersion },
      select: { id: true },
    });

    const criado = await this.prisma.energyEfficiencyStudy.create({
      data: {
        clientId: input.clientId,
        consumerUnitId: input.consumerUnitId,
        competenceMonth: input.competenceMonth,
        competenceYear: input.competenceYear,
        calculationMode: input.calculationMode,
        premiseVersionId: premissa.id,
        createdById: input.createdById,
        ownerId: input.createdById,
        invoiceData: {},
      },
      select: { id: true },
    });

    return this.detalhar(criado.id);
  }

  async atualizar(id: string, input: AtualizarEstudoInput): Promise<EnergyStudyDetail> {
    await this.prisma.energyEfficiencyStudy.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.invoice !== undefined ? { invoiceData: input.invoice } : {}),
        ...(input.demandHistory !== undefined ? { demandHistory: input.demandHistory } : {}),
        ...(input.results !== undefined
          ? { results: (input.results ?? Prisma.JsonNull) as Prisma.InputJsonValue }
          : {}),
        ...(input.validationIssues !== undefined
          ? {
              validationIssues: (input.validationIssues ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.documentHtml !== undefined ? { documentHtml: input.documentHtml } : {}),
        ...(input.economiaMensal !== undefined ? { economiaMensal: input.economiaMensal } : {}),
        ...(input.capexTotal !== undefined ? { capexTotal: input.capexTotal } : {}),
        ...(input.approvedById !== undefined ? { approvedById: input.approvedById } : {}),
        ...(input.approvedAt !== undefined ? { approvedAt: input.approvedAt } : {}),
        ...(input.approvalNote !== undefined ? { approvalNote: input.approvalNote } : {}),
        ...(input.sentAt !== undefined ? { sentAt: input.sentAt } : {}),
      },
    });

    return this.detalhar(id);
  }

  async documento(id: string): Promise<string> {
    const linha = await this.prisma.energyEfficiencyStudy.findUnique({
      where: { id },
      select: { documentHtml: true },
    });

    if (!linha) throw new NotFoundException(`estudo ${id} não encontrado`);
    if (!linha.documentHtml) {
      throw new NotFoundException("estudo ainda não tem documento gerado ou está bloqueado");
    }
    return linha.documentHtml;
  }

  /**
   * Premissa vigente é a mais recente cuja vigência já começou — nunca uma
   * futura. Assim é possível cadastrar a próxima versão com antecedência sem
   * afetar estudo aberto hoje.
   */
  async premissasVigentes(em: Date): Promise<EnergyPremises> {
    const linha = await this.prisma.energyPremiseVersion.findFirst({
      where: { vigenteDe: { lte: em } },
      orderBy: { vigenteDe: "desc" },
    });

    if (!linha) {
      throw new NotFoundException(
        "nenhuma versão de premissas vigente: cadastre as premissas antes de abrir estudo",
      );
    }
    return this.paraPremissas(linha);
  }

  async premissasPorVersao(versao: string): Promise<EnergyPremises> {
    const linha = await this.prisma.energyPremiseVersion.findUnique({ where: { versao } });
    if (!linha) throw new NotFoundException(`versão de premissas ${versao} não encontrada`);
    return this.paraPremissas(linha);
  }

  private async buscar(id: string): Promise<LinhaComRelacoes> {
    const linha = await this.prisma.energyEfficiencyStudy.findUnique({
      where: { id },
      include: INCLUSAO,
    });
    if (!linha) throw new NotFoundException(`estudo ${id} não encontrado`);
    return linha;
  }

  private resumo(linha: LinhaComRelacoes): EnergyStudySummary {
    return {
      id: linha.id,
      clientId: linha.clientId,
      clientName: linha.client.name,
      consumerUnitId: linha.consumerUnitId,
      consumerUnitCode: linha.consumerUnit.code,
      competenceMonth: linha.competenceMonth,
      competenceYear: linha.competenceYear,
      status: linha.status,
      calculationMode: linha.calculationMode,
      economiaMensal: numeroOuNulo(linha.economiaMensal),
      capexTotal: numeroOuNulo(linha.capexTotal),
      version: linha.version,
      revision: linha.revision,
      approvedAt: linha.approvedAt?.toISOString() ?? null,
      sentAt: linha.sentAt?.toISOString() ?? null,
      createdAt: linha.createdAt.toISOString(),
    };
  }

  private paraPremissas(linha: {
    versao: string;
    vigenteDe: Date;
    bessModelo: string;
    bessCapacidadeNominalKwh: Prisma.Decimal;
    bessCapacidadeUtilKwh: Prisma.Decimal;
    bessPotenciaKw: Prisma.Decimal;
    bessEficienciaCiclo: Prisma.Decimal;
    bessCapexPorUnidade: Prisma.Decimal;
    fvCapexPorKwp: Prisma.Decimal;
    fvProdutividadeKwhPorKwpMes: Prisma.Decimal;
    fvPercentualAtendimento: Prisma.Decimal;
    horizonteAnos: number;
    tmaAnual: Prisma.Decimal;
    reajusteTarifarioAnual: Prisma.Decimal;
    toleranciaUltrapassagem: Prisma.Decimal;
    alteracaoDemandaMinima: Prisma.Decimal;
    alteracaoDemandaMaxima: Prisma.Decimal;
  }): EnergyPremises {
    return energyPremisesSchema.parse({
      versao: linha.versao,
      vigenteDe: linha.vigenteDe.toISOString(),
      bessModelo: linha.bessModelo,
      bessCapacidadeNominalKwh: Number(linha.bessCapacidadeNominalKwh),
      bessCapacidadeUtilKwh: Number(linha.bessCapacidadeUtilKwh),
      bessPotenciaKw: Number(linha.bessPotenciaKw),
      bessEficienciaCiclo: Number(linha.bessEficienciaCiclo),
      bessCapexPorUnidade: Number(linha.bessCapexPorUnidade),
      fvCapexPorKwp: Number(linha.fvCapexPorKwp),
      fvProdutividadeKwhPorKwpMes: Number(linha.fvProdutividadeKwhPorKwpMes),
      fvPercentualAtendimento: Number(linha.fvPercentualAtendimento),
      horizonteAnos: linha.horizonteAnos,
      tmaAnual: Number(linha.tmaAnual),
      reajusteTarifarioAnual: Number(linha.reajusteTarifarioAnual),
      toleranciaUltrapassagem: Number(linha.toleranciaUltrapassagem),
      alteracaoDemandaMinima: Number(linha.alteracaoDemandaMinima),
      alteracaoDemandaMaxima: Number(linha.alteracaoDemandaMaxima),
    });
  }
}

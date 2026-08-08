import type {
  CalculationMode,
  EnergyPremises,
  EnergyStudyDetail,
  EnergyStudyListQuery,
  EnergyStudyStatus,
  InvoiceData,
  ListEnergyStudiesResponse,
  ProblemaDeValidacao,
} from "@plugga/shared";

/**
 * Contrato de persistência do estudo. O serviço nunca fala com o Prisma direto,
 * o que permite exercitar todo o fluxo de estados em memória — importante aqui,
 * porque o banco de desenvolvimento é o de produção e um teste de integração
 * escreveria nele.
 */

export type EstudoRegistro = {
  id: string;
  clientId: string;
  consumerUnitId: string;
  competenceMonth: number;
  competenceYear: number;
  status: EnergyStudyStatus;
  calculationMode: CalculationMode;
  premiseVersion: string;
  invoice: InvoiceData | null;
  demandHistory: number[];
  hasLoadProfile: boolean;
  results: EnergyStudyDetail["audit"] extends never ? never : Record<string, unknown> | null;
  validationIssues: ProblemaDeValidacao[] | null;
  documentHtml: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  sentAt: Date | null;
};

export type CriarEstudoInput = {
  clientId: string;
  consumerUnitId: string;
  competenceMonth: number;
  competenceYear: number;
  calculationMode: CalculationMode;
  premiseVersion: string;
  createdById: string | null;
};

export type AtualizarEstudoInput = {
  status?: EnergyStudyStatus;
  invoice?: InvoiceData;
  demandHistory?: number[];
  results?: Record<string, unknown> | null;
  validationIssues?: ProblemaDeValidacao[] | null;
  documentHtml?: string | null;
  economiaMensal?: number | null;
  capexTotal?: number | null;
  approvedById?: string | null;
  approvedAt?: Date | null;
  approvalNote?: string | null;
  sentAt?: Date | null;
};

export abstract class EstudoRepository {
  abstract listar(query?: EnergyStudyListQuery): Promise<ListEnergyStudiesResponse>;
  abstract detalhar(id: string): Promise<EnergyStudyDetail>;
  /** Estado bruto para o serviço decidir a transição; não é resposta HTTP. */
  abstract carregar(id: string): Promise<EstudoRegistro>;
  abstract criar(input: CriarEstudoInput): Promise<EnergyStudyDetail>;
  abstract atualizar(id: string, input: AtualizarEstudoInput): Promise<EnergyStudyDetail>;
  abstract documento(id: string): Promise<string>;
  /** Premissas vigentes na data — o estudo guarda qual versão usou. */
  abstract premissasVigentes(em: Date): Promise<EnergyPremises>;
  abstract premissasPorVersao(versao: string): Promise<EnergyPremises>;
}

import type {
  CalculationMode,
  EnergyPremises,
  EnergyTrafficLight,
  EnergyStudyDetail,
  EnergyStudyListQuery,
  EnergyStudyStatus,
  InvoiceData,
  InvoiceContext,
  ListEnergyStudiesResponse,
  ProblemaDeValidacao,
  ReconciliationProof,
  TrafficLightResult,
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
  invoiceContext: InvoiceContext | null;
  reconciliationProof: ReconciliationProof | null;
  demandHistory: number[];
  hasLoadProfile: boolean;
  results: EnergyStudyDetail["audit"] extends never ? never : Record<string, unknown> | null;
  validationIssues: ProblemaDeValidacao[] | null;
  documentHtml: string | null;
  documentHtmlMobile: string | null;
  trafficLight: EnergyTrafficLight | null;
  trafficLightResult: TrafficLightResult | null;
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
  calculationMode?: CalculationMode;
  invoice?: InvoiceData;
  invoiceContext?: InvoiceContext;
  reconciliationProof?: ReconciliationProof | null;
  demandHistory?: number[];
  results?: Record<string, unknown> | null;
  validationIssues?: ProblemaDeValidacao[] | null;
  documentHtml?: string | null;
  documentHtmlMobile?: string | null;
  documentHash?: string | null;
  documentMobileHash?: string | null;
  trafficLight?: EnergyTrafficLight | null;
  trafficLightResult?: TrafficLightResult | null;
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
  abstract documento(id: string, versao?: "desktop" | "celular"): Promise<string>;
  abstract tipoConhecido(chave: string): Promise<boolean>;
  abstract aprovarTipo(input: {
    chave: string;
    contexto: InvoiceContext;
    exemploUc: string;
    aprovadoPorId: string;
    aprovadoEm: Date;
  }): Promise<void>;
  /** Premissas vigentes na data — o estudo guarda qual versão usou. */
  abstract premissasVigentes(em: Date): Promise<EnergyPremises>;
  abstract premissasPorVersao(versao: string): Promise<EnergyPremises>;
}

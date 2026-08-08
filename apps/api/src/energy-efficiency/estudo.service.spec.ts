import { ConflictException } from "@nestjs/common";
import {
  PREMISSAS_2026_08,
  type EnergyPremises,
  type EnergyStudyDetail,
  type EnergyStudyListQuery,
  type InvoiceData,
  type ListEnergyStudiesResponse,
  type ProblemaDeValidacao,
} from "@plugga/shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthPrincipal } from "../core/auth/auth.types";
import {
  EstudoRepository,
  type AtualizarEstudoInput,
  type CriarEstudoInput,
  type EstudoRegistro,
} from "./estudo.repository.js";
import { EstudoService } from "./estudo.service.js";

/** A M Química — cenário cativo estimado, 06/2026. */
const FATURA: InvoiceData = {
  consumoPontaKwh: 4_275,
  consumoForaPontaKwh: 126_050,
  tarifaPonta: 1.82396,
  tarifaForaPonta: 0.53899,
  valorPonta: 7_797.43,
  valorForaPonta: 67_939.69,
  valorDemanda: 15_827.0,
  valorTotal: 100_881.25,
  demandaContratadaKw: 700,
  demandaMedidaPontaKw: 249,
  demandaMedidaForaPontaKw: 586,
  tarifaDemanda: 22.61,
  valorReativo: 571.22,
  valorBeneficioFiscal: 0,
  valorMultasJurosEncargos: 0,
};

const ADMIN: AuthPrincipal = { id: "11111111-1111-4111-8111-111111111111", kind: "user", roles: ["admin"] };
const AGENTE: AuthPrincipal = { id: "openclaw", kind: "service", roles: ["tech"] };

/**
 * Dublê em memória com exatamente as mesmas regras do repositório real. O banco
 * de desenvolvimento aponta para produção, então exercitar o fluxo aqui é a
 * única forma de testar a máquina de estados sem escrever em dado de cliente.
 */
class RepositorioEmMemoria extends EstudoRepository {
  private readonly registros = new Map<string, EstudoRegistro>();
  private sequencia = 0;

  async listar(query?: EnergyStudyListQuery): Promise<ListEnergyStudiesResponse> {
    const items = [...this.registros.values()]
      .filter((r) => !query?.status || r.status === query.status)
      .map((r) => this.resumo(r));
    return { items };
  }

  async carregar(id: string): Promise<EstudoRegistro> {
    const registro = this.registros.get(id);
    if (!registro) throw new Error(`estudo ${id} não encontrado`);
    return registro;
  }

  async detalhar(id: string): Promise<EnergyStudyDetail> {
    const r = await this.carregar(id);
    const results = (r.results ?? {}) as Record<string, never>;
    return {
      ...this.resumo(r),
      premiseVersion: r.premiseVersion,
      invoice: r.invoice,
      demandHistory: r.demandHistory,
      audit: results.auditoria ?? null,
      demand: results.demanda ?? null,
      sizing: results.dimensionamento ?? null,
      savings: results.economia ?? null,
      financial: results.financeiro ?? null,
      validationIssues: r.validationIssues,
      hasDocument: r.documentHtml !== null,
    };
  }

  async criar(input: CriarEstudoInput): Promise<EnergyStudyDetail> {
    this.sequencia += 1;
    const id = `estudo-${this.sequencia}`;
    this.registros.set(id, {
      id,
      clientId: input.clientId,
      consumerUnitId: input.consumerUnitId,
      competenceMonth: input.competenceMonth,
      competenceYear: input.competenceYear,
      status: "rascunho",
      calculationMode: input.calculationMode,
      premiseVersion: input.premiseVersion,
      invoice: null,
      demandHistory: [],
      hasLoadProfile: false,
      results: null,
      validationIssues: null,
      documentHtml: null,
      approvedById: null,
      approvedAt: null,
      sentAt: null,
    });
    return this.detalhar(id);
  }

  async atualizar(id: string, input: AtualizarEstudoInput): Promise<EnergyStudyDetail> {
    const r = await this.carregar(id);
    this.registros.set(id, {
      ...r,
      status: input.status ?? r.status,
      invoice: input.invoice ?? r.invoice,
      demandHistory: input.demandHistory ?? r.demandHistory,
      results: input.results !== undefined ? input.results : r.results,
      validationIssues:
        input.validationIssues !== undefined ? input.validationIssues : r.validationIssues,
      documentHtml: input.documentHtml !== undefined ? input.documentHtml : r.documentHtml,
      approvedById: input.approvedById !== undefined ? input.approvedById : r.approvedById,
      approvedAt: input.approvedAt !== undefined ? input.approvedAt : r.approvedAt,
      sentAt: input.sentAt !== undefined ? input.sentAt : r.sentAt,
    });
    return this.detalhar(id);
  }

  async documento(id: string): Promise<string> {
    const r = await this.carregar(id);
    if (!r.documentHtml) throw new Error("estudo sem documento gerado");
    return r.documentHtml;
  }

  async premissasVigentes(): Promise<EnergyPremises> {
    return PREMISSAS_2026_08;
  }

  async premissasPorVersao(): Promise<EnergyPremises> {
    return PREMISSAS_2026_08;
  }

  private resumo(r: EstudoRegistro) {
    return {
      id: r.id,
      clientId: r.clientId,
      clientName: "A M QUIMICA INDUSTRIA E COMERCIO DE PRODUTOS QUIMICOS LTDA",
      consumerUnitId: r.consumerUnitId,
      consumerUnitCode: "0000033531002-19",
      competenceMonth: r.competenceMonth,
      competenceYear: r.competenceYear,
      status: r.status,
      calculationMode: r.calculationMode,
      economiaMensal: null,
      capexTotal: null,
      version: 1,
      revision: 0,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      createdAt: new Date("2026-08-08T00:00:00.000Z").toISOString(),
    };
  }

  /** Só para teste: força problemas de validação num estudo. */
  forcarProblemas(id: string, problemas: ProblemaDeValidacao[]): void {
    const r = this.registros.get(id);
    if (r) this.registros.set(id, { ...r, validationIssues: problemas, status: "bloqueado" });
  }
}

const UUID_CLIENTE = "22222222-2222-4222-8222-222222222222";
const UUID_UC = "33333333-3333-4333-8333-333333333333";
const AGORA = new Date("2026-08-08T12:00:00.000Z");

describe("EstudoService — fluxo completo", () => {
  let repositorio: RepositorioEmMemoria;
  let service: EstudoService;

  beforeEach(() => {
    repositorio = new RepositorioEmMemoria();
    service = new EstudoService(repositorio);
  });

  const criar = () =>
    service.criar(
      {
        clientId: UUID_CLIENTE,
        consumerUnitId: UUID_UC,
        competenceMonth: 6,
        competenceYear: 2026,
        calculationMode: "preliminar",
      },
      ADMIN,
      AGORA,
    );

  it("nasce aguardando dados e fixa a versão de premissas", async () => {
    const estudo = await criar();

    expect(estudo.status).toBe("aguardando_dados");
    expect(estudo.premiseVersion).toBe("2026-08-08");
    expect(estudo.invoice).toBeNull();
  });

  it("recebe a fatura, calcula e chega a em_validacao com documento", async () => {
    const criado = await criar();
    const estudo = await service.receberFatura(criado.id, {
      invoice: FATURA,
      demandHistory: [634, 704, 705, 698, 668, 586],
      hasLoadProfile: false,
    });

    expect(estudo.status).toBe("em_validacao");
    expect(estudo.validationIssues).toBeNull();
    expect(estudo.hasDocument).toBe(true);
    // Os números do motor ficam gravados, não recalculados a cada leitura.
    expect(estudo.savings?.economiaMensal).toBeGreaterThan(0);
    expect(estudo.financial?.capexTotal).toBe(3_155_000);
    expect(estudo.demand?.preliminar).toBe(true);
  });

  it("percorre aprovação e envio", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, { invoice: FATURA, demandHistory: [], hasLoadProfile: false });

    const aprovado = await service.aprovar(criado.id, { note: "conferido" }, ADMIN, AGORA);
    expect(aprovado.status).toBe("aprovado_internamente");
    expect(aprovado.approvedAt).not.toBeNull();

    const enviado = await service.marcarEnviado(criado.id, AGORA);
    expect(enviado.status).toBe("enviado_cliente");
    expect(enviado.sentAt).not.toBeNull();
  });

  /**
   * A trava central: o estudo não avança com problema de validação em aberto.
   * No fluxo do agente isso depende de alguém lembrar de conferir.
   */
  it("recusa aprovar estudo bloqueado por validação", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, { invoice: FATURA, demandHistory: [], hasLoadProfile: false });
    repositorio.forcarProblemas(criado.id, [{ regra: "termo_interno", detalhe: "all-in" }]);

    await expect(service.aprovar(criado.id, {}, ADMIN, AGORA)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("recusa enviar sem aprovação humana registrada", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, { invoice: FATURA, demandHistory: [], hasLoadProfile: false });

    // Em `em_validacao` o envio nem é transição válida — e mesmo que fosse,
    // faltaria o aprovador.
    await expect(service.marcarEnviado(criado.id, AGORA)).rejects.toBeInstanceOf(ConflictException);
  });

  it("principal de serviço não vira aprovador humano", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, { invoice: FATURA, demandHistory: [], hasLoadProfile: false });
    await service.aprovar(criado.id, {}, AGENTE, AGORA);

    // O agente pode operar, mas a assinatura de aprovação fica vazia — então o
    // envio continua barrado até uma pessoa aprovar.
    await expect(service.marcarEnviado(criado.id, AGORA)).rejects.toBeInstanceOf(ConflictException);
  });

  it("recusa calcular sem ficha de fatura", async () => {
    const criado = await criar();
    await expect(service.calcular(criado.id)).rejects.toThrow(/sem ficha de fatura/);
  });

  it("recusa competência no futuro", async () => {
    await expect(
      service.criar(
        {
          clientId: UUID_CLIENTE,
          consumerUnitId: UUID_UC,
          competenceMonth: 12,
          competenceYear: 2026,
          calculationMode: "preliminar",
        },
        ADMIN,
        AGORA,
      ),
    ).rejects.toThrow(/competência no futuro/);
  });

  it("filtra a listagem por estado", async () => {
    const a = await criar();
    await service.receberFatura(a.id, { invoice: FATURA, demandHistory: [], hasLoadProfile: false });
    await criar();

    expect((await service.listar({ status: "em_validacao" })).items).toHaveLength(1);
    expect((await service.listar({ status: "aguardando_dados" })).items).toHaveLength(1);
    expect((await service.listar()).items).toHaveLength(2);
  });
});

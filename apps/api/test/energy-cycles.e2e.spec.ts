import { BadRequestException, NotFoundException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ApproveCycleReportRequest,
  CloseCycleRequest,
  CreateCycleRequest,
  CycleDetail,
  CycleListQuery,
  CycleReportsQuery,
  CycleReportsResponse,
  GenerateCycleReportRequest,
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
  MarkCycleDocumentsReceivedRequest,
  SendCycleReportRequest,
} from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { EnergyRepository } from "../src/energy/energy.repository";
import { computeCycleCloseBlockers } from "../src/energy/energy.rules";

const CLIENT_ID = "00000000-0000-4000-8000-000000000501";
const CONSUMER_UNIT_ID = "00000000-0000-4000-8000-000000000502";
const OTHER_CONSUMER_UNIT_ID = "00000000-0000-4000-8000-000000000503";
const OWNER_ID = "00000000-0000-4000-8000-000000000504";

type RecordedEvent = { eventName: string; entityId: string; actorId: string };

/**
 * In-memory double implementing the same abstract EnergyRepository the real
 * Prisma adapter implements (same pattern as commercial.e2e.spec.ts), so
 * this suite exercises real HTTP + RBAC + Zod validation without a live
 * Postgres. It reuses energy.rules.ts's computeCycleCloseBlockers rather
 * than reimplementing the close rule, so this double can't drift from
 * production behavior.
 */
class InMemoryEnergyRepository extends EnergyRepository {
  private cycles = new Map<string, CycleDetail>();
  private auditsByCycle = new Map<string, { status: string; divergenceBlocksClosing: boolean }[]>();
  private sequence = 0;
  readonly events: RecordedEvent[] = [];

  private nextId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-0000006${String(this.sequence).padStart(5, "0")}`;
  }

  private record(eventName: string, entityId: string, principal: AuthPrincipal) {
    this.events.push({ eventName, entityId, actorId: principal.id });
  }

  seedAuditsForCycle(cycleId: string, audits: { status: string; divergenceBlocksClosing: boolean }[]) {
    this.auditsByCycle.set(cycleId, audits);
  }

  private closeBlockers(cycle: CycleDetail): string[] {
    return computeCycleCloseBlockers({
      status: cycle.status as never,
      reportStatus: cycle.reportStatus as never,
      reportSentAt: cycle.reportSentAt ? new Date(cycle.reportSentAt) : null,
      audits: (this.auditsByCycle.get(cycle.id) ?? []).map((a) => ({
        status: a.status as never,
        divergenceBlocksClosing: a.divergenceBlocksClosing,
      })),
    });
  }

  private withBlockers(cycle: CycleDetail): CycleDetail {
    return { ...cycle, closeBlockers: cycle.status === "fechado" ? [] : this.closeBlockers(cycle) };
  }

  async listConsumerUnits(): Promise<ListConsumerUnitsResponse> {
    return { items: [] };
  }

  async listMarketMigrations(): Promise<ListMarketMigrationsResponse> {
    return { items: [] };
  }

  async listCycles(query?: CycleListQuery): Promise<ListCyclesResponse> {
    const items = [...this.cycles.values()].filter(
      (c) =>
        (!query?.clientId || c.clientId === query.clientId) &&
        (!query?.consumerUnitId || c.consumerUnitId === query.consumerUnitId) &&
        (!query?.status || c.status === query.status) &&
        (!query?.competenceMonth || c.competenceMonth === query.competenceMonth) &&
        (!query?.competenceYear || c.competenceYear === query.competenceYear),
    );
    return { items };
  }

  async cycle(id: string): Promise<CycleDetail> {
    const found = this.cycles.get(id);
    if (!found) throw new NotFoundException("cycle not found");
    return this.withBlockers(found);
  }

  async createCycle(input: CreateCycleRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    const duplicate = [...this.cycles.values()].find(
      (c) =>
        c.consumerUnitId === input.consumerUnitId &&
        c.competenceMonth === input.competenceMonth &&
        c.competenceYear === input.competenceYear,
    );
    if (duplicate) {
      throw new BadRequestException(
        `já existe um ciclo para esta UC em ${input.competenceMonth}/${input.competenceYear}`,
      );
    }

    const id = this.nextId();
    const now = new Date().toISOString();
    const cycle: CycleDetail = {
      id,
      clientId: input.clientId,
      clientName: "Cliente Teste",
      consumerUnitId: input.consumerUnitId,
      consumerUnitCode: "UC-TESTE",
      marketMigrationId: null,
      competenceMonth: input.competenceMonth,
      competenceYear: input.competenceYear,
      status: "aguardando_documentos",
      ownerId: input.ownerId,
      ownerName: "Responsável",
      nextActionAt: input.nextActionAt,
      nextActionNote: input.nextActionNote ?? null,
      reportStatus: "nao_gerado",
      reportVersion: 0,
      reportGeneratedAt: null,
      reportApprovedAt: null,
      reportApprovedById: null,
      reportSentAt: null,
      reportFileId: null,
      estimatedSavings: null,
      realizedSavings: null,
      createdAt: now,
      updatedAt: now,
      audits: [],
      closeBlockers: [],
    };
    this.cycles.set(id, cycle);
    this.record("energy.cycle_opened", id, principal);
    return this.cycle(id);
  }

  async markCycleDocumentsReceived(
    id: string,
    _input: MarkCycleDocumentsReceivedRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    const current = await this.cycle(id);
    if (current.status !== "aguardando_documentos") {
      throw new BadRequestException("ciclo já passou da etapa de recebimento de documentos");
    }
    this.cycles.set(id, { ...current, status: "documentos_recebidos" });
    this.record("energy.cycle_documents_received", id, principal);
    return this.cycle(id);
  }

  async generateCycleReport(
    id: string,
    input: GenerateCycleReportRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    const current = await this.cycle(id);
    if (current.status === "aguardando_documentos") {
      throw new BadRequestException("não é possível gerar relatório antes de receber os documentos");
    }
    const advance = current.status === "documentos_recebidos" || current.status === "em_auditoria";
    this.cycles.set(id, {
      ...current,
      status: advance ? "relatorio_pronto" : current.status,
      reportVersion: current.reportVersion + 1,
      reportStatus: current.reportSentAt ? "reenviado_apos_correcao" : "gerado",
      reportGeneratedAt: new Date().toISOString(),
      reportApprovedAt: null,
      reportApprovedById: null,
      estimatedSavings: input.estimatedSavings ?? current.estimatedSavings,
    });
    this.record("energy.cycle_report_generated", id, principal);
    return this.cycle(id);
  }

  async approveCycleReport(
    id: string,
    _input: ApproveCycleReportRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    const current = await this.cycle(id);
    if (current.reportVersion === 0) {
      throw new BadRequestException("nenhum relatório foi gerado para este ciclo ainda");
    }
    this.cycles.set(id, {
      ...current,
      status: current.status === "relatorio_pronto" ? "validado_internamente" : current.status,
      reportStatus: "aprovado",
      reportApprovedAt: new Date().toISOString(),
      reportApprovedById: principal.id,
    });
    this.record("energy.cycle_report_approved", id, principal);
    return this.cycle(id);
  }

  async sendCycleReport(id: string, input: SendCycleReportRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    const current = await this.cycle(id);
    if (current.reportStatus !== "aprovado") {
      throw new BadRequestException("relatório precisa estar aprovado internamente antes do envio");
    }
    this.cycles.set(id, {
      ...current,
      status: current.status === "validado_internamente" ? "enviado" : current.status,
      reportSentAt: current.reportSentAt ?? new Date().toISOString(),
      realizedSavings: input.realizedSavings ?? current.realizedSavings,
    });
    this.record("energy.cycle_report_sent", id, principal);
    return this.cycle(id);
  }

  async closeCycle(id: string, _input: CloseCycleRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    const current = await this.cycle(id);
    const blockers = this.closeBlockers(current);
    if (blockers.length > 0) {
      throw new BadRequestException(`ciclo não pode ser fechado: ${blockers[0]}`);
    }
    this.cycles.set(id, { ...current, status: "fechado" });
    this.record("energy.cycle_closed", id, principal);
    return this.cycle(id);
  }

  async cycleReports(query: CycleReportsQuery): Promise<CycleReportsResponse> {
    const { items } = await this.listCycles(query);
    const estimatedSavings = items.reduce((sum, c) => sum + Number(c.estimatedSavings ?? 0), 0);
    const realizedSavings = items.reduce((sum, c) => sum + Number(c.realizedSavings ?? 0), 0);
    return {
      items,
      totals: { count: items.length, estimatedSavings: estimatedSavings.toFixed(2), realizedSavings: realizedSavings.toFixed(2) },
    };
  }

  async listAudits(): Promise<ListAuditsResponse> {
    return { items: [] };
  }

  async listContestations(): Promise<ListContestationsResponse> {
    return { items: [] };
  }
}

describe("energy cycles API (e2e)", () => {
  let app: INestApplication;
  let repository: InMemoryEnergyRepository;

  beforeAll(async () => {
    repository = new InMemoryEnergyRepository();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EnergyRepository)
      .useValue(repository)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function asOpm() {
    return {
      get: (path: string) => request(app.getHttpServer()).get(path).set("x-dev-principal", "local-opm").set("x-dev-roles", "opm"),
      post: (path: string) => request(app.getHttpServer()).post(path).set("x-dev-principal", "local-opm").set("x-dev-roles", "opm"),
    };
  }

  function asFinanceiro() {
    return {
      post: (path: string) =>
        request(app.getHttpServer()).post(path).set("x-dev-principal", "local-financeiro").set("x-dev-roles", "financeiro"),
    };
  }

  function asViewer() {
    return {
      get: (path: string) => request(app.getHttpServer()).get(path).set("x-dev-principal", "local-viewer").set("x-dev-roles", "viewer"),
      post: (path: string) => request(app.getHttpServer()).post(path).set("x-dev-principal", "local-viewer").set("x-dev-roles", "viewer"),
    };
  }

  async function openReadyToCloseCycle(month: number, year: number): Promise<string> {
    const created = await asOpm()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: CONSUMER_UNIT_ID,
        competenceMonth: month,
        competenceYear: year,
        ownerId: OWNER_ID,
        nextActionAt: "2026-08-10T12:00:00.000Z",
      })
      .expect(201);
    const id = created.body.id as string;
    await asOpm().post(`/energy/cycles/${id}/documents-received`).send({}).expect(200);
    repository.seedAuditsForCycle(id, [{ status: "sem_divergencia", divergenceBlocksClosing: false }]);
    await asOpm().post(`/energy/cycles/${id}/report`).send({}).expect(200);
    await asFinanceiro().post(`/energy/cycles/${id}/approve-report`).send({}).expect(200);
    await asOpm().post(`/energy/cycles/${id}/send`).send({}).expect(200);
    return id;
  }

  it("requires authentication to read cycles", async () => {
    await request(app.getHttpServer()).get("/energy/cycles").expect(401);
  });

  it("allows a broad read role to list cycles but not open one", async () => {
    await asViewer().get("/energy/cycles").expect(200);
    await asViewer()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: CONSUMER_UNIT_ID,
        competenceMonth: 1,
        competenceYear: 2027,
        ownerId: OWNER_ID,
        nextActionAt: "2027-01-10T12:00:00.000Z",
      })
      .expect(403);
  });

  it("rejects a second cycle for the same UC/competence (uniqueness)", async () => {
    await asOpm()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: OTHER_CONSUMER_UNIT_ID,
        competenceMonth: 2,
        competenceYear: 2027,
        ownerId: OWNER_ID,
        nextActionAt: "2027-02-10T12:00:00.000Z",
      })
      .expect(201);

    await asOpm()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: OTHER_CONSUMER_UNIT_ID,
        competenceMonth: 2,
        competenceYear: 2027,
        ownerId: OWNER_ID,
        nextActionAt: "2027-02-11T12:00:00.000Z",
      })
      .expect(400);
  });

  it("blocks closing when documents were never received", async () => {
    const created = await asOpm()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: CONSUMER_UNIT_ID,
        competenceMonth: 3,
        competenceYear: 2027,
        ownerId: OWNER_ID,
        nextActionAt: "2027-03-10T12:00:00.000Z",
      })
      .expect(201);

    const response = await asFinanceiro().post(`/energy/cycles/${created.body.id}/close`).send({}).expect(400);
    expect(response.body.message).toContain("fatura da distribuidora não recebida");
  });

  it("blocks closing when the audit is still open", async () => {
    const id = await (async () => {
      const created = await asOpm()
        .post("/energy/cycles")
        .send({
          clientId: CLIENT_ID,
          consumerUnitId: CONSUMER_UNIT_ID,
          competenceMonth: 4,
          competenceYear: 2027,
          ownerId: OWNER_ID,
          nextActionAt: "2027-04-10T12:00:00.000Z",
        })
        .expect(201);
      await asOpm().post(`/energy/cycles/${created.body.id}/documents-received`).send({}).expect(200);
      return created.body.id as string;
    })();

    repository.seedAuditsForCycle(id, [{ status: "em_analise", divergenceBlocksClosing: false }]);

    const response = await asFinanceiro().post(`/energy/cycles/${id}/close`).send({}).expect(400);
    expect(response.body.message).toContain("auditoria não concluída");
  });

  it("blocks closing when a divergence that blocks closing is unresolved", async () => {
    const created = await asOpm()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: CONSUMER_UNIT_ID,
        competenceMonth: 5,
        competenceYear: 2027,
        ownerId: OWNER_ID,
        nextActionAt: "2027-05-10T12:00:00.000Z",
      })
      .expect(201);
    const id = created.body.id as string;
    await asOpm().post(`/energy/cycles/${id}/documents-received`).send({}).expect(200);
    repository.seedAuditsForCycle(id, [{ status: "divergencia_encontrada", divergenceBlocksClosing: true }]);

    await asFinanceiro().post(`/energy/cycles/${id}/close`).send({}).expect(400);
    const detail = await asOpm().get(`/energy/cycles/${id}`).expect(200);
    expect(detail.body.closeBlockers).toContain("divergência encontrada impede o fechamento sem resolução");
  });

  it("blocks closing when the report is not approved", async () => {
    const created = await asOpm()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: CONSUMER_UNIT_ID,
        competenceMonth: 6,
        competenceYear: 2027,
        ownerId: OWNER_ID,
        nextActionAt: "2027-06-10T12:00:00.000Z",
      })
      .expect(201);
    const id = created.body.id as string;
    await asOpm().post(`/energy/cycles/${id}/documents-received`).send({}).expect(200);
    repository.seedAuditsForCycle(id, [{ status: "sem_divergencia", divergenceBlocksClosing: false }]);
    await asOpm().post(`/energy/cycles/${id}/report`).send({}).expect(200);

    const response = await asFinanceiro().post(`/energy/cycles/${id}/close`).send({}).expect(400);
    expect(response.body.message).toContain("relatório de economia não aprovado");
  });

  it("blocks closing when the report was never sent", async () => {
    const created = await asOpm()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: CONSUMER_UNIT_ID,
        competenceMonth: 7,
        competenceYear: 2027,
        ownerId: OWNER_ID,
        nextActionAt: "2027-07-10T12:00:00.000Z",
      })
      .expect(201);
    const id = created.body.id as string;
    await asOpm().post(`/energy/cycles/${id}/documents-received`).send({}).expect(200);
    repository.seedAuditsForCycle(id, [{ status: "sem_divergencia", divergenceBlocksClosing: false }]);
    await asOpm().post(`/energy/cycles/${id}/report`).send({}).expect(200);
    await asFinanceiro().post(`/energy/cycles/${id}/approve-report`).send({}).expect(200);

    const response = await asFinanceiro().post(`/energy/cycles/${id}/close`).send({}).expect(400);
    expect(response.body.message).toContain("relatório ainda não foi enviado");
  });

  it("closes even when a divergence exists but does not block closing", async () => {
    const created = await asOpm()
      .post("/energy/cycles")
      .send({
        clientId: CLIENT_ID,
        consumerUnitId: CONSUMER_UNIT_ID,
        competenceMonth: 8,
        competenceYear: 2027,
        ownerId: OWNER_ID,
        nextActionAt: "2027-08-10T12:00:00.000Z",
      })
      .expect(201);
    const id = created.body.id as string;
    await asOpm().post(`/energy/cycles/${id}/documents-received`).send({}).expect(200);
    repository.seedAuditsForCycle(id, [{ status: "resolvida", divergenceBlocksClosing: true }]);
    await asOpm().post(`/energy/cycles/${id}/report`).send({}).expect(200);
    await asFinanceiro().post(`/energy/cycles/${id}/approve-report`).send({}).expect(200);
    await asOpm().post(`/energy/cycles/${id}/send`).send({}).expect(200);

    const response = await asFinanceiro().post(`/energy/cycles/${id}/close`).send({}).expect(200);
    expect(response.body.status).toBe("fechado");
  });

  it("closes a fully-ready cycle and records every mutation as an event", async () => {
    const id = await openReadyToCloseCycle(9, 2027);
    const response = await asFinanceiro().post(`/energy/cycles/${id}/close`).send({}).expect(200);

    expect(response.body.status).toBe("fechado");
    expect(repository.events.filter((e) => e.entityId === id).map((e) => e.eventName)).toEqual([
      "energy.cycle_opened",
      "energy.cycle_documents_received",
      "energy.cycle_report_generated",
      "energy.cycle_report_approved",
      "energy.cycle_report_sent",
      "energy.cycle_closed",
    ]);
  });

  it("reprocessing a report for a closed cycle bumps reportVersion instead of creating a second cycle", async () => {
    const id = await openReadyToCloseCycle(10, 2027);
    await asFinanceiro().post(`/energy/cycles/${id}/close`).send({}).expect(200);

    const reprocessed = await asOpm().post(`/energy/cycles/${id}/report`).send({}).expect(200);
    expect(reprocessed.body.id).toBe(id);
    expect(reprocessed.body.reportVersion).toBe(2);
    expect(reprocessed.body.status).toBe("fechado");

    const list = await asOpm().get(`/energy/cycles?consumerUnitId=${CONSUMER_UNIT_ID}&competenceMonth=10&competenceYear=2027`).expect(200);
    expect((list.body.items as unknown[]).length).toBe(1);
  });

  it("GET /energy/reports responds with filters working", async () => {
    const id = await openReadyToCloseCycle(11, 2027);
    await asFinanceiro().post(`/energy/cycles/${id}/close`).send({}).expect(200);

    const filtered = await asOpm()
      .get(`/energy/reports?consumerUnitId=${CONSUMER_UNIT_ID}&competenceMonth=11&competenceYear=2027`)
      .expect(200);
    expect((filtered.body.items as { id: string }[]).some((item) => item.id === id)).toBe(true);
    expect(filtered.body.totals.count).toBeGreaterThanOrEqual(1);

    const empty = await asOpm().get(`/energy/reports?competenceMonth=12&competenceYear=2099`).expect(200);
    expect(empty.body.items).toEqual([]);
  });
});

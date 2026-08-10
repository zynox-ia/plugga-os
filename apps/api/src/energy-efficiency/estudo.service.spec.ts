import { ConflictException } from "@nestjs/common";
import {
  PREMISSAS_2026_08,
  type EnergyPremises,
  type EnergyStudyDetail,
  type EnergyStudyListQuery,
  type InvoiceContext,
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
  demandaMedidaPontaKw: 231,
  demandaMedidaForaPontaKw: 586,
  tarifaDemanda: 22.61,
  valorReativo: 571.22,
  valorBeneficioFiscal: 0,
  valorMultasJurosEncargos: 0,
};

const CONTEXTO: InvoiceContext = {
  distribuidora: "Amazonas Energia",
  regime: "cativo",
  modalidade: "verde",
  grupo: "A",
  vencimento: "20/07/2026",
  apelido: "Loja Centro",
  classe: "Comercial / comercial",
  localidade: "Manaus/AM",
  leituraAnterior: "31/05/2026",
  leituraAtual: "30/06/2026",
  hspMensal: [4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5],
  itens: [
    {
      nome: "Consumo ponta",
      categoria: "consumo_ponta",
      compoeTotal: true,
      valor: FATURA.valorPonta,
      quantidade: FATURA.consumoPontaKwh,
      unidade: "kWh",
      tarifa: FATURA.tarifaPonta,
    },
    {
      nome: "Consumo fora ponta",
      categoria: "consumo_fora_ponta",
      compoeTotal: true,
      valor: FATURA.valorForaPonta,
      quantidade: FATURA.consumoForaPontaKwh,
      unidade: "kWh",
      tarifa: FATURA.tarifaForaPonta,
    },
    {
      nome: "Demanda faturada",
      categoria: "demanda_faturada",
      compoeTotal: true,
      valor: FATURA.valorDemanda,
      quantidade: 700,
      unidade: "kW",
      tarifa: 22.61,
    },
    {
      nome: "Energia reativa",
      categoria: "reativo",
      compoeTotal: true,
      valor: FATURA.valorReativo,
      quantidade: null,
      unidade: null,
      tarifa: null,
    },
    {
      nome: "COSIP",
      categoria: "outros",
      compoeTotal: true,
      valor: 8_745.91,
      quantidade: null,
      unidade: null,
      tarifa: null,
    },
    {
      nome: "Demanda contratada",
      categoria: "demanda_contratada",
      compoeTotal: false,
      valor: 0,
      quantidade: FATURA.demandaContratadaKw,
      unidade: "kW",
      tarifa: null,
    },
    {
      nome: "Demanda medida em ponta",
      categoria: "demanda_medida_ponta",
      compoeTotal: false,
      valor: 0,
      quantidade: FATURA.demandaMedidaPontaKw,
      unidade: "kW",
      tarifa: null,
    },
    {
      nome: "Demanda medida fora ponta",
      categoria: "demanda_medida_fora_ponta",
      compoeTotal: false,
      valor: 0,
      quantidade: FATURA.demandaMedidaForaPontaKw,
      unidade: "kW",
      tarifa: null,
    },
  ],
  arquivoNome: "fatura-06-2026.pdf",
  arquivoChave: null,
  origem: "manual",
};

const RECEBIMENTO = {
  invoice: FATURA,
  context: CONTEXTO,
  demandHistory: [] as number[],
  hasLoadProfile: false,
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
  private readonly tiposConhecidos = new Set<string>();
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
      invoiceContext: r.invoiceContext,
      reconciliationProof: r.reconciliationProof,
      demandHistory: r.demandHistory,
      estudo: results.estudo ?? null,
      trafficLightResult: r.trafficLightResult,
      validationIssues: r.validationIssues,
      hasDocument: r.documentHtml !== null,
      hasMobileDocument: r.documentHtmlMobile !== null,
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
      invoiceContext: null,
      reconciliationProof: null,
      demandHistory: [],
      hasLoadProfile: false,
      results: null,
      validationIssues: null,
      documentHtml: null,
      documentHtmlMobile: null,
      trafficLight: null,
      trafficLightResult: null,
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
      calculationMode: input.calculationMode ?? r.calculationMode,
      hasLoadProfile:
        input.calculationMode !== undefined
          ? input.calculationMode === "memoria_massa"
          : r.hasLoadProfile,
      invoice: input.invoice ?? r.invoice,
      invoiceContext: input.invoiceContext ?? r.invoiceContext,
      reconciliationProof:
        input.reconciliationProof !== undefined
          ? input.reconciliationProof
          : r.reconciliationProof,
      demandHistory: input.demandHistory ?? r.demandHistory,
      results: input.results !== undefined ? input.results : r.results,
      validationIssues:
        input.validationIssues !== undefined ? input.validationIssues : r.validationIssues,
      documentHtml: input.documentHtml !== undefined ? input.documentHtml : r.documentHtml,
      documentHtmlMobile:
        input.documentHtmlMobile !== undefined ? input.documentHtmlMobile : r.documentHtmlMobile,
      trafficLight: input.trafficLight !== undefined ? input.trafficLight : r.trafficLight,
      trafficLightResult:
        input.trafficLightResult !== undefined ? input.trafficLightResult : r.trafficLightResult,
      approvedById: input.approvedById !== undefined ? input.approvedById : r.approvedById,
      approvedAt: input.approvedAt !== undefined ? input.approvedAt : r.approvedAt,
      sentAt: input.sentAt !== undefined ? input.sentAt : r.sentAt,
    });
    return this.detalhar(id);
  }

  async documento(id: string, versao: "desktop" | "celular" = "desktop"): Promise<string> {
    const r = await this.carregar(id);
    const documento = versao === "celular" ? r.documentHtmlMobile : r.documentHtml;
    if (!documento) throw new Error("estudo sem documento gerado");
    return documento;
  }

  async tipoConhecido(chave: string): Promise<boolean> {
    return this.tiposConhecidos.has(chave);
  }

  async aprovarTipo(input: { chave: string }): Promise<void> {
    this.tiposConhecidos.add(input.chave);
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
      trafficLight: r.trafficLight,
      economiaMensal: null,
      capexTotal: null,
      version: 1,
      revision: 0,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      createdAt: new Date("2026-08-08T00:00:00.000Z").toISOString(),
    };
  }

  /**
   * Só para teste: força problemas de validação num estudo. Zera o documento
   * junto, como o serviço faz de verdade — documento reprovado não fica gravado.
   */
  forcarProblemas(id: string, problemas: ProblemaDeValidacao[]): void {
    const r = this.registros.get(id);
    if (r) {
      this.registros.set(id, {
        ...r,
        validationIssues: problemas,
        status: "bloqueado",
        documentHtml: null,
        documentHtmlMobile: null,
        trafficLight: "vermelho",
      });
    }
  }

  /** Simula registro anterior à coluna invoiceContext da nova auditoria. */
  forcarEstudoLegado(id: string): void {
    const r = this.registros.get(id);
    if (r) {
      this.registros.set(id, {
        ...r,
        status: "bloqueado",
        invoice: FATURA,
        invoiceContext: null,
        validationIssues: [{ regra: "legado", detalhe: "fatura ainda não conciliada" }],
      });
    }
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
    expect(estudo.premiseVersion).toBe("2026-08-09-prd-v1");
    expect(estudo.invoice).toBeNull();
  });

  it("recebe a fatura, calcula e chega a em_validacao com documento", async () => {
    const criado = await criar();
    const estudo = await service.receberFatura(criado.id, {
      invoice: FATURA,
      context: CONTEXTO,
      demandHistory: [634, 704, 705, 698, 668, 586],
      hasLoadProfile: false,
    });

    expect(estudo.status).toBe("em_validacao");
    expect(estudo.validationIssues).toBeNull();
    expect(estudo.hasDocument).toBe(true);
    expect(estudo.hasMobileDocument).toBe(true);
    expect(estudo.trafficLight).toBe("amarelo");
    // Os números do motor ficam gravados, não recalculados a cada leitura.
    expect(estudo.estudo?.economiaMensal).toBeGreaterThan(0);
    // Uma unidade BESS a R$ 550 mil mais a usina derivada do kWp: o CAPEX
    // agora vem do dimensionamento normativo, não de uma premissa de tabela.
    expect(estudo.estudo?.capexBess).toBe(550_000);
    expect(estudo.estudo?.capexTotal).toBeGreaterThan(550_000);
    // O estudo carrega os dois cenários: o apresentado e o BESS puro que o
    // semáforo julga.
    expect(estudo.estudo?.modo).toBe("solar_bess");
    expect(estudo.estudo?.solarKwp).toBeGreaterThan(0);
    expect(estudo.estudo?.bessPuro.capexTotal).toBeLessThan(
      estudo.estudo!.capexTotal,
    );
    expect(estudo.estudo?.fluxoAnual).toHaveLength(21);
  });

  it("fora do envelope suportado, para e escala com o erro literal", async () => {
    const criado = await criar();

    const estudo = await service.receberFatura(criado.id, {
      ...RECEBIMENTO,
      // Pico de ponta que exigiria mais unidades do que a energia pede: o
      // dimensionamento passa a ser limitado por potência, que o envelope da
      // norma não cobre.
      invoice: { ...FATURA, demandaMedidaPontaKw: 700 },
    });

    expect(estudo.status).toBe("bloqueado");
    expect(estudo.trafficLight).toBe("vermelho");
    expect(estudo.hasDocument).toBe(false);
    expect(estudo.validationIssues?.[0]?.detalhe).toContain("limitado por potência");
  });

  it("obriga e aceita conciliação antes de recalcular estudo legado", async () => {
    const criado = await criar();
    repositorio.forcarEstudoLegado(criado.id);

    const estudo = await service.receberFatura(criado.id, RECEBIMENTO);

    expect(estudo.status).toBe("em_validacao");
    expect(estudo.invoiceContext).toEqual(CONTEXTO);
    expect(estudo.validationIssues).toBeNull();
    expect(estudo.hasDocument).toBe(true);
  });

  it("mantém o modo do estudo coerente com a memória de massa informada", async () => {
    const criado = await criar();
    const estudo = await service.receberFatura(criado.id, {
      ...RECEBIMENTO,
      hasLoadProfile: true,
    });

    expect(estudo.calculationMode).toBe("memoria_massa");

    const recalculado = await service.calcular(criado.id);
    expect(recalculado.calculationMode).toBe("memoria_massa");
    expect(recalculado.estudo?.economiaAno1).toBe(estudo.estudo?.economiaAno1);
  });

  it("percorre aprovação e envio", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, RECEBIMENTO);

    const aprovado = await service.aprovar(criado.id, { note: "conferido" }, ADMIN, AGORA);
    expect(aprovado.status).toBe("aprovado_internamente");
    expect(aprovado.approvedAt).not.toBeNull();

    const enviado = await service.marcarEnviado(criado.id, AGORA);
    expect(enviado.status).toBe("enviado_cliente");
    expect(enviado.sentAt).not.toBeNull();
  });

  it("invalida a assinatura anterior quando o estudo é recalculado", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, RECEBIMENTO);
    await service.aprovar(criado.id, { note: "conferido" }, ADMIN, AGORA);

    const recalculado = await service.calcular(criado.id);

    expect(recalculado.status).toBe("em_validacao");
    expect(recalculado.approvedAt).toBeNull();
  });

  /**
   * A trava central: o estudo não avança com problema de validação em aberto.
   * No fluxo do agente isso depende de alguém lembrar de conferir.
   */
  it("recusa aprovar estudo bloqueado por validação", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, RECEBIMENTO);
    repositorio.forcarProblemas(criado.id, [{ regra: "termo_interno", detalhe: "all-in" }]);

    await expect(service.aprovar(criado.id, {}, ADMIN, AGORA)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("recusa enviar sem aprovação humana registrada", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, RECEBIMENTO);

    // Em `em_validacao` o envio nem é transição válida — e mesmo que fosse,
    // faltaria o aprovador.
    await expect(service.marcarEnviado(criado.id, AGORA)).rejects.toBeInstanceOf(ConflictException);
  });

  it("principal de serviço não pode aprovar", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, RECEBIMENTO);

    // O agente opera o fluxo, mas não assina: aprovar é assumir a
    // responsabilidade pelo que sai para o cliente.
    await expect(service.aprovar(criado.id, {}, AGENTE, AGORA)).rejects.toThrow(
      /usuário identificável/,
    );
  });

  it("id sintético do escape hatch de desenvolvimento também não aprova", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, RECEBIMENTO);

    // `x-dev-principal: user:andre` resolve para kind "user", mas o id não é
    // UUID: não existe pessoa correspondente no banco para responder por isso.
    const sintetico = { id: "user:andre", kind: "user" as const, roles: ["admin" as const] };
    await expect(service.aprovar(criado.id, {}, sintetico, AGORA)).rejects.toThrow(
      /usuário identificável/,
    );
  });

  /**
   * O PDF passa pela mesma porta do HTML — `repository.documento` —, então a
   * trava da validação vale para ele sem regra nova, e sem abrir navegador.
   *
   * Um teste só: com `forcarProblemas` anulando o documento como o serviço
   * real faz, o caso "bloqueado" cairia no mesmo ramo `documentHtml === null` e
   * não acrescentaria cobertura nenhuma. O que garante a trava do estado
   * bloqueado é `recusa aprovar estudo bloqueado por validação`, acima.
   */
  it("não gera PDF enquanto não houver documento aprovado", async () => {
    const criado = await criar();

    await expect(service.pdf(criado.id)).rejects.toThrow(/sem documento gerado/);
  });

  /**
   * O outro lado da mesma porta: cálculo limpo grava o documento, e é ele que
   * o PDF converte. Sem isto, o teste acima passaria mesmo que a gravação do
   * documento estivesse quebrada.
   */
  it("guarda o documento quando a validação passa, que é o que o PDF converte", async () => {
    const criado = await criar();
    await service.receberFatura(criado.id, RECEBIMENTO);

    await expect(service.documento(criado.id)).resolves.toContain("Relatório de Auditoria");
  });

  it("recusa calcular sem ficha de fatura", async () => {
    const criado = await criar();
    await expect(service.calcular(criado.id)).rejects.toThrow(/sem fatura conciliável/);
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
    await service.receberFatura(a.id, RECEBIMENTO);
    await criar();

    expect((await service.listar({ status: "em_validacao" })).items).toHaveLength(1);
    expect((await service.listar({ status: "aguardando_dados" })).items).toHaveLength(1);
    expect((await service.listar()).items).toHaveLength(2);
  });
});

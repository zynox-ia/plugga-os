import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type {
  ApproveEnergyStudyRequest,
  CreateEnergyStudyRequest,
  EnergyStudyDetail,
  EnergyStudyListQuery,
  ListEnergyStudiesResponse,
  SubmitEnergyInvoiceRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { auditarFatura } from "./calculo/auditoria.js";
import { calcularEconomia } from "./calculo/cenarios.js";
import { analisarDemanda } from "./calculo/demanda.js";
import { dimensionar } from "./calculo/dimensionamento.js";
import { calcularFinanceiro } from "./calculo/financeiro.js";
import { gerarRelatorio } from "./documento/relatorio.js";
import { EstudoRepository } from "./estudo.repository.js";
import {
  assertCompetencia,
  assertPodeAprovar,
  assertPodeEnviar,
  assertTransicao,
  estadoAposValidacao,
} from "./estudo.rules.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id do ator para gravar em coluna UUID.
 *
 * Devolve null quando o principal não é um usuário real com id de banco. O
 * escape hatch de desenvolvimento (`x-dev-principal`) carrega id sintético como
 * "user:andre", que não é UUID — gravar isso estoura no Postgres. Mesma razão
 * pela qual `requested_by` é nulo para principal de serviço: quem não é pessoa
 * identificável no banco não assina o registro.
 */
function autorOuNulo(principal: AuthPrincipal): string | null {
  return principal.kind === "user" && UUID.test(principal.id) ? principal.id : null;
}

/**
 * Orquestra o estudo de eficiência energética.
 *
 * O que este serviço faz de diferente do fluxo atual do agente: as travas não
 * são lembretes, são condição de transição. Um estudo não chega a
 * `aprovado_internamente` com problema de validação em aberto, e não chega a
 * `enviado_cliente` sem uma pessoa ter aprovado.
 */
@Injectable()
export class EstudoService {
  constructor(private readonly repository: EstudoRepository) {}

  listar(query?: EnergyStudyListQuery): Promise<ListEnergyStudiesResponse> {
    return this.repository.listar(query);
  }

  detalhar(id: string): Promise<EnergyStudyDetail> {
    return this.repository.detalhar(id);
  }

  documento(id: string): Promise<string> {
    return this.repository.documento(id);
  }

  async criar(
    input: CreateEnergyStudyRequest,
    principal: AuthPrincipal,
    agora = new Date(),
  ): Promise<EnergyStudyDetail> {
    assertCompetencia(input.competenceMonth, input.competenceYear, agora);

    // A versão de premissas é fixada na criação, não na hora do cálculo: se a
    // premissa mudar no meio do trabalho, o estudo continua explicável pelo que
    // valia quando começou.
    const premissas = await this.repository.premissasVigentes(agora);

    const estudo = await this.repository.criar({
      ...input,
      premiseVersion: premissas.versao,
      createdById: autorOuNulo(principal),
    });

    return this.repository.atualizar(estudo.id, { status: "aguardando_dados" });
  }

  /** Recebe a ficha da fatura e já roda o cálculo — não há razão para separar. */
  async receberFatura(
    id: string,
    input: SubmitEnergyInvoiceRequest,
  ): Promise<EnergyStudyDetail> {
    const estudo = await this.repository.carregar(id);
    assertTransicao(estudo.status, "dados_recebidos");

    await this.repository.atualizar(id, {
      status: "dados_recebidos",
      invoice: input.invoice,
      demandHistory: input.demandHistory,
    });

    return this.calcular(id, input.hasLoadProfile);
  }

  /**
   * Roda o motor, gera o documento e passa pela validação bloqueante. O
   * resultado da validação decide o estado: limpo vai para `em_validacao`,
   * com problema vai para `bloqueado`.
   */
  async calcular(id: string, temMemoriaDeMassa = false): Promise<EnergyStudyDetail> {
    const estudo = await this.repository.carregar(id);
    if (!estudo.invoice) {
      throw new BadRequestException("estudo sem ficha de fatura: informe a fatura antes de calcular");
    }
    assertTransicao(estudo.status, "em_calculo");
    await this.repository.atualizar(id, { status: "em_calculo" });

    const premissas = await this.repository.premissasPorVersao(estudo.premiseVersion);
    const fatura = estudo.invoice;

    const auditoria = auditarFatura(fatura);
    const dimensionamento = dimensionar({ fatura, premissas });
    const economia = calcularEconomia({ fatura, premissas, dimensionamento });
    const financeiro = calcularFinanceiro({
      premissas,
      dimensionamento,
      economiaAno1: economia.economiaAno1,
    });
    const demanda = analisarDemanda({
      demandaContratadaKw: fatura.demandaContratadaKw,
      historicoKw: estudo.demandHistory,
      tarifaDemanda: fatura.tarifaDemanda ?? 0,
      premissas,
      temMemoriaDeMassa,
    });

    const detalhe = await this.repository.detalhar(id);
    const { html, problemas } = gerarRelatorio({
      caso: {
        cliente: detalhe.clientName,
        unidadeConsumidora: detalhe.consumerUnitCode,
        distribuidora: "—",
        localidade: "—",
        grupoModalidade: "Grupo A",
        referencia: `${String(estudo.competenceMonth).padStart(2, "0")}/${estudo.competenceYear}`,
      },
      fatura,
      premissas,
      auditoria,
      demanda,
      dimensionamento,
      economia,
      financeiro,
    });

    await this.repository.atualizar(id, { status: "relatorio_gerado" });

    return this.repository.atualizar(id, {
      status: estadoAposValidacao(problemas),
      results: { auditoria, demanda, dimensionamento, economia, financeiro },
      validationIssues: problemas.length > 0 ? problemas : null,
      documentHtml: problemas.length > 0 ? null : html,
      economiaMensal: economia.economiaMensal,
      capexTotal: financeiro.capexTotal,
    });
  }

  async aprovar(
    id: string,
    input: ApproveEnergyStudyRequest,
    principal: AuthPrincipal,
    agora = new Date(),
  ): Promise<EnergyStudyDetail> {
    const estudo = await this.repository.carregar(id);
    assertPodeAprovar(estudo.status, estudo.validationIssues);

    // Recusa aqui, e não no envio: aprovar é assumir responsabilidade, e
    // principal de serviço ou escape hatch de desenvolvimento não têm quem
    // responder. Falhar na aprovação diz o motivo certo na hora certa.
    const aprovador = autorOuNulo(principal);
    if (!aprovador) {
      throw new ConflictException(
        "aprovação exige usuário identificável: principal de serviço ou de desenvolvimento não pode aprovar",
      );
    }

    return this.repository.atualizar(id, {
      status: "aprovado_internamente",
      approvedById: aprovador,
      approvedAt: agora,
      approvalNote: input.note ?? null,
    });
  }

  async marcarEnviado(id: string, agora = new Date()): Promise<EnergyStudyDetail> {
    const estudo = await this.repository.carregar(id);
    assertPodeEnviar(estudo.status, estudo.approvedById);

    return this.repository.atualizar(id, { status: "enviado_cliente", sentAt: agora });
  }
}

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
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
import { analisarDemanda } from "./calculo/demanda.js";
import { rodarMotorPrd } from "./calculo/motor-prd.js";
import { chaveDoTipo, classificarSemaforo } from "./calculo/semaforo.js";
import { conciliarFatura } from "./nucleo/conciliacao.js";
import {
  contarConferencias,
  faturaNormativaDoSistema,
} from "./nucleo/da-fatura-do-sistema.js";
import { gerarVersaoCelular } from "./documento/celular.js";
import { calcularHashDocumento } from "./documento/integridade.js";
import { nomeDoArquivoPdf } from "./documento/nome-arquivo.js";
import { FilaCheiaError, NavegadorIndisponivelError, gerarPdf } from "./documento/pdf.js";
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
  // `@Inject` explícito como nos demais services do repositório. Em produção o
  // `nest build` emite `design:paramtypes` e a injeção funciona sem isto; sob o
  // vitest, que transpila por esbuild, o metadado não existe e a dependência
  // chega undefined — o que obrigava a dublar o service para testar a rota.
  constructor(@Inject(EstudoRepository) private readonly repository: EstudoRepository) {}

  listar(query?: EnergyStudyListQuery): Promise<ListEnergyStudiesResponse> {
    return this.repository.listar(query);
  }

  detalhar(id: string): Promise<EnergyStudyDetail> {
    return this.repository.detalhar(id);
  }

  documento(id: string, versao: "desktop" | "celular" = "desktop"): Promise<string> {
    return this.repository.documento(id, versao);
  }

  /**
   * O PDF do estudo, derivado do HTML já gravado.
   *
   * Converte na hora em vez de guardar o arquivo: o HTML é a fonte, e um PDF
   * persistido só criaria uma segunda verdade que envelhece — bastaria um
   * recálculo para o arquivo em disco divergir do documento aprovado. Como
   * `repository.documento` só devolve HTML de estudo que passou na validação,
   * a trava do fluxo vale igual aqui: documento reprovado não vira arquivo.
   */
  async pdf(id: string): Promise<{ arquivo: Buffer; nome: string }> {
    const html = await this.repository.documento(id, "desktop");
    const detalhe = await this.repository.detalhar(id);

    try {
      return { arquivo: await gerarPdf(html), nome: nomeDoArquivoPdf(detalhe) };
    } catch (erro) {
      // Falta de navegador e fila cheia são problema nosso, não do estudo: 503
      // com a mensagem real, para quem opera saber que o HTML continua
      // disponível e que vale tentar de novo.
      if (erro instanceof NavegadorIndisponivelError || erro instanceof FilaCheiaError) {
        throw new ServiceUnavailableException(erro.message);
      }
      throw erro;
    }
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
      calculationMode: input.hasLoadProfile ? "memoria_massa" : "preliminar",
      invoice: input.invoice,
      invoiceContext: input.context,
      demandHistory: input.demandHistory,
      reconciliationProof: null,
      results: null,
      validationIssues: null,
      documentHtml: null,
      documentHtmlMobile: null,
      documentHash: null,
      documentMobileHash: null,
      trafficLight: null,
      trafficLightResult: null,
      economiaMensal: null,
      capexTotal: null,
      approvedById: null,
      approvedAt: null,
      approvalNote: null,
      sentAt: null,
    });

    return this.calcular(id, input.hasLoadProfile);
  }

  /**
   * Roda o motor, gera o documento e passa pela validação bloqueante. O
   * resultado da validação decide o estado: limpo vai para `em_validacao`,
   * com problema vai para `bloqueado`.
   */
  async calcular(id: string, temMemoriaDeMassa?: boolean): Promise<EnergyStudyDetail> {
    const estudo = await this.repository.carregar(id);
    if (!estudo.invoice || !estudo.invoiceContext) {
      throw new BadRequestException(
        "estudo sem fatura conciliável: informe a ficha, o tipo e os itens da fatura",
      );
    }
    assertTransicao(estudo.status, "em_calculo");
    // Qualquer recálculo invalida a assinatura e a entrega anteriores. Mesmo
    // que o tipo passe a verde depois da aprovação, o histórico não pode dizer
    // que a pessoa aprovou números que ainda não existiam naquele momento.
    await this.repository.atualizar(id, {
      status: "em_calculo",
      approvedById: null,
      approvedAt: null,
      approvalNote: null,
      sentAt: null,
    });

    const premissas = await this.repository.premissasPorVersao(estudo.premiseVersion);
    const fatura = estudo.invoice;
    const contexto = estudo.invoiceContext;
    const usaMemoriaDeMassa = temMemoriaDeMassa ?? estudo.hasLoadProfile;

    // Trava 1 é a do pacote normativo, aplicada sobre a fatura na forma da
    // norma. A prova guardada mantém o par de conferências que a interface já
    // exibe desde a V1.
    const detalheDaUnidade = await this.repository.detalhar(id);
    const faturaNormativa = faturaNormativaDoSistema(fatura, contexto, {
      cliente: detalheDaUnidade.clientName,
      unidadeConsumidora: detalheDaUnidade.consumerUnitCode,
      mesDeCompetencia: estudo.competenceMonth,
      anoDeCompetencia: estudo.competenceYear,
    });
    const trava1 = conciliarFatura(faturaNormativa);
    const conciliacao = {
      problemas: trava1.problemas,
      prova: { ...trava1.prova, ...contarConferencias(faturaNormativa) },
    };
    if (conciliacao.problemas.length > 0) {
      return this.repository.atualizar(id, {
        status: "bloqueado",
        reconciliationProof: conciliacao.prova,
        trafficLight: "vermelho",
        trafficLightResult: {
          faixa: "vermelho",
          chaveTipo: chaveDoTipo(contexto),
          tipoConhecido: false,
          motivos: conciliacao.problemas.map((problema) => problema.detalhe),
          quatroNumeros: {
            totalFatura: fatura.valorTotal,
            consumoPontaKwh: fatura.consumoPontaKwh,
            tirAnual: null,
            paybackAnos: null,
          },
        },
        validationIssues: conciliacao.problemas,
        documentHtml: null,
        documentHtmlMobile: null,
      });
    }

    const auditoria = auditarFatura(fatura);
    const { dimensionamento, economia, financeiro } = rodarMotorPrd(fatura, premissas);
    const demanda = analisarDemanda({
      demandaContratadaKw: fatura.demandaContratadaKw,
      historicoKw: estudo.demandHistory,
      tarifaDemanda: fatura.tarifaDemanda ?? 0,
      premissas,
      temMemoriaDeMassa: usaMemoriaDeMassa,
    });

    const detalhe = detalheDaUnidade;
    const { html, problemas } = gerarRelatorio({
      caso: {
        cliente: detalhe.clientName,
        unidadeConsumidora: detalhe.consumerUnitCode,
        distribuidora: contexto.distribuidora,
        localidade: "—",
        grupoModalidade: `Grupo ${contexto.grupo} · ${contexto.modalidade} · ${contexto.regime}`,
        referencia: `${String(estudo.competenceMonth).padStart(2, "0")}/${estudo.competenceYear}`,
        vencimento: contexto.vencimento ?? undefined,
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

    const tipoConhecido = await this.repository.tipoConhecido(chaveDoTipo(contexto));
    let semaforo = classificarSemaforo({
      fatura,
      contexto,
      economia,
      financeiro,
      tipoConhecido,
    });
    if (problemas.length > 0) {
      semaforo = {
        ...semaforo,
        faixa: "vermelho",
        motivos: [...semaforo.motivos, ...problemas.map((problema) => problema.detalhe)],
      };
    }

    const bloqueado = semaforo.faixa === "vermelho";
    const htmlCelular = bloqueado ? null : gerarVersaoCelular(html);
    return this.repository.atualizar(id, {
      status: bloqueado ? "bloqueado" : estadoAposValidacao([]),
      results: { auditoria, demanda, dimensionamento, economia, financeiro },
      reconciliationProof: conciliacao.prova,
      trafficLight: semaforo.faixa,
      trafficLightResult: semaforo,
      validationIssues: bloqueado
        ? problemas.length > 0
          ? problemas
          : semaforo.motivos.map((detalhe) => ({ regra: "semaforo", detalhe }))
        : null,
      documentHtml: bloqueado ? null : html,
      documentHtmlMobile: htmlCelular,
      documentHash: bloqueado ? null : calcularHashDocumento(html),
      documentMobileHash: htmlCelular ? calcularHashDocumento(htmlCelular) : null,
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

    if (estudo.trafficLight !== "amarelo" || !estudo.trafficLightResult || !estudo.invoiceContext) {
      throw new ConflictException("somente estudo amarelo registra aprovação de tipo novo");
    }

    // Recusa aqui, e não no envio: aprovar é assumir responsabilidade, e
    // principal de serviço ou escape hatch de desenvolvimento não têm quem
    // responder. Falhar na aprovação diz o motivo certo na hora certa.
    const aprovador = autorOuNulo(principal);
    if (!aprovador) {
      throw new ConflictException(
        "aprovação exige usuário identificável: principal de serviço ou de desenvolvimento não pode aprovar",
      );
    }

    const detalhe = await this.repository.detalhar(id);
    await this.repository.aprovarTipo({
      chave: estudo.trafficLightResult.chaveTipo,
      contexto: estudo.invoiceContext,
      exemploUc: detalhe.consumerUnitCode,
      aprovadoPorId: aprovador,
      aprovadoEm: agora,
    });

    return this.repository.atualizar(id, {
      status: "aprovado_internamente",
      approvedById: aprovador,
      approvedAt: agora,
      approvalNote: input.note ?? null,
    });
  }

  async marcarEnviado(id: string, agora = new Date()): Promise<EnergyStudyDetail> {
    const estudo = await this.repository.carregar(id);
    assertPodeEnviar(estudo.status, estudo.approvedById, estudo.trafficLight);

    return this.repository.atualizar(id, { status: "enviado_cliente", sentAt: agora });
  }
}

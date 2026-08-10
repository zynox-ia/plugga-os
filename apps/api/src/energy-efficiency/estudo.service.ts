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
import { calcularHashDocumento } from "./documento/integridade.js";
import { nomeDoArquivoPdf } from "./documento/nome-arquivo.js";
import { FilaCheiaError, NavegadorIndisponivelError, gerarPdf } from "./documento/pdf.js";
import {
  CasoIncoerenteError,
  ForaDoEnvelopeError,
  montarCasoDoRelatorio,
} from "./nucleo/caso-do-relatorio.js";
import { conciliarFatura } from "./nucleo/conciliacao.js";
import {
  casoDoMotorDaFatura,
  contarConferencias,
  faturaNormativaDoSistema,
} from "./nucleo/da-fatura-do-sistema.js";
import { rodarEstudo } from "./nucleo/pipeline.js";
import { gerarVersaoCelular } from "./nucleo/relatorio-celular.js";
import { gerarRelatorio } from "./nucleo/relatorio-literal.js";
import { chaveDoTipo, classificarSemaforo } from "./nucleo/semaforo.js";
import { verificarRelatorio } from "./nucleo/trava-aritmetica.js";
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

    return this.calcular(id);
  }

  /**
   * Roda o motor, gera o documento e passa pela validação bloqueante. O
   * resultado da validação decide o estado: limpo vai para `em_validacao`,
   * com problema vai para `bloqueado`.
   */
  async calcular(id: string): Promise<EnergyStudyDetail> {
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

    const fatura = estudo.invoice;
    const contexto = estudo.invoiceContext;

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
          chaveTipo: chaveDoTipo(faturaNormativa),
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

    // Cálculo: o pipeline normativo, com as duas passagens e os dois fluxos.
    const caso = casoDoMotorDaFatura(faturaNormativa, contexto.hspMensal ?? null);
    const estudoCalculado = rodarEstudo(caso);
    const { fluxoBess, fluxoSolar } = estudoCalculado;

    // O semáforo julga o fluxo BESS; o documento fala do fluxo Solar.
    const tipoConhecido = await this.repository.tipoConhecido(chaveDoTipo(faturaNormativa));
    const semaforo = classificarSemaforo({
      fatura: faturaNormativa,
      conciliada: true,
      fluxoBess,
      tipoConhecido,
    });

    const indicadores = fluxoSolar.indicadores;
    const economiaAno1 = fluxoSolar.fluxo_anual[1] ?? 0;
    const acumulado: number[] = [fluxoSolar.fluxo_anual[0] ?? 0];
    for (const ano of fluxoSolar.fluxo_anual.slice(1)) {
      acumulado.push(acumulado[acumulado.length - 1]! + ano);
    }
    const resultado = {
      modo: estudoCalculado.modo,
      unidadesBess: fluxoSolar.dimensionamento.n_bess_adotado,
      solarKwp: estudoCalculado.solarKwp,
      regraDoKwp: estudoCalculado.regraDoKwp,
      capexBess: Math.abs(fluxoBess.fluxo_anual[0] ?? 0),
      capexSolar: estudoCalculado.capexSolarTotal,
      capexTotal: indicadores.capex_total,
      economiaMensal: economiaAno1 / 12,
      economiaAno1,
      faturaProjetada: fatura.valorTotal - economiaAno1 / 12,
      tirAa: indicadores.tir_aa,
      paybackAnos: indicadores.payback_anos,
      acumulado20Anos: indicadores.acumulado_20a,
      vplTma: indicadores.vpl_tma,
      fluxoAnual: fluxoSolar.fluxo_anual,
      fluxoAcumulado: acumulado,
      bessPuro: {
        capexTotal: fluxoBess.indicadores.capex_total,
        economiaAno1: fluxoBess.fluxo_anual[1] ?? 0,
        tirAa: fluxoBess.indicadores.tir_aa,
        paybackAnos: fluxoBess.indicadores.payback_anos,
        acumulado20Anos: fluxoBess.indicadores.acumulado_20a,
      },
    };

    // Vermelho para antes do documento: relatório reprovado não nasce.
    if (semaforo.faixa === "vermelho") {
      return this.bloquear(id, {
        resultado,
        prova: conciliacao.prova,
        semaforo,
        fatura,
        indicadores,
        motivos: semaforo.motivos,
      });
    }

    // Documento: substituição literal sobre o modelo congelado. Fora do
    // envelope suportado o núcleo recusa, e recusa vira faixa vermelha com o
    // erro literal — é o "para e escala" da norma, não um 500 na cara de quem
    // opera.
    let casoDoRelatorio;
    try {
      casoDoRelatorio = montarCasoDoRelatorio({
        fatura: faturaNormativa,
        tarifas: {
          tusdP: caso.tusdP ?? null,
          teP: caso.teP ?? null,
          tusdFp: caso.tusdFp ?? 0,
          teFp: caso.teFp ?? 0,
        },
        consumoPontaDoCaso: caso.consumoPontaDesejadoKwhMes ?? 0,
        fluxoBess,
        fluxoSolar,
        solarKwp: estudoCalculado.solarKwp,
        capexSolarTotal: estudoCalculado.capexSolarTotal,
      });
    } catch (erro) {
      if (erro instanceof ForaDoEnvelopeError || erro instanceof CasoIncoerenteError) {
        return this.bloquear(id, {
          resultado,
          prova: conciliacao.prova,
          semaforo,
          fatura,
          indicadores,
          motivos: [erro.message],
        });
      }
      throw erro;
    }
    const html = gerarRelatorio(casoDoRelatorio);
    const htmlCelular = gerarVersaoCelular(html);

    // Trava 2: o documento pronto é conferido de trás para frente contra a
    // fatura conciliada e o fluxo apresentado. O gerador garante por
    // construção; esta trava garante por verificação, e é ela que pega um erro
    // do construtor. Reprovada, nada é gravado como entregável.
    const trava2 = verificarRelatorio({
      html,
      fatura: faturaNormativa,
      fluxo: fluxoSolar,
      conciliada: true,
    });
    if (!trava2.aprovado) {
      return this.bloquear(id, {
        resultado,
        prova: conciliacao.prova,
        semaforo,
        fatura,
        indicadores,
        motivos: trava2.problemas,
      });
    }

    await this.repository.atualizar(id, { status: "relatorio_gerado" });

    return this.repository.atualizar(id, {
      status: estadoAposValidacao([]),
      results: { estudo: resultado },
      reconciliationProof: conciliacao.prova,
      trafficLight: semaforo.faixa,
      trafficLightResult: {
        faixa: semaforo.faixa,
        chaveTipo: semaforo.chaveDoTipo,
        tipoConhecido: semaforo.tipoConhecido,
        motivos: semaforo.motivos,
        quatroNumeros: {
          totalFatura: fatura.valorTotal,
          consumoPontaKwh: fatura.consumoPontaKwh,
          tirAnual: indicadores.tir_aa,
          paybackAnos: indicadores.payback_anos,
        },
      },
      validationIssues: null,
      documentHtml: html,
      documentHtmlMobile: htmlCelular,
      documentHash: calcularHashDocumento(html),
      documentMobileHash: calcularHashDocumento(htmlCelular),
      economiaMensal: resultado.economiaMensal,
      capexTotal: resultado.capexTotal,
    });
  }

  /**
   * Faixa vermelha: para e escala com o erro literal. Nunca entrega, e não há
   * override — a saída é corrigir a fonte e recalcular, que cria uma execução
   * nova (PRD §7 e §8.2).
   */
  private bloquear(
    id: string,
    entrada: {
      resultado: Record<string, unknown>;
      prova: Record<string, unknown>;
      semaforo: { chaveDoTipo: string; tipoConhecido: boolean };
      fatura: { valorTotal: number; consumoPontaKwh: number };
      indicadores: { tir_aa: number | null; payback_anos: number | null };
      motivos: string[];
    },
  ): Promise<EnergyStudyDetail> {
    return this.repository.atualizar(id, {
      status: "bloqueado",
      results: { estudo: entrada.resultado },
      reconciliationProof: entrada.prova as never,
      trafficLight: "vermelho",
      trafficLightResult: {
        faixa: "vermelho",
        chaveTipo: entrada.semaforo.chaveDoTipo,
        tipoConhecido: entrada.semaforo.tipoConhecido,
        motivos: entrada.motivos,
        quatroNumeros: {
          totalFatura: entrada.fatura.valorTotal,
          consumoPontaKwh: entrada.fatura.consumoPontaKwh,
          tirAnual: entrada.indicadores.tir_aa,
          paybackAnos: entrada.indicadores.payback_anos,
        },
      },
      validationIssues: entrada.motivos.map((detalhe) => ({ regra: "semaforo", detalhe })),
      documentHtml: null,
      documentHtmlMobile: null,
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

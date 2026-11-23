import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ARQUIVO_DE_ORDEM_MAX_BYTES,
  ASSINATURA_MAX_BYTES,
  codigoDaOrdemDeServico,
  colunasDoQuadroDeOrdens,
  criarPedidoDeCompraSchema,
  listarOrdensDeServicoRespostaSchema,
  opcoesDaEngenhariaRespostaSchema,
  ordemDeServicoSchema,
  origensDaOrdemDeServico,
  prioridadesDaOrdemDeServico,
  quadroDeOrdensRespostaSchema,
  tiposDeFotoDaOrdem,
  tiposDeOrdemDeServico,
  buscarClientesDaEngenhariaRespostaSchema,
  type AcaoDaOrdemDeServico,
  type BuscarClientesDaEngenhariaResposta,
  type ColherTermo,
  type CriarOrdemDeServico,
  type EditarOrdemDeServico,
  type ListarOrdensDeServicoQuery,
  type ListarOrdensDeServicoResposta,
  type OpcoesDaEngenhariaResposta,
  type OrdemDeServico,
  type PedirMaterial,
  type QuadroDeOrdensQuery,
  type QuadroDeOrdensResposta,
  type VisaoGeralDaEngenharia,
  PRAZO_PADRAO_DO_TIPO,
  configuracoesDaEngenhariaRespostaSchema,
  type ConfiguracoesDaEngenharia,
  type EditarConfiguracaoDeTipoDeOrdem,
  type TipoDeOrdemDeServico,
  type VisaoGeralDaEngenhariaQuery,
  visaoGeralDaEngenhariaRespostaSchema,
} from "@plugga/shared";

import { AcessoNegado, ArquivoRecusado, LimiteExcedido, RequisicaoInvalida, TipoNaoPermitido } from "../common/errors/dominio";
import { adicionarDiasUteis, diaEmManaus } from "../compras/dias-uteis";
import { ComprasService } from "../compras/compras.service";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { TarefasService } from "../tarefas/tarefas.service";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { detectarTipo } from "../lead-documentos/deteccao-de-tipo";
import { nomeSeguro } from "../lead-documentos/lead-documentos.rules";
import { paraFicha, paraResumo } from "./engenharia.mapeamento";
import { exigirAcao, gerenteDasOrdens as gerenteDaEngenharia, operaOrdens } from "./engenharia.rules";
import { PrismaEngenhariaRepository, type ArquivoGuardado } from "./prisma-engenharia.repository";
import { TermoDaOrdemPdf } from "./termo-da-ordem.pdf";

export const RELOGIO_DA_ENGENHARIA = Symbol("RELOGIO_DA_ENGENHARIA");
export type Relogio = () => Date;

export type ArquivoRecebido = { buffer: Buffer; nomeOriginal: string };
export type ArquivoParaBaixar = { arquivo: ArquivoGuardado; stream: NodeJS.ReadableStream; encerrar: () => void };

type Pasta = "fotos" | "assinaturas" | "termos";

/**
 * Ordens de serviço da Engenharia (PLU-345). O controller garante as telas;
 * aqui ficam os arquivos (fotos, assinatura e PDF do termo) e a passagem do
 * "Pedir material" pelo serviço de Compras.
 */
@Injectable()
export class EngenhariaService {
  private readonly logger = new Logger(EngenhariaService.name);

  constructor(
    @Inject(PrismaEngenhariaRepository) private readonly repositorio: PrismaEngenhariaRepository,
    @Inject(ArmazenamentoDeDocumentos) private readonly armazenamento: ArmazenamentoDeDocumentos,
    @Inject(ComprasService) private readonly compras: ComprasService,
    @Inject(TermoDaOrdemPdf) private readonly pdf: TermoDaOrdemPdf,
    @Inject(TarefasService) private readonly tarefas: TarefasService,
    @Inject(RELOGIO_DA_ENGENHARIA) private readonly agora: Relogio,
  ) {}

  async listar(query: ListarOrdensDeServicoQuery, principal: AuthPrincipal): Promise<ListarOrdensDeServicoResposta> {
    this.exigirAcesso(principal);
    const agora = this.agora();
    const r = await this.repositorio.lista(query, agora);
    return listarOrdensDeServicoRespostaSchema.parse({
      itens: r.linhas.map((linha) => paraResumo(linha, r.pessoas, r.clientes, agora)),
      total: r.total,
      contagens: r.contagens,
      atrasadaMaisAntigaEm: r.atrasadaMaisAntigaEm,
    });
  }

  async quadro(query: QuadroDeOrdensQuery, principal: AuthPrincipal): Promise<QuadroDeOrdensResposta> {
    this.exigirAcesso(principal);
    const agora = this.agora();
    const r = await this.repositorio.quadro(query, agora);
    const resumos = r.linhas.map((linha) => paraResumo(linha, r.pessoas, r.clientes, agora));
    return quadroDeOrdensRespostaSchema.parse({
      colunas: colunasDoQuadroDeOrdens.map((coluna) => {
        const ordens = resumos.filter((o) => o.coluna === coluna);
        return { coluna, quantidade: ordens.length, atrasadas: ordens.filter((o) => o.atrasada).length, ordens };
      }),
    });
  }

  /** O dia da Engenharia: metric cards, campo de hoje, atrasadas e as tarefas de hoje. */
  async visaoGeral(query: VisaoGeralDaEngenhariaQuery, principal: AuthPrincipal): Promise<VisaoGeralDaEngenharia> {
    const agora = this.agora();
    const [r, tarefas] = await Promise.all([
      this.repositorio.visaoGeral(query.empresa, agora),
      this.tarefas.listar("engenharia-obras", { periodo: "hoje", ...(query.empresa ? { empresa: query.empresa } : {}) }, principal),
    ]);
    const resumo = (linha: (typeof r.campoHoje)[number]) => paraResumo(linha, r.pessoas, r.clientes, agora);
    const ordem = { atrasada: 0, vence_hoje: 1, no_prazo: 2, concluida: 3 } as const;
    return visaoGeralDaEngenhariaRespostaSchema.parse({
      hoje: tarefas.hoje,
      metricas: { emAberto: r.emAberto, atrasadas: r.atrasadas, emCampoHoje: r.emCampoHoje, usinasComAtencao: null },
      campoHoje: r.campoHoje.map(resumo),
      atrasadas: { total: r.atrasadas, itens: r.maisAtrasadas.map(resumo) },
      tarefasHoje: {
        concluidas: tarefas.progresso.concluidas,
        total: tarefas.progresso.total,
        itens: [...tarefas.itens].sort((a, b) => ordem[a.situacao] - ordem[b.situacao]).slice(0, 8),
      },
      monitoramentoHoje: null,
      protocolos: null,
    });
  }

  async opcoes(principal: AuthPrincipal): Promise<OpcoesDaEngenhariaResposta> {
    this.exigirAcesso(principal);
    const [tecnicos, { linhas }] = await Promise.all([this.repositorio.tecnicos(), this.repositorio.configuracoes()]);
    const agora = this.agora();
    const prazos = this.prazosPadrao(linhas);
    return opcoesDaEngenhariaRespostaSchema.parse({
      tecnicos,
      tipos: [...tiposDeOrdemDeServico],
      prioridades: [...prioridadesDaOrdemDeServico],
      origens: [...origensDaOrdemDeServico],
      prazoSugerido: Object.fromEntries(tiposDeOrdemDeServico.map((tipo) => [tipo, prazoSugerido(agora, prazos[tipo])])),
    });
  }

  /** Configurações da Engenharia: os tipos de O.S. (as Plataformas entram com a PLU-347). */
  async configuracoes(principal: AuthPrincipal): Promise<ConfiguracoesDaEngenharia> {
    this.exigirAcesso(principal);
    const agora = this.agora();
    const { linhas, abertas, pessoas } = await this.repositorio.configuracoes();
    const prazos = this.prazosPadrao(linhas);
    const nome = (id: string | null) => (id ? { id, nome: pessoas.get(id) ?? "Pessoa sem acesso" } : null);
    return configuracoesDaEngenhariaRespostaSchema.parse({
      tipos: tiposDeOrdemDeServico.map((tipo) => {
        const linha = linhas.find((l) => l.tipo === tipo);
        return {
          tipo,
          prazoPadraoDiasUteis: prazos[tipo],
          prazoSugerido: prazoSugerido(agora, prazos[tipo]),
          agendador: nome(linha?.agendadorId ?? null),
          abertas: abertas.get(tipo) ?? 0,
          atualizado: linha ? { por: nome(linha.atualizadoPorId), em: linha.atualizadoEm.toISOString() } : null,
        };
      }),
      podeEditar: gerenteDaEngenharia(principal.acesso),
    });
  }

  async editarTipo(tipo: TipoDeOrdemDeServico, input: EditarConfiguracaoDeTipoDeOrdem, principal: AuthPrincipal): Promise<ConfiguracoesDaEngenharia> {
    this.exigirAcesso(principal);
    if (!gerenteDaEngenharia(principal.acesso)) throw new AcessoNegado("As configurações da Engenharia são do gerente do departamento.");
    await this.repositorio.editarTipo(tipo, input, principal, this.agora());
    return this.configuracoes(principal);
  }

  private prazosPadrao(linhas: { tipo: TipoDeOrdemDeServico; prazoPadraoDiasUteis: number }[]): Record<TipoDeOrdemDeServico, number> {
    return Object.fromEntries(tiposDeOrdemDeServico.map((tipo) => [tipo, linhas.find((l) => l.tipo === tipo)?.prazoPadraoDiasUteis ?? PRAZO_PADRAO_DO_TIPO[tipo]])) as Record<TipoDeOrdemDeServico, number>;
  }

  async buscarClientes(busca: string, principal: AuthPrincipal): Promise<BuscarClientesDaEngenhariaResposta> {
    this.exigirAcesso(principal);
    return buscarClientesDaEngenhariaRespostaSchema.parse({ itens: await this.repositorio.buscarClientes(busca) });
  }

  async obter(id: string, principal: AuthPrincipal): Promise<OrdemDeServico> {
    this.exigirAcesso(principal);
    const { linha, pessoas, clientes, ucs } = await this.repositorio.ficha(id);
    return ordemDeServicoSchema.parse(paraFicha(linha, pessoas, clientes, ucs, principal.acesso, this.agora()));
  }

  async criar(input: CriarOrdemDeServico, principal: AuthPrincipal): Promise<OrdemDeServico> {
    this.exigirAcesso(principal);
    return this.obter(await this.repositorio.criar(input, principal, this.agora()), principal);
  }

  async editar(id: string, input: EditarOrdemDeServico, principal: AuthPrincipal): Promise<OrdemDeServico> {
    this.exigirAcesso(principal);
    await this.repositorio.editar(id, input, principal, this.agora());
    return this.obter(id, principal);
  }

  async executarAcao(id: string, acao: AcaoDaOrdemDeServico, principal: AuthPrincipal): Promise<OrdemDeServico> {
    this.exigirAcesso(principal);
    await this.repositorio.executarAcao(id, acao, principal, this.agora());
    return this.obter(id, principal);
  }

  async enviarFoto(id: string, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<OrdemDeServico> {
    this.exigirAcesso(principal);
    // Confere antes de subir; o repositório confere de novo com a O.S. travada.
    exigirAcao(await this.repositorio.situacao(id), "enviar_foto");
    const guardado = await this.guardar(id, "fotos", this.conferir(arquivo, tiposDeFotoDaOrdem, ARQUIVO_DE_ORDEM_MAX_BYTES, "Envie uma foto JPEG ou PNG."));
    await this.registrarOuDescartar([guardado], () => this.repositorio.registrarFoto(id, guardado, principal, this.agora()));
    return this.obter(id, principal);
  }

  /**
   * Termo na tela do técnico: desenhado (PNG em `assinatura`) ou com o nome
   * digitado. Gera o PDF com a ficha e conclui a O.S.
   */
  async colherTermo(id: string, dados: ColherTermo, assinatura: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<OrdemDeServico> {
    this.exigirAcesso(principal);
    if (dados.modo === "desenhada" && !assinatura) {
      throw new RequisicaoInvalida("Envie a assinatura desenhada.", [{ campo: "assinatura", problema: "Desenhe a assinatura na tela." }]);
    }
    if (dados.modo === "nome_digitado" && assinatura) {
      throw new RequisicaoInvalida("Com o nome digitado, não há desenho.", [{ campo: "assinatura", problema: "Envie o desenho só no modo desenhada." }]);
    }
    const ficha = await this.obter(id, principal);
    exigirAcao(ficha.situacao, "colher_termo");
    const png = assinatura ? this.conferir(assinatura, ["image/png"], ASSINATURA_MAX_BYTES, "A assinatura precisa ser um PNG.") : null;
    const assinadoEm = this.agora();
    let documentoPdf: Buffer;
    try {
      documentoPdf = await this.pdf.render({ ordem: ficha, modo: dados.modo, nome: dados.nome, documento: dados.documento, assinatura: png?.buffer ?? null, assinadoEm });
    } catch {
      throw new ArquivoRecusado("Não foi possível ler a assinatura desenhada.");
    }
    const guardados: ArquivoGuardado[] = [];
    if (png) guardados.push(await this.guardar(id, "assinaturas", png));
    const pdf = await this.guardar(id, "termos", { buffer: documentoPdf, nome: `termo-${ficha.codigo}.pdf`, tipo: "application/pdf" });
    guardados.push(pdf);
    await this.registrarOuDescartar(guardados, () =>
      this.repositorio.registrarTermo(id, { modo: dados.modo, nome: dados.nome, documento: dados.documento }, { assinatura: png ? guardados[0]! : null, pdf }, principal, assinadoEm),
    );
    return this.obter(id, principal);
  }

  /** Alternativa ao termo na tela: o PDF assinado à parte. */
  async anexarTermoAssinado(id: string, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<OrdemDeServico> {
    this.exigirAcesso(principal);
    exigirAcao(await this.repositorio.situacao(id), "colher_termo");
    const guardado = await this.guardar(id, "termos", this.conferir(arquivo, ["application/pdf"], ARQUIVO_DE_ORDEM_MAX_BYTES, "Envie o termo assinado em PDF."));
    await this.registrarOuDescartar([guardado], () =>
      this.repositorio.registrarTermo(id, { modo: "pdf_externo", nome: null, documento: null }, { assinatura: null, pdf: guardado }, principal, this.agora()),
    );
    return this.obter(id, principal);
  }

  /** Cria o pedido de compra em Suprimentos com a origem na O.S. (PLU-327) e o vínculo na ficha. */
  async pedirMaterial(id: string, input: PedirMaterial, principal: AuthPrincipal): Promise<OrdemDeServico> {
    this.exigirAcesso(principal);
    await this.repositorio.pedirMaterial(id, principal, this.agora(), (ordem) => {
      const pedido = criarPedidoDeCompraSchema.parse({
        empresa: ordem.companyId,
        titulo: input.titulo ?? `Material da ${codigoDaOrdemDeServico(ordem.numero)}`,
        descricao: input.descricao ?? null,
        destino: "cliente",
        clientId: ordem.clientId,
        itens: input.itens,
        prazoEntregaDesejado: input.prazoEntregaDesejado,
      });
      return this.compras.criarDaOrdemDeServico(pedido, ordem.id, principal);
    });
    return this.obter(id, principal);
  }

  async baixarArquivo(id: string, arquivoId: string, principal: AuthPrincipal): Promise<ArquivoParaBaixar> {
    this.exigirAcesso(principal);
    return this.abrir(await this.repositorio.arquivo(id, arquivoId));
  }

  async baixarTermo(id: string, principal: AuthPrincipal): Promise<ArquivoParaBaixar> {
    this.exigirAcesso(principal);
    return this.abrir(await this.repositorio.pdfDoTermo(id));
  }

  // ------------------------------------------------------------ apoio

  private exigirAcesso(principal: AuthPrincipal): void {
    if (!operaOrdens(principal.acesso)) throw new AcessoNegado("Você não tem acesso às ordens de serviço.");
  }

  /** Tipo conferido pelo conteúdo, nunca pela extensão nem pelo tipo que o navegador declarou. */
  private conferir(arquivo: ArquivoRecebido | undefined, tipos: readonly string[], limite: number, mensagem: string): { buffer: Buffer; nome: string; tipo: string } {
    if (!arquivo) throw new RequisicaoInvalida("Envie o arquivo.", [{ campo: "arquivo", problema: mensagem }]);
    if (arquivo.buffer.length === 0) throw new TipoNaoPermitido("O arquivo está vazio.");
    if (arquivo.buffer.length > limite) throw new LimiteExcedido(`O arquivo é maior que o limite de ${Math.round(limite / 1024 / 1024) || 1} MiB.`, "ARQUIVO_GRANDE_DEMAIS");
    const deteccao = detectarTipo(arquivo.buffer);
    if (deteccao.status === "arquivo_recusado") throw new ArquivoRecusado("O arquivo está corrompido ou truncado.");
    if (deteccao.status !== "aceito" || !tipos.includes(deteccao.tipo)) throw new TipoNaoPermitido(mensagem);
    return { buffer: arquivo.buffer, nome: arquivo.nomeOriginal.trim().slice(0, 200) || "arquivo", tipo: deteccao.tipo };
  }

  private async guardar(ordemId: string, pasta: Pasta, arquivo: { buffer: Buffer; nome: string; tipo: string }): Promise<ArquivoGuardado> {
    const chave = `engenharia/ordens-de-servico/${ordemId}/${pasta}/${randomUUID()}-${nomeSeguro(arquivo.nome)}`;
    await this.armazenamento.enviar(chave, arquivo.buffer, arquivo.tipo);
    return { chave, nome: arquivo.nome, tamanho: arquivo.buffer.length, tipo: arquivo.tipo };
  }

  /** Se a gravação falha, remove os arquivos recém-enviados (nunca um já registrado). */
  private async registrarOuDescartar(guardados: ArquivoGuardado[], registrar: () => Promise<void>): Promise<void> {
    try {
      await registrar();
    } catch (erro) {
      for (const guardado of guardados) {
        try {
          await this.armazenamento.excluir(guardado.chave);
        } catch {
          this.logger.warn("arquivo da ordem de serviço não pôde ser removido do armazenamento");
        }
      }
      throw erro;
    }
  }

  private async abrir(arquivo: ArquivoGuardado): Promise<ArquivoParaBaixar> {
    const { objeto, cliente } = await this.armazenamento.ler(arquivo.chave);
    return { arquivo, stream: objeto.corpo, encerrar: () => cliente.destroy() };
  }
}

/** Hoje (0) ou o fim do n-ésimo dia útil a partir de hoje (feriado conta como dia útil). */
function prazoSugerido(agora: Date, diasUteis: number): string {
  return diasUteis === 0 ? diaEmManaus(agora) : diaEmManaus(adicionarDiasUteis(agora, diasUteis));
}


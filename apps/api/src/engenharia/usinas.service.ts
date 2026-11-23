import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  PRAZO_PADRAO_DO_TIPO,
  LINHAS_DA_PLANILHA_MAX,
  PLANILHA_DE_USINAS_MAX_BYTES,
  PRINT_DA_CONFERENCIA_MAX_BYTES,
  importacaoDeUsinasSchema,
  type ImportacaoDeUsinas,
  type ImportarUsinas,
  listarPlataformasRespostaSchema,
  listarUsinasRespostaSchema,
  monitoramentoDoDiaSchema,
  tiposDePrintDaConferencia,
  usinaSchema,
  type CardDePlataforma,
  type CompanyKey,
  type ConferirPlataforma,
  type CriarPlataforma,
  type CriarUsina,
  type EditarPlataforma,
  type EditarUsina,
  type ListarPlataformasResposta,
  type ListarUsinasQuery,
  type ListarUsinasResposta,
  type MonitoramentoDaVisaoGeral,
  type MonitoramentoDoDia,
  type Usina,
  type UsinaResumo,
  codigoDaOrdemDeServico,
  criarOrdemDeServicoSchema,
} from "@plugga/shared";

import { AcessoNegado, ArquivoRecusado, LimiteExcedido, RequisicaoInvalida, TipoNaoPermitido } from "../common/errors/dominio";
import { adicionarDiasUteis, diaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { detectarTipo } from "../lead-documentos/deteccao-de-tipo";
import { nomeSeguro } from "../lead-documentos/lead-documentos.rules";
import { TarefasService } from "../tarefas/tarefas.service";
import { RELOGIO_DA_ENGENHARIA, type Relogio } from "./engenharia.service";
import { lerCsv, lerLinhas, normalizarLinha } from "./importacao-de-usinas";
import { PrismaEngenhariaRepository } from "./prisma-engenharia.repository";
import { PrismaUsinasRepository, type ArquivoGuardado, type LinhaDaUsina, type LinhaDoResultado, type Nomes } from "./prisma-usinas.repository";
import {
  conferirObservacaoDeAcesso,
  daEngenharia,
  gerenteDasUsinas,
  kwpCurto,
  operaUsinas,
  ordenarCards,
  podeAbrirOs,
  somarKwp,
  tipoDaOrdemDaExcecao,
} from "./usinas.rules";

export type ArquivoRecebido = { buffer: Buffer; nomeOriginal: string };
export type ArquivoParaBaixar = { arquivo: ArquivoGuardado; stream: NodeJS.ReadableStream; encerrar: () => void };

const pessoa = (id: string | null, nomes: Nomes) => (id ? { id, nome: nomes.get(id) ?? "Pessoa sem acesso" } : null);

/**
 * Usinas, plataformas e o monitoramento do dia (PLU-347). Lê quem é da
 * Engenharia; cadastra e confere quem tem a tela de Usinas; plataformas só o
 * gerente. A anomalia abre a O.S. pelo repositório das O.S., na mesma transação.
 */
@Injectable()
export class UsinasService {
  private readonly logger = new Logger(UsinasService.name);

  constructor(
    @Inject(PrismaUsinasRepository) private readonly repositorio: PrismaUsinasRepository,
    @Inject(PrismaEngenhariaRepository) private readonly ordens: PrismaEngenhariaRepository,
    @Inject(ArmazenamentoDeDocumentos) private readonly armazenamento: ArmazenamentoDeDocumentos,
    @Inject(TarefasService) private readonly tarefas: TarefasService,
    @Inject(RELOGIO_DA_ENGENHARIA) private readonly agora: Relogio,
  ) {}

  // ------------------------------------------------------------ plataformas

  async plataformas(principal: AuthPrincipal): Promise<ListarPlataformasResposta> {
    this.exigirLeitura(principal);
    const linhas = await this.repositorio.plataformas();
    return listarPlataformasRespostaSchema.parse({
      itens: linhas.map((p) => ({ id: p.id, nome: p.nome, observacaoDeAcesso: p.observacaoDeAcesso, ativa: p.ativa, usinas: p.usinas, potenciaKwp: somarKwp(p.potencias) })),
      podeEditar: gerenteDasUsinas(principal.acesso),
    });
  }

  async criarPlataforma(input: CriarPlataforma, principal: AuthPrincipal): Promise<ListarPlataformasResposta> {
    this.exigirGerente(principal);
    conferirObservacaoDeAcesso(input.observacaoDeAcesso);
    await this.repositorio.criarPlataforma(input, principal);
    return this.plataformas(principal);
  }

  async editarPlataforma(id: string, input: EditarPlataforma, principal: AuthPrincipal): Promise<ListarPlataformasResposta> {
    this.exigirGerente(principal);
    conferirObservacaoDeAcesso(input.observacaoDeAcesso);
    await this.repositorio.editarPlataforma(id, input, principal);
    return this.plataformas(principal);
  }

  // ------------------------------------------------------------ usinas

  async usinas(query: ListarUsinasQuery, principal: AuthPrincipal): Promise<ListarUsinasResposta> {
    this.exigirLeitura(principal);
    const r = await this.repositorio.usinas(query);
    return listarUsinasRespostaSchema.parse({
      itens: r.linhas.map((l) => this.resumo(l, r.ultimos.get(l.id) ?? null, r.clientes, r.ucs, r.pessoas)),
      total: r.total,
    });
  }

  async usina(id: string, principal: AuthPrincipal): Promise<Usina> {
    this.exigirLeitura(principal);
    const r = await this.repositorio.ficha(id, this.agora());
    const acoes: ("editar" | "abrir_os")[] = [];
    if (operaUsinas(principal.acesso)) acoes.push("editar");
    if (podeAbrirOs(principal.acesso) && r.linha.ativa) acoes.push("abrir_os");
    return usinaSchema.parse({
      ...this.resumo(r.linha, r.ultimo, r.clientes, r.ucs, r.pessoas),
      comissionadaEm: diaEmManaus(r.linha.comissionadaEm),
      garantiaAte: r.linha.garantiaAte ? diaEmManaus(r.linha.garantiaAte) : null,
      origem: r.linha.origem,
      monitoramento: r.historico.map((h) => this.monitoramento(h, r.pessoas)),
      ordens: r.ordens.map((o) => ({ id: o.id, codigo: codigoDaOrdemDeServico(o.numero), tipo: o.tipo, situacao: o.situacao, descricao: o.descricao, createdAt: o.createdAt.toISOString() })),
      protocolos: null,
      criada: { por: pessoa(r.linha.criadoPorId, r.pessoas), em: r.linha.createdAt.toISOString() },
      acoesPermitidas: acoes,
    });
  }

  async criarUsina(input: CriarUsina, principal: AuthPrincipal): Promise<Usina> {
    this.exigirOperacao(principal);
    return this.usina(await this.repositorio.criarUsina(input, principal, this.agora()), principal);
  }

  async editarUsina(id: string, input: EditarUsina, principal: AuthPrincipal): Promise<Usina> {
    this.exigirOperacao(principal);
    await this.repositorio.editarUsina(id, input, principal, this.agora());
    return this.usina(id, principal);
  }

  /**
   * Importa a planilha de levantamento (E3): sem `gravar`, só confere e devolve o
   * que casou; com `gravar`, cria as prontas. A planilha fica só em memória: não é
   * guardada, não vai para log nem para evento.
   */
  async importar(dados: ImportarUsinas, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<ImportacaoDeUsinas> {
    this.exigirOperacao(principal);
    if (!arquivo || arquivo.buffer.length === 0) throw new RequisicaoInvalida("Envie a planilha em CSV.", [{ campo: "arquivo", problema: "Exporte a planilha como CSV." }]);
    if (arquivo.buffer.length > PLANILHA_DE_USINAS_MAX_BYTES) throw new LimiteExcedido("A planilha é maior que o limite de 2 MiB.", "ARQUIVO_GRANDE_DEMAIS");
    if (arquivo.buffer.includes(0)) throw new TipoNaoPermitido("Envie a planilha exportada como CSV, não o arquivo do Excel.");
    const { linhas, faltando } = lerLinhas(lerCsv(arquivo.buffer.toString("utf8")), dados.mapeamento);
    if (faltando.length > 0) {
      throw new RequisicaoInvalida("A planilha não tem as colunas obrigatórias.", faltando.map((campo) => ({ campo: `mapeamento.${campo}`, problema: "Diga qual coluna da planilha tem este dado." })));
    }
    if (linhas.length === 0) throw new RequisicaoInvalida("A planilha não tem linhas.", [{ campo: "arquivo", problema: "Confira o arquivo." }]);
    if (linhas.length > LINHAS_DA_PLANILHA_MAX) throw new LimiteExcedido(`A planilha passa de ${LINHAS_DA_PLANILHA_MAX} linhas.`, "ARQUIVO_GRANDE_DEMAIS");
    const agora = this.agora();
    const hoje = diaEmManaus(agora);
    const normalizadas = linhas.map((l) => normalizarLinha(l, dados.empresaPadrao, hoje));
    return importacaoDeUsinasSchema.parse(await this.repositorio.importar(normalizadas, dados.gravar === "sim", principal, agora));
  }

  // ------------------------------------------------------------ monitoramento

  async monitoramentoDoDia(empresa: CompanyKey | undefined, principal: AuthPrincipal): Promise<MonitoramentoDoDia> {
    this.exigirLeitura(principal);
    const hoje = diaEmManaus(this.agora());
    const r = await this.repositorio.monitoramento(empresa, hoje);
    const grupos = new Map<string, { plataforma: { id: string; nome: string; ordem: number }; empresa: CompanyKey; usinas: typeof r.usinas }>();
    for (const u of r.usinas) {
      const chave = `${u.plataforma.id}|${u.companyId}`;
      const grupo = grupos.get(chave) ?? { plataforma: u.plataforma, empresa: u.companyId as CompanyKey, usinas: [] };
      grupo.usinas.push(u);
      grupos.set(chave, grupo);
    }
    const nomeDaUsina = new Map(r.usinas.map((u) => [u.id, u.nome]));
    let normais = 0;
    let anomalias = 0;
    let semComunicacao = 0;
    const cards = [...grupos.values()].map((g) => {
      const c = r.conferencias.find((x) => x.plataformaId === g.plataforma.id && x.companyId === g.empresa) ?? null;
      const excecoes = (c?.resultados ?? []).filter((x) => x.situacao !== "normal");
      if (c) {
        normais += c.resultados.length - excecoes.length;
        anomalias += excecoes.filter((x) => x.situacao === "anomalia").length;
        semComunicacao += excecoes.filter((x) => x.situacao === "sem_comunicacao").length;
      }
      const card: CardDePlataforma & { ordem: number } = {
        ordem: g.plataforma.ordem,
        plataforma: { id: g.plataforma.id, nome: g.plataforma.nome },
        empresa: g.empresa,
        usinas: g.usinas.map((u) => ({ id: u.id, nome: u.nome, cliente: r.clientes.get(u.clientId) ?? "Cliente", potenciaKwp: kwpCurto(u.potenciaKwp), fabricante: u.fabricante })),
        conferencia: c
          ? {
              id: c.id,
              conferida: { por: pessoa(c.conferidaPorId, r.pessoas), em: c.conferidaEm.toISOString() },
              print: { id: c.id, nome: c.printNome, tamanhoBytes: c.printTamanho, mime: c.printTipo, url: `/engenharia/monitoramento/conferencias/${c.id}/print` },
              normais: c.resultados.length - excecoes.length,
              excecoes: excecoes.map((x) => ({
                usinaId: x.usinaId,
                usina: nomeDaUsina.get(x.usinaId) ?? "Usina",
                situacao: x.situacao as "anomalia" | "sem_comunicacao",
                nota: x.nota,
                ordem: x.ordemDeServico ? { id: x.ordemDeServico.id, codigo: codigoDaOrdemDeServico(x.ordemDeServico.numero) } : null,
              })),
            }
          : null,
      };
      return card;
    });
    return monitoramentoDoDiaSchema.parse({
      hoje,
      resumo: { conferidas: cards.filter((c) => c.conferencia).length, total: cards.length, usinas: r.usinas.length, normais, anomalias, semComunicacao },
      cards: ordenarCards(cards),
      podeConferir: operaUsinas(principal.acesso),
      podeAbrirOs: podeAbrirOs(principal.acesso),
    });
  }

  /**
   * Confere a plataforma para a empresa: guarda o print (isolado por empresa),
   * grava os resultados e abre as O.S. pedidas. Com todas as plataformas do dia
   * conferidas, conclui a tarefa automática do monitoramento.
   */
  async conferir(plataformaId: string, dados: ConferirPlataforma, print: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<MonitoramentoDoDia> {
    this.exigirOperacao(principal);
    if (dados.resultados.some((r) => r.abrirOs) && !podeAbrirOs(principal.acesso)) {
      throw new AcessoNegado("Abrir a O.S. pede acesso às ordens de serviço. Registre a anomalia sem abrir a O.S.");
    }
    const agora = this.agora();
    const hoje = diaEmManaus(agora);
    const guardado = await this.guardarPrint(dados.empresa, plataformaId, hoje, print);
    try {
      await this.repositorio.conferir(
        { plataformaId, empresa: dados.empresa, dia: hoje, resultados: dados.resultados.map((r) => ({ usinaId: r.usinaId, situacao: r.situacao, nota: r.nota ?? null, abrirOs: r.abrirOs === true })), print: guardado },
        principal,
        agora,
        (usina, excecao) => {
          const tipo = tipoDaOrdemDaExcecao(excecao.situacao);
          const prazo = PRAZO_PADRAO_DO_TIPO[tipo];
          return this.ordens.criar(criarOrdemDeServicoSchema.parse({
            empresa: dados.empresa,
            tipo,
            clienteId: usina.clientId,
            ucId: usina.consumerUnitId,
            usinaId: usina.id,
            local: usina.nome,
            descricao: excecao.nota,
            origem: "monitoramento",
            prazo: prazo === 0 ? hoje : diaEmManaus(adicionarDiasUteis(agora, prazo)),
            equipamento: "Inversor",
            fabricante: usina.fabricante,
            modelo: usina.modelo,
            numeroSerie: usina.numeroSerie,
          }), principal, agora);
        },
      );
    } catch (erro) {
      await this.descartar(guardado.chave);
      throw erro;
    }
    await this.concluirMonitoramentoSeCompleto(hoje, principal);
    return this.monitoramentoDoDia(dados.empresa, principal);
  }

  async baixarPrint(conferenciaId: string, principal: AuthPrincipal): Promise<ArquivoParaBaixar> {
    this.exigirLeitura(principal);
    const arquivo = await this.repositorio.printDaConferencia(conferenciaId);
    const { objeto, cliente } = await this.armazenamento.ler(arquivo.chave);
    return { arquivo, stream: objeto.corpo, encerrar: () => cliente.destroy() };
  }

  /** Para a Visão geral: o monitoramento de hoje e as usinas com atenção. */
  async resumoDaVisaoGeral(empresa: CompanyKey | undefined): Promise<{ monitoramento: MonitoramentoDaVisaoGeral; usinasComAtencao: number }> {
    const r = await this.repositorio.resumoDoDia(empresa, diaEmManaus(this.agora()));
    return { monitoramento: { conferidas: r.conferidas, total: r.total, pendentes: r.pendentes as MonitoramentoDaVisaoGeral["pendentes"] }, usinasComAtencao: r.usinasComAtencao };
  }

  // ------------------------------------------------------------ apoio

  private resumo(l: LinhaDaUsina, ultimo: LinhaDoResultado | null, clientes: Nomes, ucs: Map<string, { codigo: string; distribuidora: string }>, pessoas: Nomes): UsinaResumo {
    const uc = ucs.get(l.consumerUnitId);
    return {
      id: l.id,
      nome: l.nome,
      empresa: l.companyId as CompanyKey,
      cliente: { id: l.clientId, nome: clientes.get(l.clientId) ?? "Cliente" },
      uc: { id: l.consumerUnitId, codigo: uc?.codigo ?? "—", distribuidora: uc?.distribuidora ?? "—" },
      plataforma: { id: l.plataforma.id, nome: l.plataforma.nome },
      potenciaKwp: kwpCurto(l.potenciaKwp.toString()),
      fabricante: l.fabricante,
      modelo: l.modelo,
      numeroSerie: l.numeroSerie,
      ativa: l.ativa,
      ultimoMonitoramento: ultimo ? this.monitoramento(ultimo, pessoas) : null,
      osAbertas: l._count.ordensDeServico,
    };
  }

  private monitoramento(h: LinhaDoResultado, pessoas: Nomes) {
    return {
      dia: diaEmManaus(h.conferencia.dia),
      situacao: h.situacao,
      nota: h.nota,
      conferido: { por: pessoa(h.conferencia.conferidaPorId, pessoas), em: h.conferencia.conferidaEm.toISOString() },
      ordem: h.ordemDeServico ? { id: h.ordemDeServico.id, codigo: codigoDaOrdemDeServico(h.ordemDeServico.numero) } : null,
    };
  }

  /** Todas as (plataforma, empresa) com usina ativa conferidas hoje: a tarefa automática se conclui. */
  private async concluirMonitoramentoSeCompleto(hoje: string, principal: AuthPrincipal): Promise<void> {
    const r = await this.repositorio.resumoDoDia(undefined, hoje);
    if (r.total > 0 && r.conferidas === r.total) {
      try {
        await this.tarefas.concluirAutomatica("engenharia-obras", "engenharia.monitoramento_do_dia", hoje, principal);
      } catch {
        // A conferência já está gravada; a tarefa conclui na próxima conferência ou fica para o dia.
        this.logger.warn("a tarefa automática do monitoramento não pôde ser concluída agora");
      }
    }
  }

  private exigirLeitura(principal: AuthPrincipal): void {
    if (!daEngenharia(principal.acesso)) throw new AcessoNegado("Você não tem acesso às usinas.");
  }

  private exigirOperacao(principal: AuthPrincipal): void {
    if (!operaUsinas(principal.acesso)) throw new AcessoNegado("Cadastrar e conferir usinas é de quem tem a tela de Usinas.");
  }

  private exigirGerente(principal: AuthPrincipal): void {
    if (!gerenteDasUsinas(principal.acesso)) throw new AcessoNegado("As plataformas são do gerente da Engenharia.");
  }

  /** Print da plataforma: imagem ou PDF pelo conteúdo, guardado sob a empresa (pode mostrar dados de cliente). */
  private async guardarPrint(empresa: CompanyKey, plataformaId: string, dia: string, arquivo: ArquivoRecebido | undefined): Promise<ArquivoGuardado> {
    if (!arquivo) throw new RequisicaoInvalida("Anexe o print da plataforma.", [{ campo: "print", problema: "O print é obrigatório." }]);
    if (arquivo.buffer.length === 0) throw new TipoNaoPermitido("O arquivo está vazio.");
    if (arquivo.buffer.length > PRINT_DA_CONFERENCIA_MAX_BYTES) throw new LimiteExcedido("O arquivo é maior que o limite de 25 MiB.", "ARQUIVO_GRANDE_DEMAIS");
    const deteccao = detectarTipo(arquivo.buffer);
    if (deteccao.status === "arquivo_recusado") throw new ArquivoRecusado("O arquivo está corrompido ou truncado.");
    if (deteccao.status !== "aceito" || !(tiposDePrintDaConferencia as readonly string[]).includes(deteccao.tipo)) throw new TipoNaoPermitido("Envie uma imagem (JPEG ou PNG) ou um PDF.");
    const nome = arquivo.nomeOriginal.trim().slice(0, 200) || "print";
    const chave = `engenharia/monitoramento/${empresa}/${plataformaId}/${dia}/${randomUUID()}-${nomeSeguro(nome)}`;
    await this.armazenamento.enviar(chave, arquivo.buffer, deteccao.tipo);
    return { chave, nome, tamanho: arquivo.buffer.length, tipo: deteccao.tipo };
  }

  private async descartar(chave: string): Promise<void> {
    try {
      await this.armazenamento.excluir(chave);
    } catch {
      this.logger.warn("print da conferência não pôde ser removido do armazenamento");
    }
  }
}

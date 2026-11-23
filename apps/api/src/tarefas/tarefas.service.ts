import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  EVIDENCIA_DE_TAREFA_MAX_BYTES,
  colunasDoKanbanDeTarefas,
  listarTarefasRespostaSchema,
  ocorrenciaDeTarefaSchema,
  opcoesDeTarefasRespostaSchema,
  periodosDeTarefas,
  tarefaSchema,
  tiposDeEvidenciaDeTarefa,
  type AutomacaoDeTarefa,
  type ConcluirOcorrencia,
  type CriarTarefa,
  type DepartamentoComTarefas,
  type ListarTarefasQuery,
  type ListarTarefasResposta,
  type OcorrenciaDeTarefa,
  type OpcoesDeTarefasResposta,
  type Tarefa,
} from "@plugga/shared";

import { AcessoNegado, ArquivoRecusado, EstadoInvalido, LimiteExcedido, NaoEncontrado, TipoNaoPermitido } from "../common/errors/dominio";
import { diaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { detectarTipo } from "../lead-documentos/deteccao-de-tipo";
import { nomeSeguro } from "../lead-documentos/lead-documentos.rules";
import { PrismaTarefasRepository, type ArquivoGuardado } from "./prisma-tarefas.repository";
import { paraOcorrencia, paraTarefa } from "./tarefas.mapeamento";
import { PORTAO_DO_DEPARTAMENTO, acoesPermitidas, conferirConclusao, noDepartamento, noPeriodo } from "./tarefas.rules";

export const RELOGIO_DAS_TAREFAS = Symbol("RELOGIO_DAS_TAREFAS");
export type Relogio = () => Date;

export type ArquivoRecebido = { buffer: Buffer; nomeOriginal: string };
export type ArquivoParaBaixar = { arquivo: ArquivoGuardado; stream: NodeJS.ReadableStream; encerrar: () => void };

/**
 * Tarefas dos departamentos (PLU-349, PLU-340): um só serviço para Financeiro,
 * Engenharia e Energia. Cada departamento respeita o próprio portão; quem é do
 * departamento vê, cria e conclui; encerrar é de quem criou ou do gerente.
 */
@Injectable()
export class TarefasService {
  private readonly logger = new Logger(TarefasService.name);

  constructor(
    @Inject(PrismaTarefasRepository) private readonly repositorio: PrismaTarefasRepository,
    @Inject(ArmazenamentoDeDocumentos) private readonly armazenamento: ArmazenamentoDeDocumentos,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RELOGIO_DAS_TAREFAS) private readonly agora: Relogio,
  ) {}

  async listar(departamento: DepartamentoComTarefas, query: ListarTarefasQuery, principal: AuthPrincipal): Promise<ListarTarefasResposta> {
    this.exigir(departamento, principal);
    const agora = this.agora();
    const hoje = diaEmManaus(agora);
    const { linhas, pessoas } = await this.repositorio.lista(departamento, query, agora);
    const todas = linhas.map((l) => paraOcorrencia(l, pessoas, principal.acesso, principal.id, agora));
    const no = (periodo: (typeof periodosDeTarefas)[number]) => todas.filter((o) => noPeriodo(periodo, o.dia, o.situacao, hoje));
    const itens = no(query.periodo);
    const porColuna = Object.fromEntries(colunasDoKanbanDeTarefas.map((c) => [c, itens.filter((o) => o.coluna === c).length])) as Record<(typeof colunasDoKanbanDeTarefas)[number], number>;
    return listarTarefasRespostaSchema.parse({
      hoje,
      itens,
      progresso: { concluidas: porColuna.concluidas, total: itens.length },
      contagens: {
        periodos: Object.fromEntries(periodosDeTarefas.map((p) => [p, no(p).length])),
        colunas: porColuna,
      },
    });
  }

  async opcoes(departamento: DepartamentoComTarefas, principal: AuthPrincipal): Promise<OpcoesDeTarefasResposta> {
    this.exigir(departamento, principal);
    return opcoesDeTarefasRespostaSchema.parse({ ...(await this.repositorio.opcoes(departamento)), podeCriar: true });
  }

  async obter(departamento: DepartamentoComTarefas, id: string, principal: AuthPrincipal): Promise<Tarefa> {
    this.exigir(departamento, principal);
    const { linha, pessoas } = await this.repositorio.tarefa(departamento, id);
    return tarefaSchema.parse(paraTarefa(linha, pessoas, this.agora()));
  }

  async criar(departamento: DepartamentoComTarefas, input: CriarTarefa, principal: AuthPrincipal): Promise<Tarefa> {
    this.exigir(departamento, principal);
    return this.obter(departamento, await this.repositorio.criar(departamento, input, principal, this.agora()), principal);
  }

  async encerrar(departamento: DepartamentoComTarefas, id: string, motivo: string, principal: AuthPrincipal): Promise<Tarefa> {
    this.exigir(departamento, principal);
    const { linha } = await this.repositorio.tarefa(departamento, id);
    const acoes = acoesPermitidas({
      departamento,
      acesso: principal.acesso,
      principalId: principal.id,
      hoje: diaEmManaus(this.agora()),
      tarefa: { origem: linha.origem, criadoPorId: linha.criadoPorId, encerrada: linha.encerradaEm !== null, automacao: linha.automacao },
    });
    if (linha.encerradaEm) throw new EstadoInvalido("A tarefa já foi encerrada.");
    if (!acoes.includes("encerrar")) throw new AcessoNegado("Encerrar é de quem criou a tarefa ou do gerente do departamento.");
    await this.repositorio.encerrar(departamento, id, motivo, principal, this.agora());
    return this.obter(departamento, id, principal);
  }

  async concluir(departamento: DepartamentoComTarefas, id: string, dados: ConcluirOcorrencia, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<OcorrenciaDeTarefa> {
    this.exigir(departamento, principal);
    const agora = this.agora();
    const { linha } = await this.repositorio.ocorrencia(departamento, id);
    // Confere antes de subir o arquivo; o repositório confere de novo com a ocorrência travada.
    const conferir = (atual: typeof linha) => {
      const acoes = acoesPermitidas({
        departamento,
        acesso: principal.acesso,
        principalId: principal.id,
        hoje: diaEmManaus(agora),
        tarefa: { origem: atual.tarefa.origem, criadoPorId: atual.tarefa.criadoPorId, encerrada: atual.tarefa.encerradaEm !== null, automacao: atual.tarefa.automacao },
        ocorrencia: { dia: diaEmManaus(atual.dia), concluida: atual.concluidaEm !== null, cancelada: atual.canceladaEm !== null },
      });
      if (atual.concluidaEm) throw new EstadoInvalido("A tarefa já foi concluída.");
      if (atual.tarefa.automacao) throw new EstadoInvalido("Esta tarefa se conclui sozinha quando o trabalho é feito na tela dela.");
      if (!acoes.includes("concluir")) throw new EstadoInvalido("Esta tarefa ainda não pode ser concluída.");
      conferirConclusao(
        { evidencia: atual.tarefa.exigeEvidencia, resultado: atual.tarefa.exigeResultado, instrucoes: atual.tarefa.instrucoes.length },
        { resultado: dados.resultado ?? null, temEvidencia: arquivo !== undefined, checklist: dados.checklist },
      );
    };
    conferir(linha);
    const evidencia = arquivo ? await this.guardar(departamento, linha.tarefaId, id, arquivo) : null;
    try {
      await this.repositorio.concluir(departamento, id, { resultado: dados.resultado ?? null, checklist: dados.checklist, evidencia }, principal, agora, conferir);
    } catch (erro) {
      if (evidencia) await this.descartar(evidencia.chave);
      throw erro;
    }
    const atual = await this.repositorio.ocorrencia(departamento, id);
    return ocorrenciaDeTarefaSchema.parse(paraOcorrencia(atual.linha, atual.pessoas, principal.acesso, principal.id, agora));
  }

  /** Para os outros módulos: conclui as ocorrências do dia da tarefa automática. */
  concluirAutomatica(departamento: DepartamentoComTarefas, automacao: AutomacaoDeTarefa, dia: string, principal: AuthPrincipal): Promise<number> {
    return this.repositorio.concluirAutomatica(departamento, automacao, dia, principal, this.agora());
  }

  async baixarEvidencia(departamento: DepartamentoComTarefas, ocorrenciaId: string, evidenciaId: string, principal: AuthPrincipal): Promise<ArquivoParaBaixar> {
    this.exigir(departamento, principal);
    const arquivo = await this.repositorio.evidencia(departamento, ocorrenciaId, evidenciaId);
    const { objeto, cliente } = await this.armazenamento.ler(arquivo.chave);
    return { arquivo, stream: objeto.corpo, encerrar: () => cliente.destroy() };
  }

  // ------------------------------------------------------------ apoio

  /** Portão do departamento (404, como se não existisse) e acesso ao departamento. */
  private exigir(departamento: DepartamentoComTarefas, principal: AuthPrincipal): void {
    const portao = PORTAO_DO_DEPARTAMENTO[departamento];
    if (portao && this.config.get<boolean>(portao) !== true) throw new NaoEncontrado("Não encontrado.");
    if (!noDepartamento(principal.acesso, departamento)) throw new AcessoNegado("Você não tem acesso às tarefas deste departamento.");
  }

  /** Print, foto ou PDF, conferido pelo conteúdo. */
  private async guardar(departamento: DepartamentoComTarefas, tarefaId: string, ocorrenciaId: string, arquivo: ArquivoRecebido): Promise<ArquivoGuardado> {
    if (arquivo.buffer.length === 0) throw new TipoNaoPermitido("O arquivo está vazio.");
    if (arquivo.buffer.length > EVIDENCIA_DE_TAREFA_MAX_BYTES) throw new LimiteExcedido("O arquivo é maior que o limite de 25 MiB.", "ARQUIVO_GRANDE_DEMAIS");
    const deteccao = detectarTipo(arquivo.buffer);
    if (deteccao.status === "arquivo_recusado") throw new ArquivoRecusado("O arquivo está corrompido ou truncado.");
    if (deteccao.status !== "aceito" || !(tiposDeEvidenciaDeTarefa as readonly string[]).includes(deteccao.tipo)) throw new TipoNaoPermitido("Envie um PDF, JPEG ou PNG.");
    const nome = arquivo.nomeOriginal.trim().slice(0, 200) || "evidencia";
    const chave = `tarefas/${departamento}/${tarefaId}/${ocorrenciaId}/${randomUUID()}-${nomeSeguro(nome)}`;
    await this.armazenamento.enviar(chave, arquivo.buffer, deteccao.tipo);
    return { chave, nome, tamanho: arquivo.buffer.length, tipo: deteccao.tipo };
  }

  private async descartar(chave: string): Promise<void> {
    try {
      await this.armazenamento.excluir(chave);
    } catch {
      this.logger.warn("evidência da tarefa não pôde ser removida do armazenamento");
    }
  }
}

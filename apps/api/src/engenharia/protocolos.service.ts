import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  clientesParaProtocoloRespostaSchema,
  listarDistribuidorasRespostaSchema,
  listarProtocolosRespostaSchema,
  opcoesDosProtocolosRespostaSchema,
  protocoloDaUcSchema,
  protocoloEncerrado,
  protocoloSchema,
  situacoesDoProtocolo,
  tiposDeProtocolo,
  type ClientesParaProtocoloResposta,
  type CompanyKey,
  type CriarDistribuidora,
  type CriarProtocolo,
  type DepartamentoDoProtocolo,
  type EditarDistribuidora,
  type EditarProtocolo,
  type ListarDistribuidorasResposta,
  type ListarProtocolosQuery,
  type ListarProtocolosResposta,
  type OpcoesDosProtocolosResposta,
  type Protocolo,
  type ProtocoloDaUc,
  type ProtocoloResumo,
  type SituacaoDoProtocolo,
  type VerificarProtocolo,
} from "@plugga/shared";

import { AcessoNegado } from "../common/errors/dominio";
import { diaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { TarefasService } from "../tarefas/tarefas.service";
import { RELOGIO_DA_ENGENHARIA, type Relogio } from "./engenharia.service";
import { PrismaProtocolosRepository, type LinhaDoProtocolo, type Nomes, type NomesDosProtocolos } from "./prisma-protocolos.repository";
import { alcancaProtocolos, conferirDatas, departamentosDosProtocolosDe, diasEntre, gerenteDosProtocolos, verificaHoje } from "./protocolos.rules";

const pessoa = (id: string | null, nomes: Nomes) => (id ? { id, nome: nomes.get(id) ?? "Pessoa sem acesso" } : null);

/**
 * Protocolos na distribuidora (PLU-348), da Engenharia e do Operacional
 * (energia-opm). Cada um lê e grava os do seu departamento (a tela de
 * protocolos); o catálogo de distribuidoras muda com o gerente. A tarefa
 * automática "Protocolos do dia" da Engenharia se conclui quando não resta
 * verificação para hoje.
 */
@Injectable()
export class ProtocolosService {
  private readonly logger = new Logger(ProtocolosService.name);

  constructor(
    @Inject(PrismaProtocolosRepository) private readonly repositorio: PrismaProtocolosRepository,
    @Inject(TarefasService) private readonly tarefas: TarefasService,
    @Inject(RELOGIO_DA_ENGENHARIA) private readonly agora: Relogio,
  ) {}

  // ------------------------------------------------------------ distribuidoras

  async distribuidoras(principal: AuthPrincipal): Promise<ListarDistribuidorasResposta> {
    this.exigirAlgum(principal);
    return listarDistribuidorasRespostaSchema.parse({ itens: await this.repositorio.distribuidoras(), podeEditar: gerenteDosProtocolos(principal.acesso) });
  }

  async criarDistribuidora(input: CriarDistribuidora, principal: AuthPrincipal): Promise<ListarDistribuidorasResposta> {
    this.exigirGerente(principal);
    await this.repositorio.criarDistribuidora(input, principal);
    return this.distribuidoras(principal);
  }

  async editarDistribuidora(id: string, input: EditarDistribuidora, principal: AuthPrincipal): Promise<ListarDistribuidorasResposta> {
    this.exigirGerente(principal);
    await this.repositorio.editarDistribuidora(id, input, principal);
    return this.distribuidoras(principal);
  }

  // ------------------------------------------------------------ protocolos

  async opcoes(principal: AuthPrincipal): Promise<OpcoesDosProtocolosResposta> {
    const departamentos = this.exigirAlgum(principal);
    const distribuidoras = await this.repositorio.distribuidoras();
    return opcoesDosProtocolosRespostaSchema.parse({ distribuidoras: distribuidoras.filter((d) => d.ativa), tipos: [...tiposDeProtocolo], situacoes: [...situacoesDoProtocolo], departamentos });
  }

  async clientes(busca: string, principal: AuthPrincipal): Promise<ClientesParaProtocoloResposta> {
    this.exigirAlgum(principal);
    return clientesParaProtocoloRespostaSchema.parse({ itens: await this.repositorio.clientesComUcs(busca) });
  }

  async listar(query: ListarProtocolosQuery, principal: AuthPrincipal): Promise<ListarProtocolosResposta> {
    const departamentos = this.exigirAlgum(principal);
    if (query.departamento && !departamentos.includes(query.departamento)) throw new AcessoNegado("Você não tem acesso aos protocolos deste departamento.");
    const hoje = diaEmManaus(this.agora());
    const r = await this.repositorio.listar(query, departamentos, hoje);
    // Decisão (revisão da PLU-348): o GET também conclui a tarefa do dia. A tarefa é
    // "olhar os protocolos do dia"; abrir a lista inteira e não restar verificação é
    // fazê-la, e num dia sem verificação marcada nenhuma escrita a concluiria. É
    // idempotente, só acontece com zero pendentes e fica atribuída a quem conferiu.
    if (r.contagens.verificarHoje === 0 && !query.busca && !query.empresa && !query.distribuidoraId && !query.ucId) await this.concluirProtocolosDoDia(departamentos, hoje, principal);
    return listarProtocolosRespostaSchema.parse({ hoje, itens: r.linhas.map((l) => this.resumo(l, r.nomes, hoje)), total: r.total, contagens: r.contagens });
  }

  async protocolo(id: string, principal: AuthPrincipal): Promise<Protocolo> {
    this.exigirAlgum(principal);
    const hoje = diaEmManaus(this.agora());
    const r = await this.repositorio.ficha(id);
    const departamento = r.linha.departamento as DepartamentoDoProtocolo;
    const aberto = !protocoloEncerrado(r.linha.situacao as SituacaoDoProtocolo);
    return protocoloSchema.parse({
      ...this.resumo(r.linha, r.nomes, hoje),
      observacao: r.linha.observacao,
      historico: r.historico.map((h) => ({
        id: h.id,
        verificado: { por: pessoa(h.porId, r.nomes.pessoas), em: h.em.toISOString() },
        situacaoAnterior: h.situacaoAnterior,
        situacao: h.situacao,
        nota: h.nota,
        acaoPendente: h.acaoPendente,
        proximaVerificacao: h.proximaVerificacao ? diaEmManaus(h.proximaVerificacao) : null,
      })),
      criado: { por: pessoa(r.linha.criadoPorId, r.nomes.pessoas), em: r.linha.createdAt.toISOString() },
      acoesPermitidas: aberto && alcancaProtocolos(principal.acesso, departamento) ? ["editar", "verificar"] : [],
    });
  }

  async criar(input: CriarProtocolo, principal: AuthPrincipal): Promise<Protocolo> {
    this.exigirDepartamento(principal, input.departamento);
    conferirDatas({ abertoEm: input.abertoEm, dataLimite: input.dataLimite, proximaVerificacao: input.proximaVerificacao ?? null }, diaEmManaus(this.agora()));
    return this.protocolo(await this.repositorio.criar(input, principal), principal);
  }

  async editar(id: string, input: EditarProtocolo, principal: AuthPrincipal): Promise<Protocolo> {
    this.exigirAlgum(principal);
    conferirDatas({ ...(input.dataLimite !== undefined ? { dataLimite: input.dataLimite } : {}) }, diaEmManaus(this.agora()));
    await this.repositorio.editar(id, input, principal);
    return this.protocolo(id, principal);
  }

  /** A verificação muda a situação e marca a próxima; depois, a tarefa do dia se conclui se não resta verificação. */
  async verificar(id: string, input: VerificarProtocolo, principal: AuthPrincipal): Promise<Protocolo> {
    this.exigirAlgum(principal);
    const agora = this.agora();
    const hoje = diaEmManaus(agora);
    conferirDatas({ proximaVerificacao: input.proximaVerificacao ?? null }, hoje);
    const { departamento } = await this.repositorio.verificar(id, input, principal, agora);
    await this.concluirProtocolosDoDia([departamento], hoje, principal);
    return this.protocolo(id, principal);
  }

  /** Para a ficha da usina: os protocolos da UC em andamento; nulo para quem não tem a tela de protocolos. */
  async daUc(ucId: string, principal: AuthPrincipal): Promise<ProtocoloDaUc[] | null> {
    if (departamentosDosProtocolosDe(principal.acesso).length === 0) return null;
    const hoje = diaEmManaus(this.agora());
    const linhas = await this.repositorio.daUc(ucId);
    const vazios: NomesDosProtocolos = { clientes: new Map(), ucs: new Map(), pessoas: new Map() };
    return linhas.map((l) => protocoloDaUcSchema.parse(this.resumo(l, vazios, hoje)));
  }

  // ------------------------------------------------------------ apoio

  private resumo(l: LinhaDoProtocolo, nomes: NomesDosProtocolos, hoje: string): ProtocoloResumo {
    const situacao = l.situacao as SituacaoDoProtocolo;
    const dataLimite = diaEmManaus(l.dataLimite);
    const proxima = l.proximaVerificacao ? diaEmManaus(l.proximaVerificacao) : null;
    const ultima = l.verificacoes[0] ?? null;
    return {
      id: l.id,
      empresa: l.companyId as CompanyKey,
      departamento: l.departamento as DepartamentoDoProtocolo,
      tipo: l.tipo,
      numero: l.numero,
      situacao,
      cliente: { id: l.clientId, nome: nomes.clientes.get(l.clientId) ?? "Cliente" },
      uc: { id: l.consumerUnitId, codigo: nomes.ucs.get(l.consumerUnitId)?.codigo ?? "—" },
      distribuidora: { id: l.distribuidora.id, nome: l.distribuidora.nome },
      abertoEm: diaEmManaus(l.abertoEm),
      dataLimite,
      diasParaOLimite: protocoloEncerrado(situacao) ? null : diasEntre(hoje, dataLimite),
      proximaVerificacao: proxima,
      verificarHoje: verificaHoje(situacao, proxima, hoje),
      acaoPendente: l.acaoPendente,
      ultimaVerificacao: ultima ? { por: pessoa(ultima.porId, nomes.pessoas), em: ultima.em.toISOString() } : null,
    };
  }

  /**
   * A tarefa automática "Protocolos do dia" é da Engenharia: conclui quando a
   * pessoa alcança os protocolos da Engenharia e nenhum pede verificação hoje.
   */
  private async concluirProtocolosDoDia(departamentos: DepartamentoDoProtocolo[], hoje: string, principal: AuthPrincipal): Promise<void> {
    if (!departamentos.includes("engenharia-obras") || !alcancaProtocolos(principal.acesso, "engenharia-obras")) return;
    try {
      if ((await this.repositorio.pendentesHoje("engenharia-obras", hoje)) > 0) return;
      await this.tarefas.concluirAutomatica("engenharia-obras", "engenharia.protocolos_do_dia", hoje, principal);
    } catch {
      // A verificação já está gravada; a tarefa conclui na próxima verificação ou fica para o dia.
      this.logger.warn("a tarefa automática dos protocolos não pôde ser concluída agora");
    }
  }

  private exigirAlgum(principal: AuthPrincipal): DepartamentoDoProtocolo[] {
    const departamentos = departamentosDosProtocolosDe(principal.acesso);
    if (departamentos.length === 0) throw new AcessoNegado("Você não tem acesso aos protocolos.");
    return departamentos;
  }

  private exigirDepartamento(principal: AuthPrincipal, departamento: DepartamentoDoProtocolo): void {
    if (!alcancaProtocolos(principal.acesso, departamento)) throw new AcessoNegado("Você não tem acesso aos protocolos deste departamento.");
  }

  private exigirGerente(principal: AuthPrincipal): void {
    if (!gerenteDosProtocolos(principal.acesso)) throw new AcessoNegado("O catálogo de distribuidoras é do gerente.");
  }
}

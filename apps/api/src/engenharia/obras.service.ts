import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  DOCUMENTO_DE_OBRA_MAX_BYTES,
  MARCOS_PADRAO_DA_OBRA,
  buscarClientesDaEngenhariaRespostaSchema,
  categoriasDeDocumentoDeObra,
  codigoDaOrdemDeServico,
  listarObrasRespostaSchema,
  obraSchema,
  opcoesDasObrasRespostaSchema,
  tiposDeDocumentoDeObra,
  tiposDeObra,
  type BuscarClientesDaEngenhariaResposta,
  type CadastrarObra,
  type CompanyKey,
  type EditarObra,
  type EnviarDocumentoDeObra,
  type ListarObrasQuery,
  type ListarObrasResposta,
  type Obra,
  type ObraResumo,
  type OpcoesDasObrasResposta,
} from "@plugga/shared";

import { AcessoNegado, ArquivoRecusado, LimiteExcedido, RequisicaoInvalida, TipoNaoPermitido } from "../common/errors/dominio";
import { diaEmManaus } from "../compras/dias-uteis";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { detectarTipo } from "../lead-documentos/deteccao-de-tipo";
import { nomeSeguro } from "../lead-documentos/lead-documentos.rules";
import { RELOGIO_DA_ENGENHARIA, type Relogio } from "./engenharia.service";
import { conferirPeriodo, ehArquivoDoMsProject, gerenteDasObras, marcoAtrasado, operaObras, proximoMarco, situacaoDaObra } from "./obras.rules";
import { PrismaEngenhariaRepository } from "./prisma-engenharia.repository";
import { PrismaObrasRepository, type ArquivoDaObra, type LinhaDaObra, type LinhaDoDocumento, type Nomes } from "./prisma-obras.repository";

export type ArquivoRecebido = { buffer: Buffer; nomeOriginal: string };
export type ArquivoParaBaixar = { arquivo: ArquivoDaObra; stream: NodeJS.ReadableStream; encerrar: () => void };

const pessoa = (id: string | null, nomes: Nomes) => (id ? { id, nome: nomes.get(id) ?? "Pessoa sem acesso" } : null);
const kwp = (v: { toString(): string } | null) => (v === null ? null : v.toString().replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""));

/**
 * Obras com marcos, documentos e cronograma (PLU-350). A tela de Obras lê e
 * grava; o orçamento é do gerente (CC-D6). A obra é também o centro de custo do
 * Financeiro: os custos (pedidos e material) ficam para ele.
 */
@Injectable()
export class ObrasService {
  private readonly logger = new Logger(ObrasService.name);

  constructor(
    @Inject(PrismaObrasRepository) private readonly repositorio: PrismaObrasRepository,
    @Inject(PrismaEngenhariaRepository) private readonly ordens: PrismaEngenhariaRepository,
    @Inject(ArmazenamentoDeDocumentos) private readonly armazenamento: ArmazenamentoDeDocumentos,
    @Inject(RELOGIO_DA_ENGENHARIA) private readonly agora: Relogio,
  ) {}

  async opcoes(principal: AuthPrincipal): Promise<OpcoesDasObrasResposta> {
    this.exigir(principal);
    return opcoesDasObrasRespostaSchema.parse({ responsaveis: await this.repositorio.responsaveis(), tipos: [...tiposDeObra], categoriasDeDocumento: [...categoriasDeDocumentoDeObra], marcosPadrao: [...MARCOS_PADRAO_DA_OBRA] });
  }

  async clientes(busca: string, principal: AuthPrincipal): Promise<BuscarClientesDaEngenhariaResposta> {
    this.exigir(principal);
    return buscarClientesDaEngenhariaRespostaSchema.parse({ itens: await this.ordens.buscarClientes(busca) });
  }

  async listar(query: ListarObrasQuery, principal: AuthPrincipal): Promise<ListarObrasResposta> {
    this.exigir(principal);
    const hoje = diaEmManaus(this.agora());
    const r = await this.repositorio.listar(query);
    const todas = r.linhas.map((l) => this.resumo(l, r.clientes, r.pessoas, hoje));
    const contagens = {
      emAndamento: todas.filter((o) => o.situacao === "em_andamento").length,
      comMarcoAtrasado: todas.filter((o) => o.marcos.atrasados > 0 && o.situacao !== "entregue").length,
      entregues: todas.filter((o) => o.situacao === "entregue").length,
    };
    const itens = todas.filter((o) => (!query.situacao || o.situacao === query.situacao) && (query.atrasadas !== "sim" || (o.marcos.atrasados > 0 && o.situacao !== "entregue")));
    return listarObrasRespostaSchema.parse({ hoje, itens, total: itens.length, contagens });
  }

  async obra(id: string, principal: AuthPrincipal): Promise<Obra> {
    this.exigir(principal);
    const hoje = diaEmManaus(this.agora());
    const r = await this.repositorio.ficha(id);
    const proximo = proximoMarco(r.linha.marcos.map((m) => ({ ...m, feito: m.feitoEm !== null })));
    const acoes: Obra["acoesPermitidas"] = ["editar", "anexar"];
    if (proximo) acoes.push("marcar_marco", "reprogramar_marco");
    if (gerenteDasObras(principal.acesso)) acoes.push("editar_orcamento");
    return obraSchema.parse({
      ...this.resumo(r.linha, r.clientes, r.pessoas, hoje),
      orcamento: r.linha.orcamento ? r.linha.orcamento.toFixed(2) : null,
      marcosDaObra: r.linha.marcos.map((m) => {
        const previsto = diaEmManaus(m.previstoEm);
        return {
          id: m.id, ordem: m.ordem, nome: m.nome, previstoEm: previsto,
          feito: m.feitoEm ? { por: pessoa(m.feitoPorId, r.pessoas), em: m.feitoEm.toISOString() } : null,
          atrasado: marcoAtrasado(previsto, m.feitoEm ? diaEmManaus(m.feitoEm) : null, hoje),
          proximo: proximo?.id === m.id,
        };
      }),
      documentosDaObra: this.documentos(id, r.documentos, r.protocolos, r.pessoas),
      ordens: r.ordens.map((o) => ({ id: o.id, codigo: codigoDaOrdemDeServico(o.numero), tipo: o.tipo, situacao: o.situacao, descricao: o.descricao, prazo: diaEmManaus(o.prazo) })),
      custos: null,
      criada: { por: pessoa(r.linha.criadoPorId, r.pessoas), em: r.linha.createdAt.toISOString() },
      acoesPermitidas: acoes,
    });
  }

  async cadastrar(input: CadastrarObra, principal: AuthPrincipal): Promise<Obra> {
    this.exigir(principal);
    conferirPeriodo(input.inicioEm, input.entregaPrevistaEm, diaEmManaus(this.agora()));
    return this.obra(await this.repositorio.cadastrar(input, principal), principal);
  }

  async editar(id: string, input: EditarObra, principal: AuthPrincipal): Promise<Obra> {
    this.exigir(principal);
    if (input.orcamento !== undefined && !gerenteDasObras(principal.acesso)) throw new AcessoNegado("O orçamento da obra é do gerente da Engenharia.");
    await this.repositorio.editar(id, input, principal, diaEmManaus(this.agora()));
    return this.obra(id, principal);
  }

  async marcarFeito(id: string, marcoId: string, principal: AuthPrincipal): Promise<Obra> {
    this.exigir(principal);
    await this.repositorio.marcarFeito(id, marcoId, principal, this.agora());
    return this.obra(id, principal);
  }

  async reprogramar(id: string, marcoId: string, previstoEm: string, principal: AuthPrincipal): Promise<Obra> {
    this.exigir(principal);
    await this.repositorio.reprogramar(id, marcoId, previstoEm, principal, diaEmManaus(this.agora()));
    return this.obra(id, principal);
  }

  /** Documento ou cronograma: PDF, imagem ou .mpp, guardado sob a empresa e a obra; a versão nunca se apaga. */
  async anexar(id: string, dados: EnviarDocumentoDeObra, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<Obra> {
    this.exigir(principal);
    if (!arquivo) throw new RequisicaoInvalida("Anexe o arquivo.", [{ campo: "arquivo", problema: "O arquivo é obrigatório." }]);
    if (arquivo.buffer.length === 0) throw new TipoNaoPermitido("O arquivo está vazio.");
    if (arquivo.buffer.length > DOCUMENTO_DE_OBRA_MAX_BYTES) throw new LimiteExcedido("O arquivo é maior que o limite de 50 MiB.", "ARQUIVO_GRANDE_DEMAIS");
    const tipo = this.tipoDoArquivo(arquivo);
    const { empresa } = await this.repositorio.paraAnexar(id, dados.protocoloId);
    const nome = arquivo.nomeOriginal.trim().slice(0, 200) || "documento";
    const chave = `engenharia/obras/${empresa as CompanyKey}/${id}/${randomUUID()}-${nomeSeguro(nome)}`;
    await this.armazenamento.enviar(chave, arquivo.buffer, tipo);
    try {
      await this.repositorio.anexar(id, dados.categoria, dados.substitui, dados.protocoloId, { chave, nome, tamanho: arquivo.buffer.length, tipo }, principal, this.agora());
    } catch (erro) {
      await this.descartar(chave);
      throw erro;
    }
    return this.obra(id, principal);
  }

  async baixar(id: string, documentoId: string, principal: AuthPrincipal): Promise<ArquivoParaBaixar> {
    this.exigir(principal);
    const arquivo = await this.repositorio.documento(id, documentoId);
    const { objeto, cliente } = await this.armazenamento.ler(arquivo.chave);
    return { arquivo, stream: objeto.corpo, encerrar: () => cliente.destroy() };
  }

  // ------------------------------------------------------------ apoio

  private resumo(l: LinhaDaObra, clientes: Nomes, pessoas: Nomes, hoje: string): ObraResumo {
    const marcos = l.marcos.map((m) => ({ ...m, feito: m.feitoEm !== null, previsto: diaEmManaus(m.previstoEm) }));
    const proximo = proximoMarco(marcos);
    return {
      id: l.id,
      nome: l.nome,
      empresa: l.companyId as CompanyKey,
      tipo: l.tipo,
      cliente: l.clientId ? { id: l.clientId, nome: clientes.get(l.clientId) ?? "Cliente" } : null,
      potenciaKwp: kwp(l.potenciaKwp),
      responsavel: pessoa(l.responsavelId, pessoas),
      inicioEm: l.inicioEm ? diaEmManaus(l.inicioEm) : null,
      entregaPrevistaEm: l.entregaPrevistaEm ? diaEmManaus(l.entregaPrevistaEm) : null,
      situacao: situacaoDaObra(marcos),
      marcos: {
        feitos: marcos.filter((m) => m.feito).length,
        total: marcos.length,
        proximo: proximo ? { nome: proximo.nome, previstoEm: proximo.previsto, atrasado: marcoAtrasado(proximo.previsto, null, hoje) } : null,
        atrasados: marcos.filter((m) => !m.feito && marcoAtrasado(m.previsto, null, hoje)).length,
      },
      documentos: l._count.documentos,
      osAbertas: l._count.ordensDeServico,
      ativa: l.ativa,
    };
  }

  private documentos(obraId: string, linhas: LinhaDoDocumento[], protocolos: Map<string, string>, pessoas: Nomes): Obra["documentosDaObra"] {
    const versao = (d: LinhaDoDocumento) => ({ id: d.id, versao: d.versao, nome: d.arquivoNome, tamanhoBytes: d.arquivoTamanho, mime: d.arquivoTipo, enviado: { por: pessoa(d.enviadoPorId, pessoas), em: d.enviadoEm.toISOString() }, url: `/engenharia/obras/${obraId}/documentos/${d.id}` });
    const atuais = linhas.filter((d) => d.substituidoEm === null);
    return atuais
      .map((d) => ({
        ...versao(d),
        serieId: d.serieId,
        categoria: d.categoria,
        protocolo: d.protocoloId ? { id: d.protocoloId, numero: protocolos.get(d.protocoloId) ?? "—" } : null,
        versoesAnteriores: linhas.filter((x) => x.serieId === d.serieId && x.id !== d.id).sort((a, b) => b.versao - a.versao).map(versao),
      }))
      .sort((a, b) => Number(b.categoria === "cronograma") - Number(a.categoria === "cronograma") || b.enviado.em.localeCompare(a.enviado.em));
  }

  private tipoDoArquivo(arquivo: ArquivoRecebido): string {
    if (ehArquivoDoMsProject(arquivo.buffer, arquivo.nomeOriginal)) return "application/vnd.ms-project";
    const deteccao = detectarTipo(arquivo.buffer);
    if (deteccao.status === "arquivo_recusado") throw new ArquivoRecusado("O arquivo está corrompido ou truncado.");
    if (deteccao.status !== "aceito" || !(tiposDeDocumentoDeObra as readonly string[]).includes(deteccao.tipo)) throw new TipoNaoPermitido("Envie um PDF, uma imagem (JPEG ou PNG) ou o cronograma do MS Project (.mpp).");
    return deteccao.tipo;
  }

  private exigir(principal: AuthPrincipal): void {
    if (principal.kind !== "user" && principal.acesso.plataforma === null) throw new AcessoNegado("Obras são da equipe da Engenharia.");
    if (!operaObras(principal.acesso)) throw new AcessoNegado("Obras são de quem tem a tela de Obras.");
  }

  private async descartar(chave: string): Promise<void> {
    try {
      await this.armazenamento.excluir(chave);
    } catch {
      this.logger.warn("documento da obra não pôde ser removido do armazenamento");
    }
  }
}

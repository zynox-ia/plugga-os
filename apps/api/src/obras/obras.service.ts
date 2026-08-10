import { Inject, Injectable } from "@nestjs/common";
import type {
  AprovarMedicaoRequest,
  AprovarProjetoRequest,
  AssinarAprRequest,
  AvancarEtapaDeObraRequest,
  ClassificarPrioridadeRequest,
  CompanyKey,
  ConferirEpiRequest,
  CriarVersaoDeProjetoRequest,
  EncerrarPendenciaRequest,
  EnviarProjetoParaAprovacaoRequest,
  Incidente,
  LancarMedicaoRequest,
  LiberacaoSeguranca,
  MedicaoTecnica,
  ObraExecucaoDetalhe,
  PendenciaDeCampo,
  ProjetoVersao,
  ReabrirProjetoRequest,
  RegistrarAprRequest,
  RegistrarEpiRequest,
  RegistrarEvidenciaRequest,
  RegistrarIncidenteRequest,
  RegistrarLiberacaoRequest,
  RegistrarPendenciaRequest,
  RegistroApr,
  RegistroEpi,
  RevogarLiberacaoRequest,
  SolicitarCorrecaoMedicaoRequest,
  SolicitarRevisaoDeProjetoRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { ArmazenamentoDeEvidencias } from "./armazenamento-de-evidencias";
import { ObrasEscopoRepository } from "./obras-escopo.repository";
import { ObrasRepository } from "./obras.repository";

/** Um arquivo de evidência chegando pela requisição multipart. */
export type ArquivoDeEvidencia = { buffer: Buffer; originalname: string; mimetype: string };

/**
 * Orquestra escopo de empresa/departamento + repositório, no molde de
 * `ComprasService`. Toda entrada prova `assertAlcanca` antes de qualquer
 * acesso a dado.
 */
@Injectable()
export class ObrasService {
  constructor(
    @Inject(ObrasRepository) private readonly repositorio: ObrasRepository,
    @Inject(ObrasEscopoRepository) private readonly escopo: ObrasEscopoRepository,
    @Inject(ArmazenamentoDeEvidencias) private readonly armazenamento: ArmazenamentoDeEvidencias,
  ) {}

  async obra(id: string, companyId: CompanyKey, principal: AuthPrincipal): Promise<ObraExecucaoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, companyId);
    return this.repositorio.obra(id, companyId);
  }

  async avancarEtapa(
    id: string,
    input: AvancarEtapaDeObraRequest,
    principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.avancarEtapa(id, input, principal);
  }

  async reabrirProjeto(
    id: string,
    input: ReabrirProjetoRequest,
    principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.reabrirProjeto(id, input, principal);
  }

  /**
   * Mesmo raciocínio de `ComprasService.criarPedido`: o arquivo vai para o
   * armazenamento antes da transação, e uma falha ali derruba o registro
   * inteiro — a evidência é o próprio requisito (POP §5.1), não apoio.
   */
  async registrarEvidencia(
    id: string,
    input: RegistrarEvidenciaRequest,
    arquivo: ArquivoDeEvidencia,
    principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    const guardado = await this.armazenamento.guardar(arquivo.buffer, arquivo.mimetype, arquivo.originalname);
    return this.repositorio.registrarEvidencia(
      id,
      input,
      { arquivoChave: guardado.chave, arquivoNome: arquivo.originalname },
      principal,
    );
  }

  async registrarEpi(id: string, input: RegistrarEpiRequest, principal: AuthPrincipal): Promise<RegistroEpi> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.registrarEpi(id, input, principal);
  }

  async conferirEpi(
    id: string,
    epiId: string,
    input: ConferirEpiRequest,
    principal: AuthPrincipal,
  ): Promise<RegistroEpi> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.conferirEpi(id, epiId, input, principal);
  }

  async registrarApr(id: string, input: RegistrarAprRequest, principal: AuthPrincipal): Promise<RegistroApr> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.registrarApr(id, input, principal);
  }

  async assinarApr(
    id: string,
    aprId: string,
    input: AssinarAprRequest,
    principal: AuthPrincipal,
  ): Promise<RegistroApr> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.assinarApr(id, aprId, input, principal);
  }

  async registrarIncidente(
    id: string,
    input: RegistrarIncidenteRequest,
    principal: AuthPrincipal,
  ): Promise<Incidente> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.registrarIncidente(id, input, principal);
  }

  async registrarLiberacao(
    id: string,
    input: RegistrarLiberacaoRequest,
    principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.registrarLiberacao(id, input, principal);
  }

  async revogarLiberacao(
    id: string,
    liberacaoId: string,
    input: RevogarLiberacaoRequest,
    principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.revogarLiberacao(id, liberacaoId, input, principal);
  }

  async registrarPendencia(
    id: string,
    input: RegistrarPendenciaRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.registrarPendencia(id, input, principal);
  }

  async classificarPrioridadePendencia(
    id: string,
    pendenciaId: string,
    input: ClassificarPrioridadeRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.classificarPrioridadePendencia(id, pendenciaId, input, principal);
  }

  async encerrarPendencia(
    id: string,
    pendenciaId: string,
    input: EncerrarPendenciaRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.encerrarPendencia(id, pendenciaId, input, principal);
  }

  async lancarMedicao(id: string, input: LancarMedicaoRequest, principal: AuthPrincipal): Promise<MedicaoTecnica> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.lancarMedicao(id, input, principal);
  }

  async aprovarMedicao(
    id: string,
    medicaoId: string,
    input: AprovarMedicaoRequest,
    principal: AuthPrincipal,
  ): Promise<MedicaoTecnica> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.aprovarMedicao(id, medicaoId, input, principal);
  }

  async solicitarCorrecaoMedicao(
    id: string,
    medicaoId: string,
    input: SolicitarCorrecaoMedicaoRequest,
    principal: AuthPrincipal,
  ): Promise<MedicaoTecnica> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.solicitarCorrecaoMedicao(id, medicaoId, input, principal);
  }

  /** Mesmo raciocínio de `registrarEvidencia`: anexo é opcional aqui (o desenho pode chegar depois). */
  async criarVersaoDeProjeto(
    id: string,
    input: CriarVersaoDeProjetoRequest,
    arquivo: ArquivoDeEvidencia | null,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    const anexo = arquivo
      ? await this.armazenamento
          .guardar(arquivo.buffer, arquivo.mimetype, arquivo.originalname)
          .then((guardado) => ({ arquivoChave: guardado.chave, arquivoNome: arquivo.originalname }))
      : null;
    return this.repositorio.criarVersaoDeProjeto(id, input, anexo, principal);
  }

  async enviarProjetoParaAprovacao(
    id: string,
    versaoId: string,
    input: EnviarProjetoParaAprovacaoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.enviarProjetoParaAprovacao(id, versaoId, input, principal);
  }

  async aprovarProjeto(
    id: string,
    versaoId: string,
    input: AprovarProjetoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.aprovarProjeto(id, versaoId, input, principal);
  }

  async solicitarRevisaoDeProjeto(
    id: string,
    versaoId: string,
    input: SolicitarRevisaoDeProjetoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao> {
    await this.escopo.assertAlcanca(principal.id, input.companyId);
    return this.repositorio.solicitarRevisaoDeProjeto(id, versaoId, input, principal);
  }
}

import type {
  AprovarMedicaoRequest,
  AprovarProjetoRequest,
  AssinarAprRequest,
  AvancarEtapaDeObraRequest,
  ClassificarPrioridadeRequest,
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

/** Uma evidência já gravada no armazenamento, pronta para virar linha. */
export type AnexoDeEvidencia = { arquivoChave: string; arquivoNome: string };

export abstract class ObrasRepository {
  abstract obra(id: string, companyId: string): Promise<ObraExecucaoDetalhe>;

  abstract avancarEtapa(
    id: string,
    input: AvancarEtapaDeObraRequest,
    principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe>;

  abstract reabrirProjeto(
    id: string,
    input: ReabrirProjetoRequest,
    principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe>;

  abstract registrarEvidencia(
    id: string,
    input: { companyId: string; tipo: string; descricao: string; statusRelacionado?: string },
    anexo: AnexoDeEvidencia,
    principal: AuthPrincipal,
  ): Promise<ObraExecucaoDetalhe>;

  abstract registrarEpi(
    id: string,
    input: RegistrarEpiRequest,
    principal: AuthPrincipal,
  ): Promise<RegistroEpi>;

  abstract conferirEpi(
    id: string,
    epiId: string,
    input: ConferirEpiRequest,
    principal: AuthPrincipal,
  ): Promise<RegistroEpi>;

  abstract registrarApr(
    id: string,
    input: RegistrarAprRequest,
    principal: AuthPrincipal,
  ): Promise<RegistroApr>;

  abstract assinarApr(
    id: string,
    aprId: string,
    input: AssinarAprRequest,
    principal: AuthPrincipal,
  ): Promise<RegistroApr>;

  abstract registrarIncidente(
    id: string,
    input: RegistrarIncidenteRequest,
    principal: AuthPrincipal,
  ): Promise<Incidente>;

  abstract registrarLiberacao(
    id: string,
    input: RegistrarLiberacaoRequest,
    principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca>;

  abstract revogarLiberacao(
    id: string,
    liberacaoId: string,
    input: RevogarLiberacaoRequest,
    principal: AuthPrincipal,
  ): Promise<LiberacaoSeguranca>;

  abstract registrarPendencia(
    id: string,
    input: RegistrarPendenciaRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo>;

  abstract classificarPrioridadePendencia(
    id: string,
    pendenciaId: string,
    input: ClassificarPrioridadeRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo>;

  abstract encerrarPendencia(
    id: string,
    pendenciaId: string,
    input: EncerrarPendenciaRequest,
    principal: AuthPrincipal,
  ): Promise<PendenciaDeCampo>;

  abstract lancarMedicao(
    id: string,
    input: LancarMedicaoRequest,
    principal: AuthPrincipal,
  ): Promise<MedicaoTecnica>;

  abstract aprovarMedicao(
    id: string,
    medicaoId: string,
    input: AprovarMedicaoRequest,
    principal: AuthPrincipal,
  ): Promise<MedicaoTecnica>;

  abstract solicitarCorrecaoMedicao(
    id: string,
    medicaoId: string,
    input: SolicitarCorrecaoMedicaoRequest,
    principal: AuthPrincipal,
  ): Promise<MedicaoTecnica>;

  abstract criarVersaoDeProjeto(
    id: string,
    input: CriarVersaoDeProjetoRequest,
    anexo: AnexoDeEvidencia | null,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao>;

  abstract enviarProjetoParaAprovacao(
    id: string,
    versaoId: string,
    input: EnviarProjetoParaAprovacaoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao>;

  abstract aprovarProjeto(
    id: string,
    versaoId: string,
    input: AprovarProjetoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao>;

  abstract solicitarRevisaoDeProjeto(
    id: string,
    versaoId: string,
    input: SolicitarRevisaoDeProjetoRequest,
    principal: AuthPrincipal,
  ): Promise<ProjetoVersao>;
}

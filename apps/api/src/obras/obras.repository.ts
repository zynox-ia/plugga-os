import type {
  AssinarAprRequest,
  AvancarEtapaDeObraRequest,
  ConferirEpiRequest,
  Incidente,
  LiberacaoSeguranca,
  ObraExecucaoDetalhe,
  ReabrirProjetoRequest,
  RegistrarAprRequest,
  RegistrarEpiRequest,
  RegistrarIncidenteRequest,
  RegistrarLiberacaoRequest,
  RegistroApr,
  RegistroEpi,
  RevogarLiberacaoRequest,
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
}

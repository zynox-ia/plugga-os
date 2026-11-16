import type { ActivateSolarProcessRequest, SolarProcessActivation, SolarProcessState } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class ProcessoSolarRepository {
  abstract situacao(dealId: string, principal: AuthPrincipal): Promise<SolarProcessState>;
  abstract ativar(pipelineId: string, input: ActivateSolarProcessRequest, principal: AuthPrincipal): Promise<SolarProcessActivation>;
}

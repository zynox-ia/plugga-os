import { Inject, Injectable } from "@nestjs/common";
import type { ActivateSolarProcessRequest, SolarProcessActivation, SolarProcessState } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { ProcessoSolarRepository } from "./processo-solar.repository";

@Injectable()
export class ProcessoSolarService {
  constructor(@Inject(ProcessoSolarRepository) private readonly repository: ProcessoSolarRepository) {}

  situacao(dealId: string, principal: AuthPrincipal): Promise<SolarProcessState> {
    return this.repository.situacao(dealId, principal);
  }

  ativar(pipelineId: string, input: ActivateSolarProcessRequest, principal: AuthPrincipal): Promise<SolarProcessActivation> {
    return this.repository.ativar(pipelineId, input, principal);
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { pluggamobOverviewSchema, type PluggamobOverview } from "@plugga/shared";

import { PluggamobRepository } from "./pluggamob.repository";

@Injectable()
export class PluggamobService {
  constructor(@Inject(PluggamobRepository) private readonly repository: PluggamobRepository) {}

  async overview(): Promise<PluggamobOverview> {
    const generatedAt = new Date();
    const counts = await this.repository.overview(generatedAt);
    return pluggamobOverviewSchema.parse({ mode: "mock", ...counts, generatedAt: generatedAt.toISOString() });
  }
}

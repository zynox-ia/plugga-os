import { Inject, Injectable } from "@nestjs/common";

import type { JobHandler, JobResult } from "../jobs/queue/job-handler";
import { OMIE_DESPACHAR_JOB, OMIE_ENVIAR_JOB, OmieFilaService, type ResultadoDaFila } from "./omie-fila.service";

/** O registro em job_runs: `skipped` quando o portão recusa, nunca um sucesso falso. */
function paraJobResult(r: ResultadoDaFila, ref: string): JobResult {
  if (r.skipped) return { skipped: true, logRef: `os://omie/${ref} skipped reason=${r.motivo}` };
  const partes = Object.entries(r).filter(([k, v]) => k !== "skipped" && v !== undefined).map(([k, v]) => `${k}=${String(v)}`);
  return { logRef: `os://omie/${ref} ${partes.join(" ")}`.trim() };
}

/** Despacha a fila do OMIE: só com a integração em `write`. */
@Injectable()
export class OmieDespacharHandler implements JobHandler {
  readonly jobKey = OMIE_DESPACHAR_JOB;
  readonly integrationKey = "omie";

  constructor(@Inject(OmieFilaService) private readonly fila: OmieFilaService) {}

  async process(): Promise<JobResult> {
    return paraJobResult(await this.fila.despachar(new Date()), "despachar");
  }
}

/** Um envio ao OMIE, pelo id da linha do outbox. */
@Injectable()
export class OmieEnviarHandler implements JobHandler<{ envioId: string }> {
  readonly jobKey = OMIE_ENVIAR_JOB;
  readonly integrationKey = "omie";

  constructor(@Inject(OmieFilaService) private readonly fila: OmieFilaService) {}

  async process(payload: { envioId: string }): Promise<JobResult> {
    if (typeof payload?.envioId !== "string") return { skipped: true, logRef: "os://omie/enviar skipped reason=payload" };
    return paraJobResult(await this.fila.enviar(payload.envioId, new Date()), "enviar");
  }
}

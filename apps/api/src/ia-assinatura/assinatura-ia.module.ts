import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { AssinaturaIaController } from "./assinatura-ia.controller";
import { AssinaturaIaService } from "./assinatura-ia.service";
import { CliProxyHttpAdapter } from "./cliproxy-http.adapter";
import { CliProxyPort } from "./cliproxy.port";

/**
 * IA pela assinatura (Claude e Codex) via proxy de CLI, só para tarefa interna sem dado de
 * cliente. O serviço NÃO é exportado de propósito: nenhum fluxo de fatura ou de cadastro de
 * cliente pode depender dele por acidente. Quando houver tarefa interna que precise
 * chamar o modelo, ela ganha uma porta própria e explícita. A conexão com o proxy vem de
 * CLIPROXY_URL, CLIPROXY_MANAGEMENT_KEY e CLIPROXY_API_KEY (ver docs/ia-assinatura.md).
 */
@Module({
  imports: [AuditModule, CoreModule],
  controllers: [AssinaturaIaController],
  providers: [
    AssinaturaIaService,
    { provide: CliProxyPort, useClass: CliProxyHttpAdapter },
  ],
})
export class AssinaturaIaModule {}

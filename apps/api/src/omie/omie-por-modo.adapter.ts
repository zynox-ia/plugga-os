import { Inject, Injectable } from "@nestjs/common";
import type { EmpresaDoOmie, IntegrationMode } from "@plugga/shared";

import { IntegrationGate } from "../integrations/integration-gate";
import { OmieDubleAdapter } from "./omie-duble.adapter";
import { OmieHttpAdapter } from "./omie-http.adapter";
import { OmiePort, type CredenciaisDoOmie } from "./omie.port";

export type OperacaoNoOmie = "leitura" | "escrita";

/**
 * Quem atende cada operação, pelo modo da integração `omie` (regra do
 * Coordenador, 23/11/2026, depois de uma chamada real feita em `mock`):
 * - `mock` (o padrão, e a falta de registro): só o dublê local, nada sai para a rede;
 * - `read_only`: leituras reais (ListarEmpresas, extrato, baixas, categorias e
 *   contas); escrita, nunca;
 * - `bridge` e `write`: leituras e escritas reais.
 * Mudar o modo é da plataforma, com a autorização do André.
 */
export function adaptadorPara(modo: IntegrationMode, operacao: OperacaoNoOmie): "http" | "duble" {
  if (modo === "mock") return "duble";
  if (operacao === "leitura") return "http";
  return modo === "write" || modo === "bridge" ? "http" : "duble";
}

/** A porta do OMIE que o sistema usa: pergunta o modo a cada chamada. Falha fechada. */
@Injectable()
export class OmiePorModoAdapter extends OmiePort {
  constructor(
    @Inject(IntegrationGate) private readonly gate: IntegrationGate,
    @Inject(OmieHttpAdapter) private readonly http: OmieHttpAdapter,
    @Inject(OmieDubleAdapter) private readonly duble: OmieDubleAdapter,
  ) {
    super();
  }

  async consultarEmpresa(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie> {
    return (await this.alvo("leitura")).consultarEmpresa(credenciais);
  }

  async listarEmpresas(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie[]> {
    return (await this.alvo("leitura")).listarEmpresas(credenciais);
  }

  /** Os métodos de escrita (UpsertContaPagar, LancarPagamento…) chamam com "escrita". */
  protected async alvo(operacao: OperacaoNoOmie): Promise<OmiePort> {
    return adaptadorPara(await this.gate.modoDe("omie"), operacao) === "http" ? this.http : this.duble;
  }
}

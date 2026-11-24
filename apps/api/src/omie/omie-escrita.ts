import { Inject, Injectable } from "@nestjs/common";

import { IntegrationGate } from "../integrations/integration-gate";
import type { OperacaoNoOmie } from "../financeiro/omie-envios.rules";
import { OmieFalhouError } from "./omie.port";

export type PedidoDeEnvioAoOmie = {
  envioId: string;
  lancamentoId: string;
  empresa: string;
  tipo: "saida" | "entrada";
  operacao: OperacaoNoOmie;
};

/**
 * Escrita no OMIE (PLU-342): UpsertContaPagar, LancarPagamento, UpsertContaReceber…
 * A fila é a única que chama. Devolve o código do OMIE quando houver.
 */
export abstract class OmieEscrita {
  abstract enviar(pedido: PedidoDeEnvioAoOmie): Promise<{ codigo: string | null }>;
}

/**
 * A escrita real ainda não existe: os métodos e campos de cada chamada são conferidos
 * antes no "Aplicativo Teste" do OMIE, que o André cria quando for a hora de gravar
 * (D7 do desenho). Até lá, nada é gravado no OMIE, nem com o modo `write`: o envio
 * fica na fila com o motivo, e a fila tenta de novo mais tarde.
 */
@Injectable()
export class OmieEscritaPorModo extends OmieEscrita {
  constructor(@Inject(IntegrationGate) private readonly gate: IntegrationGate) {
    super();
  }

  async enviar(): Promise<{ codigo: string | null }> {
    const modo = await this.gate.modoDe("omie");
    if (modo === "mock") throw new OmieFalhouError("modo_mock");
    if (modo !== "write") throw new OmieFalhouError("modo_sem_escrita");
    throw new OmieFalhouError("escrita_nao_liberada");
  }
}

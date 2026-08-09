import { ConflictException } from "@nestjs/common";
import type { EnergyStudyStatus } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { assertPodeEnviar, podeTransicionar } from "./estudo.rules.js";

describe("máquina de estados da auditoria energética", () => {
  it("permite reconciliar estudos ativos anteriores ao invoiceContext", () => {
    const ativos: EnergyStudyStatus[] = [
      "rascunho",
      "aguardando_dados",
      "dados_recebidos",
      "em_extracao",
      "em_auditoria",
      "em_calculo",
      "relatorio_gerado",
      "em_validacao",
      "bloqueado",
      "aprovado_internamente",
    ];

    for (const status of ativos) {
      expect(podeTransicionar(status, "dados_recebidos"), status).toBe(true);
    }
  });

  it("não reabre estudos terminais para conciliação", () => {
    for (const status of ["enviado_cliente", "arquivado", "cancelado"] as const) {
      expect(podeTransicionar(status, "dados_recebidos"), status).toBe(false);
    }
  });

  it("exige assinatura no amarelo, mas não no verde conhecido", () => {
    expect(() => assertPodeEnviar("em_validacao", null, "amarelo")).toThrow(
      ConflictException,
    );
    expect(() => assertPodeEnviar("em_validacao", null, "verde")).not.toThrow();
  });
});

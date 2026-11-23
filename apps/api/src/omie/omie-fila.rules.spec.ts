import { describe, expect, it } from "vitest";

import { MAXIMO_DE_TENTATIVAS, PAUSA_MS, atrasoDaTentativa, destinoDaFalha } from "./omie-fila.rules";
import { OmieFalhouError } from "./omie.port";

const agora = new Date("2026-11-23T12:00:00Z");
const depois = (ms: number) => new Date(agora.getTime() + ms);

describe("fila do OMIE: o que fazer com cada falha (PLU-342)", () => {
  it("permanente vai direto a erro, sem nova tentativa", () => {
    for (const motivo of ["credenciais_invalidas", "recusada", "resposta_inesperada"] as const) {
      expect(destinoDaFalha(new OmieFalhouError(motivo), 0, agora)).toEqual({ tipo: "erro", motivo });
    }
  });

  it("limite de consumo e portão fechado adiam 30 minutos sem contar tentativa", () => {
    for (const motivo of ["limite_de_consumo", "modo_mock", "modo_sem_escrita", "escrita_nao_liberada"] as const) {
      expect(destinoDaFalha(new OmieFalhouError(motivo), 3, agora)).toEqual({ tipo: "adiar", motivo, proximaEm: depois(PAUSA_MS) });
    }
  });

  it("transitória volta com backoff exponencial de base 30 s e teto de 30 min", () => {
    expect(destinoDaFalha(new OmieFalhouError("indisponivel"), 0, agora)).toEqual({ tipo: "retentar", motivo: "indisponivel", tentativas: 1, proximaEm: depois(30_000) });
    expect(destinoDaFalha(new OmieFalhouError("indisponivel"), 2, agora)).toEqual({ tipo: "retentar", motivo: "indisponivel", tentativas: 3, proximaEm: depois(120_000) });
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(atrasoDaTentativa)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000]);
  });

  it("erro que não é do OMIE (timeout, rede) conta como indisponível", () => {
    expect(destinoDaFalha(new Error("socket hang up"), 0, agora)).toMatchObject({ tipo: "retentar", motivo: "indisponivel" });
  });

  it("na sexta falha transitória o envio vai a erro e espera Tentar de novo", () => {
    expect(destinoDaFalha(new OmieFalhouError("indisponivel"), MAXIMO_DE_TENTATIVAS - 2, agora)).toMatchObject({ tipo: "retentar", tentativas: MAXIMO_DE_TENTATIVAS - 1 });
    expect(destinoDaFalha(new OmieFalhouError("indisponivel"), MAXIMO_DE_TENTATIVAS - 1, agora)).toEqual({ tipo: "erro", motivo: "indisponivel" });
  });
});

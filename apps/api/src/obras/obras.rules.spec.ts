import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { ObraEtapa, RoleKey } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import {
  OBRA_TRANSICOES_PERMITIDAS,
  assertAlmoxarifeNaoAlteraCronogramaFinanceiro,
  assertAprCompleta,
  assertCampoNaoAlteraProjetoAprovado,
  assertEpiConferido,
  assertEtapaAtual,
  assertEvidenciaImutavel,
  assertFinanceiroNaoAlteraMedicaoTecnica,
  assertLiberacaoValida,
  assertReaberturaDeProjeto,
  assertTecnicoNaoEditaOrcamento,
  assertTransicaoPermitida,
  incidenteBloqueiaEtapa,
} from "./obras.rules";

const TECNICO = { roles: ["tecnico"] as RoleKey[] };
const SUPERVISOR = { roles: ["supervisor"] as RoleKey[] };
const ENGENHEIRO = { roles: ["engenheiro"] as RoleKey[] };
const DIRETORIA = { roles: ["diretoria"] as RoleKey[] };
const ALMOXARIFE = { roles: ["almoxarife"] as RoleKey[] };
const FINANCEIRO = { roles: ["financeiro"] as RoleKey[] };

describe("assertTransicaoPermitida", () => {
  it.each([
    ["obra_criada", "projeto_em_elaboracao"],
    ["projeto_em_elaboracao", "em_aprovacao_tecnica"],
    ["em_aprovacao_tecnica", "projeto_aprovado"],
    ["em_aprovacao_tecnica", "projeto_em_elaboracao"],
    ["projeto_aprovado", "liberacao_campo_pendente"],
    ["liberacao_campo_pendente", "liberada_para_execucao"],
    ["liberada_para_execucao", "em_execucao"],
    ["em_execucao", "pendencia_campo"],
    ["em_execucao", "medicao_tecnica"],
    ["pendencia_campo", "em_execucao"],
    ["medicao_tecnica", "medicao_aprovada"],
    ["medicao_tecnica", "em_execucao"],
    ["medicao_aprovada", "obra_concluida_tecnicamente"],
    ["obra_concluida_tecnicamente", "obra_encerrada"],
  ] as [ObraEtapa, ObraEtapa][])("permite %s → %s", (de, para) => {
    expect(() => assertTransicaoPermitida(de, para)).not.toThrow();
  });

  it.each([
    ["obra_criada", "em_execucao"],
    ["projeto_em_elaboracao", "projeto_aprovado"],
    ["liberada_para_execucao", "medicao_aprovada"],
    ["medicao_aprovada", "em_execucao"],
  ] as [ObraEtapa, ObraEtapa][])("recusa o pulo de %s para %s", (de, para) => {
    expect(() => assertTransicaoPermitida(de, para)).toThrow(BadRequestException);
  });

  it("não permite a reabertura de projeto_aprovado como aresta normal do grafo", () => {
    expect(() => assertTransicaoPermitida("projeto_aprovado", "projeto_em_elaboracao")).toThrow(
      BadRequestException,
    );
  });

  it("trata obra_encerrada como terminal", () => {
    expect(() => assertTransicaoPermitida("obra_encerrada", "obra_criada")).toThrow(BadRequestException);
  });

  it("todo estado mensurado tem pelo menos uma saída, exceto o terminal", () => {
    for (const [etapa, destinos] of Object.entries(OBRA_TRANSICOES_PERMITIDAS) as [
      ObraEtapa,
      readonly ObraEtapa[],
    ][]) {
      if (etapa === "obra_encerrada") {
        expect(destinos).toHaveLength(0);
      } else {
        expect(destinos.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("assertEtapaAtual", () => {
  it("aceita quando a etapa atual é a esperada", () => {
    expect(() => assertEtapaAtual("em_execucao", "em_execucao")).not.toThrow();
  });

  it("recusa quando a etapa atual diverge, mesmo com aresta válida para o destino comum", () => {
    // pendencia_campo e medicao_tecnica chegam ambos em em_execucao; uma ação
    // que só faz sentido vindo de medicao_tecnica não pode aceitar
    // pendencia_campo como origem.
    expect(() => assertEtapaAtual("pendencia_campo", "medicao_tecnica")).toThrow(BadRequestException);
  });
});

describe("assertReaberturaDeProjeto", () => {
  it("diretoria reabre sem justificativa", () => {
    expect(() => assertReaberturaDeProjeto(DIRETORIA, null)).not.toThrow();
  });

  it("engenheiro reabre com justificativa", () => {
    expect(() => assertReaberturaDeProjeto(ENGENHEIRO, "erro de cota no diagrama unifilar")).not.toThrow();
  });

  it("engenheiro sem justificativa é recusado", () => {
    expect(() => assertReaberturaDeProjeto(ENGENHEIRO, "")).toThrow(BadRequestException);
    expect(() => assertReaberturaDeProjeto(ENGENHEIRO, null)).toThrow(BadRequestException);
  });

  it("supervisor não pode reabrir projeto aprovado", () => {
    expect(() => assertReaberturaDeProjeto(SUPERVISOR, "motivo qualquer")).toThrow(ForbiddenException);
  });
});

describe("assertEvidenciaImutavel", () => {
  it("sempre recusa — não existe correção de evidência, só novo registro", () => {
    expect(() => assertEvidenciaImutavel()).toThrow(ForbiddenException);
  });
});

describe("assertAprCompleta", () => {
  it("aceita quando as duas assinaturas mínimas existem", () => {
    expect(() =>
      assertAprCompleta({ segurancaAssinouEm: new Date(), supervisorAssinouEm: new Date() }),
    ).not.toThrow();
  });

  it.each([
    [null, new Date()],
    [new Date(), null],
    [null, null],
  ])("recusa quando falta assinatura", (segurancaAssinouEm, supervisorAssinouEm) => {
    expect(() => assertAprCompleta({ segurancaAssinouEm, supervisorAssinouEm })).toThrow(BadRequestException);
  });
});

describe("assertEpiConferido", () => {
  it("aceita quando a conferência está completa", () => {
    expect(() => assertEpiConferido({ conferidoEm: new Date(), conferidoPorId: "user-1" })).not.toThrow();
  });

  it("recusa sem conferência", () => {
    expect(() => assertEpiConferido({ conferidoEm: null, conferidoPorId: null })).toThrow(BadRequestException);
  });
});

describe("assertLiberacaoValida", () => {
  it("aceita liberação não revogada", () => {
    expect(() => assertLiberacaoValida({ liberadoEm: new Date(), revogadoEm: null })).not.toThrow();
  });

  it("recusa liberação revogada", () => {
    expect(() => assertLiberacaoValida({ liberadoEm: new Date(), revogadoEm: new Date() })).toThrow(
      ForbiddenException,
    );
  });
});

describe("incidenteBloqueiaEtapa", () => {
  it("incidente grave sem liberação bloqueia", () => {
    expect(incidenteBloqueiaEtapa({ gravidade: "grave", liberadoEm: null })).toBe(true);
  });

  it("incidente grave já liberado não bloqueia", () => {
    expect(incidenteBloqueiaEtapa({ gravidade: "grave", liberadoEm: new Date() })).toBe(false);
  });

  it("incidente não grave não bloqueia", () => {
    expect(incidenteBloqueiaEtapa({ gravidade: "leve", liberadoEm: null })).toBe(false);
  });
});

describe("regras-mãe de bloqueio (POP §1.2)", () => {
  it("técnico puro não edita orçamento", () => {
    expect(() => assertTecnicoNaoEditaOrcamento(TECNICO)).toThrow(ForbiddenException);
  });

  it("técnico que também é engenheiro pode editar orçamento", () => {
    expect(() => assertTecnicoNaoEditaOrcamento({ roles: ["tecnico", "engenheiro"] })).not.toThrow();
  });

  it("campo não altera projeto fora da elaboração", () => {
    expect(() => assertCampoNaoAlteraProjetoAprovado("projeto_aprovado", TECNICO)).toThrow(ForbiddenException);
    expect(() => assertCampoNaoAlteraProjetoAprovado("em_execucao", SUPERVISOR)).toThrow(ForbiddenException);
  });

  it("campo pode editar durante a elaboração", () => {
    expect(() => assertCampoNaoAlteraProjetoAprovado("projeto_em_elaboracao", TECNICO)).not.toThrow();
  });

  it("engenheiro e diretoria não são bloqueados pela regra de campo", () => {
    expect(() => assertCampoNaoAlteraProjetoAprovado("projeto_aprovado", ENGENHEIRO)).not.toThrow();
    expect(() => assertCampoNaoAlteraProjetoAprovado("projeto_aprovado", DIRETORIA)).not.toThrow();
  });

  it("almoxarife puro não altera cronograma financeiro", () => {
    expect(() => assertAlmoxarifeNaoAlteraCronogramaFinanceiro(ALMOXARIFE)).toThrow(ForbiddenException);
  });

  it("financeiro puro não altera medição técnica", () => {
    expect(() => assertFinanceiroNaoAlteraMedicaoTecnica(FINANCEIRO)).toThrow(ForbiddenException);
  });

  it("financeiro que também é engenheiro pode alterar medição técnica", () => {
    expect(() =>
      assertFinanceiroNaoAlteraMedicaoTecnica({ roles: ["financeiro", "engenheiro"] }),
    ).not.toThrow();
  });
});

import { cadastrarObraSchema, editarObraSchema, type Acesso } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { conferirPeriodo, distribuirMarcos, ehArquivoDoMsProject, gerenteDasObras, marcoAtrasado, operaObras, proximoMarco, situacaoDaObra } from "./obras.rules";

const eng = (telas: string[], nivel: "membro" | "gerente" = "membro") => ({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel, telas }] }) as unknown as Acesso;

describe("obras: quem pode o quê", () => {
  it("a tela de Obras opera; o orçamento é do gerente com a tela", () => {
    expect(operaObras(eng(["engenharia-obras.obras"]))).toBe(true);
    expect(operaObras(eng(["engenharia-obras.os"]))).toBe(false);
    expect(gerenteDasObras(eng(["engenharia-obras.obras"], "gerente"))).toBe(true);
    expect(gerenteDasObras(eng(["engenharia-obras.obras"]))).toBe(false);
    expect(gerenteDasObras(eng(["engenharia-obras.os"], "gerente"))).toBe(false);
    expect(gerenteDasObras({ plataforma: "admin", departamentos: [] } as unknown as Acesso)).toBe(true);
  });
});

describe("obras: marcos", () => {
  it("os 6 marcos padrão distribuídos por igual, o primeiro no início e o último na entrega", () => {
    const m = distribuirMarcos("2026-10-20", "2027-02-26");
    expect(m.map((x) => x.nome)).toEqual(["Contrato assinado", "Projeto aprovado", "Material entregue", "Instalação concluída", "Comissionamento", "Termo de entrega"]);
    expect(m[0]!.previstoEm).toBe("2026-10-20");
    expect(m[5]!.previstoEm).toBe("2027-02-26");
    expect(m.map((x) => x.previstoEm)).toEqual([...m.map((x) => x.previstoEm)].sort());
    // Obra curta: dois dias ainda dá 6 marcos dentro do período.
    expect(distribuirMarcos("2026-11-23", "2026-11-25").every((x) => x.previstoEm >= "2026-11-23" && x.previstoEm <= "2026-11-25")).toBe(true);
  });

  it("atrasado, próximo e situação", () => {
    expect(marcoAtrasado("2026-11-20", null, "2026-11-23")).toBe(true);
    expect(marcoAtrasado("2026-11-23", null, "2026-11-23")).toBe(false);
    expect(marcoAtrasado("2026-11-20", "2026-11-21", "2026-11-23")).toBe(true);
    expect(marcoAtrasado("2026-11-20", "2026-11-20", "2026-11-23")).toBe(false);
    const marcos = [{ ordem: 2, feito: false }, { ordem: 1, feito: true }, { ordem: 3, feito: false }];
    expect(proximoMarco(marcos)?.ordem).toBe(2);
    expect(situacaoDaObra([])).toBe("sem_marcos");
    expect(situacaoDaObra(marcos)).toBe("em_andamento");
    expect(situacaoDaObra(marcos.map((x) => ({ ...x, feito: true })))).toBe("entregue");
  });
});

describe("obras: período e arquivos", () => {
  it("o início pode ser passado; a entrega vem depois do início e a partir de amanhã", () => {
    expect(() => conferirPeriodo("2026-09-01", "2026-11-24", "2026-11-23")).not.toThrow();
    expect(() => conferirPeriodo("2026-11-23", "2026-11-23", "2026-11-23")).toThrow(RequisicaoInvalida);
    try { conferirPeriodo("2026-09-01", "2026-11-23", "2026-11-23"); expect.unreachable(); } catch (e) { expect((e as RequisicaoInvalida).detalhes?.[0]?.problema).toMatch(/a partir de amanhã/); }
    expect(cadastrarObraSchema.safeParse({ empresa: "waze", clienteId: "00000000-0000-4000-8000-000000000001", nome: "Obra", potenciaKwp: "61,2", inicioEm: "2026-11-23", entregaPrevistaEm: "2026-11-22" }).success).toBe(false);
    expect(cadastrarObraSchema.safeParse({ empresa: "waze", clienteId: "00000000-0000-4000-8000-000000000001", nome: "Obra", potenciaKwp: "61,2", tipo: "interno", inicioEm: "2026-11-23", entregaPrevistaEm: "2026-11-30" }).success).toBe(false);
  });

  it("orçamento e potência maiores que zero, no contrato (o CHECK do banco também recusa)", () => {
    expect(editarObraSchema.safeParse({ orcamento: "0" }).success).toBe(false);
    expect(editarObraSchema.safeParse({ orcamento: "0,00" }).success).toBe(false);
    expect(editarObraSchema.safeParse({ potenciaKwp: "0" }).success).toBe(false);
    expect(editarObraSchema.parse({ orcamento: "125000,50" }).orcamento).toBe("125000.50");
    expect(editarObraSchema.parse({ orcamento: null }).orcamento).toBeNull();
  });

  it("o .mpp é reconhecido pela assinatura OLE e pela extensão", () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(ehArquivoDoMsProject(ole, "Cronograma.mpp")).toBe(true);
    expect(ehArquivoDoMsProject(ole, "planilha.xls")).toBe(false);
    expect(ehArquivoDoMsProject(Buffer.from("%PDF-1.4"), "falso.mpp")).toBe(false);
  });
});

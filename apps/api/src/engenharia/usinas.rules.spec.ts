import { conferirPlataformaSchema, criarUsinaSchema, pareceCredencial, potenciaKwpSchema } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { conferirObservacaoDeAcesso, daEngenharia, gerenteDasUsinas, idDaPlataforma, kwpCurto, operaUsinas, ordenarCards, somarKwp, tipoDaOrdemDaExcecao, violouUsinaDoComissionamento } from "./usinas.rules";

const acesso = (nivel: "membro" | "gerente", telas: string[]) => ({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel, telas }] }) as never;

describe("usinas: quem pode o quê", () => {
  it("lê quem é da Engenharia; cadastra e confere a tela de Usinas; plataformas o gerente com Usinas", () => {
    expect(daEngenharia(acesso("membro", ["engenharia-obras.os"]))).toBe(true);
    expect(daEngenharia(acesso("membro", []))).toBe(false);
    expect(operaUsinas(acesso("membro", ["engenharia-obras.usinas"]))).toBe(true);
    expect(operaUsinas(acesso("gerente", ["engenharia-obras.os"]))).toBe(false);
    expect(gerenteDasUsinas(acesso("gerente", ["engenharia-obras.usinas"]))).toBe(true);
    expect(gerenteDasUsinas(acesso("gerente", ["engenharia-obras.os"]))).toBe(false);
    expect(gerenteDasUsinas(acesso("membro", ["engenharia-obras.usinas"]))).toBe(false);
    expect(gerenteDasUsinas({ plataforma: "admin", departamentos: [] } as never)).toBe(true);
  });
});

describe("plataformas: a observação de acesso nunca guarda senha", () => {
  it("recusa texto com cara de credencial", () => {
    for (const texto of ["senha: 1234", "Senha=abc", "password do Marcus", "login waze / pwd: x", "usuario:segredo@growatt", "user:pass@server", "a1b2c3d4e5f6g7h8i9j0k1l2", "token = abc", "Waze2026Growatt!Acesso"]) {
      expect(pareceCredencial(texto), texto).toBe(true);
      expect(() => conferirObservacaoDeAcesso(texto), texto).toThrow(RequisicaoInvalida);
    }
  });

  it("aceita dizer onde está o acesso", () => {
    for (const texto of ["Login da Waze no cofre", "Acesso no cofre, pasta Engenharia", "Conta compartilhada; pedir ao Marcus", "https://server.growatt.com/login"]) {
      expect(pareceCredencial(texto), texto).toBe(false);
      expect(() => conferirObservacaoDeAcesso(texto)).not.toThrow();
    }
    expect(() => conferirObservacaoDeAcesso(null)).not.toThrow();
  });

  it("o id vem do nome, sem acento nem espaço", () => {
    expect(idDaPlataforma("Hypon Cloud")).toBe("hypon-cloud");
    expect(idDaPlataforma("FusionSolar")).toBe("fusionsolar");
    expect(idDaPlataforma("Sólis  Nova")).toBe("solis-nova");
  });
});

describe("usinas: potência e cards", () => {
  it("aceita 12,75 e 12.75, recusa zero e texto", () => {
    expect(potenciaKwpSchema.parse("12,75")).toBe("12.75");
    expect(potenciaKwpSchema.parse("82")).toBe("82");
    expect(potenciaKwpSchema.safeParse("0").success).toBe(false);
    expect(potenciaKwpSchema.safeParse("12,7555").success).toBe(false);
    expect(potenciaKwpSchema.safeParse("doze").success).toBe(false);
    const base = { empresa: "waze", clienteId: "00000000-0000-4000-8000-000000000001", ucId: "00000000-0000-4000-8000-000000000002", nome: "Telhado", plataformaId: "growatt", comissionadaEm: "2025-03-14" };
    expect(criarUsinaSchema.parse({ ...base, potenciaKwp: "12,4" }).potenciaKwp).toBe("12.4");
  });

  it("soma e encurta o kWp sem erro de ponto flutuante", () => {
    expect(somarKwp(["12.4", "24.6", "0.1", "0.2"])).toBe("37.3");
    expect(somarKwp([])).toBe("0");
    expect(kwpCurto("12.750")).toBe("12.75");
    expect(kwpCurto("8.000")).toBe("8");
    expect(kwpCurto("120")).toBe("120");
  });

  it("pendentes primeiro, depois as com mais exceções, depois a ordem da plataforma", () => {
    const card = (id: string, ordem: number, excecoes: number | null) => ({
      ordem, plataforma: { id, nome: id }, empresa: "waze" as const, usinas: [],
      conferencia: excecoes === null ? null : { id: "00000000-0000-4000-8000-000000000009", conferida: { por: null, em: "2026-11-23T12:00:00.000Z" }, print: { id: "00000000-0000-4000-8000-000000000009", nome: "p.png", tamanhoBytes: 1, mime: "image/png", url: "/x" }, normais: 0,
        excecoes: Array.from({ length: excecoes }, () => ({ usinaId: "00000000-0000-4000-8000-000000000008", usina: "u", situacao: "anomalia" as const, nota: null, ordem: null })) },
    });
    expect(ordenarCards([card("growatt", 7, 0), card("solis", 3, 2), card("solax", 4, null), card("livoltek", 1, null)]).map((c) => c.plataforma.id)).toEqual(["livoltek", "solax", "solis", "growatt"]);
  });

  it("anomalia abre manutenção; sem comunicação, configuração", () => {
    expect(tipoDaOrdemDaExcecao("anomalia")).toBe("manutencao");
    expect(tipoDaOrdemDaExcecao("sem_comunicacao")).toBe("configuracao");
  });
});

describe("conferência: o que o formulário manda", () => {
  const usina = "00000000-0000-4000-8000-000000000003";
  it("resultados em JSON no multipart; vazio = tudo normal", () => {
    expect(conferirPlataformaSchema.parse({ empresa: "waze" }).resultados).toEqual([]);
    expect(conferirPlataformaSchema.parse({ empresa: "waze", resultados: "" }).resultados).toEqual([]);
    expect(conferirPlataformaSchema.parse({ empresa: "waze", resultados: JSON.stringify([{ usinaId: usina, situacao: "anomalia", nota: "Geração baixa", abrirOs: true }]) }).resultados).toHaveLength(1);
  });

  it("exceção pede nota; normal não abre O.S.; usina não se repete", () => {
    expect(conferirPlataformaSchema.safeParse({ empresa: "waze", resultados: [{ usinaId: usina, situacao: "anomalia" }] }).success).toBe(false);
    expect(conferirPlataformaSchema.safeParse({ empresa: "waze", resultados: [{ usinaId: usina, situacao: "normal", abrirOs: true }] }).success).toBe(false);
    expect(conferirPlataformaSchema.safeParse({ empresa: "waze", resultados: [{ usinaId: usina, situacao: "normal" }, { usinaId: usina, situacao: "normal" }] }).success).toBe(false);
    expect(conferirPlataformaSchema.safeParse({ empresa: "waze", resultados: "não é json" }).success).toBe(false);
  });
});

describe("usina do comissionamento: o 409 certo na corrida", () => {
  it("reconhece o índice pelo nome ou pelas colunas", () => {
    expect(violouUsinaDoComissionamento({ target: "usinas_uma_por_comissionamento" })).toBe(true);
    expect(violouUsinaDoComissionamento({ target: ["ordem_de_comissionamento_id"] })).toBe(true);
    expect(violouUsinaDoComissionamento({ target: ["consumer_unit_id", "nome"] })).toBe(false);
    expect(violouUsinaDoComissionamento(undefined)).toBe(false);
  });
});

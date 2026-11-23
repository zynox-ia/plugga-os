import { describe, expect, it } from "vitest";

import { codigoDeUc, lerCsv, lerData, lerEmpresa, lerLinhas, normalizarLinha } from "./importacao-de-usinas";

// Planilha sintética: nenhum dado real.
const PLANILHA = [
  "﻿Cliente;UC;Usina;Plataforma;kWp;Fabricante;Comissionamento;Empresa",
  'Cliente Sintético A;UC 9999100200;Telhado;Growatt;12,75;"Growatt; MIN";14/03/2025;Waze Energia',
  '"Cliente ""B"" Sintético";9999100300;Galpão;FusionSolar;24.6;;2025-08-02;',
  "",
  "Cliente C;;Sem UC;Solis;0;;31/02/2025;Outra",
].join("\r\n");

describe("importação: ler o CSV", () => {
  it("separa por ponto e vírgula, respeita aspas e tira o BOM e as linhas vazias", () => {
    const csv = lerCsv(PLANILHA);
    expect(csv).toHaveLength(4);
    expect(csv[0]![0]).toBe("Cliente");
    expect(csv[1]![5]).toBe("Growatt; MIN");
    expect(csv[2]![0]).toBe('Cliente "B" Sintético');
  });

  it("também lê vírgula", () => {
    expect(lerCsv("Cliente,UC\nA,1\n")).toEqual([["Cliente", "UC"], ["A", "1"]]);
  });

  it("acha as colunas pelo cabeçalho, sem acento nem caixa, e pelo mapeamento", () => {
    const { linhas, faltando } = lerLinhas(lerCsv(PLANILHA), {});
    expect(faltando).toEqual([]);
    expect(linhas[0]).toEqual({ linha: 2, valores: expect.objectContaining({ cliente: "Cliente Sintético A", uc: "UC 9999100200", potenciaKwp: "12,75", empresa: "Waze Energia" }) });
    const outra = lerCsv("Nome do cliente;Unidade;Nome;Portal;Potência\nA;1;T;Growatt;5");
    expect(lerLinhas(outra, {}).faltando).toEqual(["cliente", "uc", "nome", "plataforma", "potenciaKwp"]);
    expect(lerLinhas(outra, { cliente: "nome do cliente", uc: "Unidade", nome: "Nome", plataforma: "portal", potenciaKwp: "POTENCIA" }).faltando).toEqual([]);
  });
});

describe("importação: normalizar a linha", () => {
  const linhas = lerLinhas(lerCsv(PLANILHA), {}).linhas;

  it("lê kWp com vírgula, data brasileira e a empresa pela coluna ou a padrão", () => {
    expect(normalizarLinha(linhas[0]!, "plugga", "2026-11-23")).toMatchObject({ potenciaKwp: "12.75", comissionadaEm: "2025-03-14", empresa: "waze", fabricante: "Growatt; MIN", problemas: [] });
    expect(normalizarLinha(linhas[1]!, "plugga", "2026-11-23")).toMatchObject({ potenciaKwp: "24.6", comissionadaEm: "2025-08-02", empresa: "plugga", problemas: [] });
  });

  it("anota o que está errado: UC faltando, kWp zero, data inexistente, empresa desconhecida", () => {
    expect(normalizarLinha(linhas[2]!, "waze", "2026-11-23").problemas).toEqual([
      "falta o UC", "potência em kWp inválida", "data de comissionamento inválida (use dd/mm/aaaa)", "empresa desconhecida (use Plugga ou Waze)",
    ]);
  });

  it("datas, empresa e código de UC", () => {
    expect(lerData("1/2/2025")).toBe("2025-02-01");
    expect(lerData("29/02/2025")).toBeNull();
    expect(lerData("2025-13-01")).toBeNull();
    expect(lerEmpresa("PLUGGA", "waze")).toBe("plugga");
    expect(lerEmpresa(undefined, "waze")).toBe("waze");
    expect(codigoDeUc("UC 9999.100.200-3")).toBe("99991002003");
    expect(codigoDeUc("9999100200")).toBe(codigoDeUc("uc9999100200"));
  });
});

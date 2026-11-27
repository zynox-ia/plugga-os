import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { montarRelatorioPorCategoria, periodoDoRelatorio, type SomaDaCategoria } from "./relatorio-por-categoria.rules";

const d = (v: string) => new Prisma.Decimal(v);
const IMPOSTOS = "Impostos e taxas";
const ids = { iss: "11111111-1111-4111-8111-111111111111", issWaze: "22222222-2222-4222-8222-222222222222", inss: "33333333-3333-4333-8333-333333333333", servico: "44444444-4444-4444-8444-444444444444", energia: "55555555-5555-4555-8555-555555555555" };

const soma = (over: Partial<SomaDaCategoria>): SomaDaCategoria => ({
  tipo: "saida", categoriaId: null, codigo: null, nome: null, grupoNome: null, total: d("0"), quantidade: 1, ...over,
});

const linhas: SomaDaCategoria[] = [
  soma({ categoriaId: ids.iss, codigo: "2.04.01", nome: "ISS", grupoNome: IMPOSTOS, total: d("300.00"), quantidade: 2 }),
  soma({ categoriaId: ids.issWaze, codigo: "2.04.01", nome: "ISS", grupoNome: IMPOSTOS, total: d("100.00"), quantidade: 1 }),
  soma({ categoriaId: ids.inss, codigo: "2.04.02", nome: "INSS", grupoNome: IMPOSTOS, total: d("200.00"), quantidade: 1 }),
  soma({ categoriaId: ids.servico, codigo: "2.01.03", nome: "Serviços de terceiros", grupoNome: "Custos dos serviços", total: d("150.50"), quantidade: 3 }),
  soma({ total: d("49.50"), quantidade: 1 }),
  soma({ tipo: "entrada", categoriaId: ids.energia, codigo: "1.01.01", nome: "Gestão de energia", grupoNome: "Receitas", total: d("1000.00"), quantidade: 4 }),
];
const ambos = { saidas: true, entradas: true };

describe("relatório por grupo e categoria (PLU-360)", () => {
  it("agrupa pelos dois primeiros níveis do código, na ordem do plano, com Sem categoria por último", () => {
    const r = montarRelatorioPorCategoria({ de: "2026-11-01", ate: "2026-11-30", empresa: null, papel: ambos, linhas });
    expect(r.saidas?.grupos.map((g) => [g.codigo, g.nome, g.total, g.quantidade])).toEqual([
      ["2.01", "Custos dos serviços", "150.50", 3],
      ["2.04", IMPOSTOS, "600.00", 4],
      [null, "Sem categoria", "49.50", 1],
    ]);
    expect(r.saidas?.total).toBe("800.00");
    expect(r.saidas?.quantidade).toBe(8);
  });

  it("com as duas empresas, a mesma categoria soma numa linha e guarda os ids de cada uma", () => {
    const r = montarRelatorioPorCategoria({ de: "2026-11-01", ate: "2026-11-30", empresa: null, papel: ambos, linhas });
    const impostos = r.saidas!.grupos.find((g) => g.codigo === "2.04")!;
    expect(impostos.categorias.map((c) => [c.codigo, c.nome, c.total, c.quantidade, c.categorias])).toEqual([
      ["2.04.01", "ISS", "400.00", 3, [ids.iss, ids.issWaze]],
      ["2.04.02", "INSS", "200.00", 1, [ids.inss]],
    ]);
    const sem = r.saidas!.grupos.at(-1)!;
    expect(sem.categorias).toEqual([{ chave: "sem", codigo: null, nome: "Sem categoria", categorias: [], total: "49.50", quantidade: 1, percentual: "6.2" }]);
  });

  it("o percentual é sobre a seção, com uma casa e arredondado", () => {
    const r = montarRelatorioPorCategoria({ de: "2026-11-01", ate: "2026-11-30", empresa: null, papel: ambos, linhas });
    const impostos = r.saidas!.grupos.find((g) => g.codigo === "2.04")!;
    expect(impostos.percentual).toBe("75.0");
    expect(impostos.categorias.map((c) => c.percentual)).toEqual(["50.0", "25.0"]);
    // 150.50 / 800 = 18.8125%
    expect(r.saidas!.grupos[0]!.percentual).toBe("18.8");
    expect(r.entradas!.grupos[0]!.percentual).toBe("100.0");
  });

  it("o resultado é entradas menos saídas, com sinal, e só vem com os dois lados", () => {
    const r = montarRelatorioPorCategoria({ de: "2026-11-01", ate: "2026-11-30", empresa: "plugga", papel: ambos, linhas });
    expect(r.resultado).toBe("200.00");
    const negativo = montarRelatorioPorCategoria({ de: "2026-11-01", ate: "2026-11-30", empresa: null, papel: ambos, linhas: linhas.filter((l) => l.tipo === "saida") });
    expect(negativo.resultado).toBe("-800.00");
    expect(negativo.entradas).toEqual({ total: "0.00", quantidade: 0, grupos: [] });
  });

  it("a seção que a sessão não vê vem nula, sem somar nada, e o resultado também", () => {
    const soSaidas = montarRelatorioPorCategoria({ de: "2026-11-01", ate: "2026-11-30", empresa: null, papel: { saidas: true, entradas: false }, linhas });
    expect(soSaidas.entradas).toBeNull();
    expect(soSaidas.saidas?.total).toBe("800.00");
    expect(soSaidas.resultado).toBeNull();
    const nenhum = montarRelatorioPorCategoria({ de: "2026-11-01", ate: "2026-11-30", empresa: null, papel: { saidas: false, entradas: false }, linhas });
    expect([nenhum.entradas, nenhum.saidas, nenhum.resultado]).toEqual([null, null, null]);
  });

  it("categoria que a sessão não lê não se mistura com Sem categoria", () => {
    const r = montarRelatorioPorCategoria({ de: "2026-11-01", ate: "2026-11-30", empresa: null, papel: ambos, linhas: [soma({ categoriaId: ids.inss, total: d("10.00") }), soma({ total: d("5.00") })] });
    expect(r.saidas!.grupos.map((g) => [g.chave, g.nome, g.total])).toEqual([["indisponivel", "Categoria indisponível", "10.00"], ["sem", "Sem categoria", "5.00"]]);
    expect(r.saidas!.grupos[0]!.categorias[0]!.categorias).toEqual([ids.inss]);
  });

  it("o período vai do início do primeiro dia até, exclusive, o início do dia seguinte ao último, em Manaus (UTC-4)", () => {
    const { desde, antes } = periodoDoRelatorio("2026-11-01", "2026-11-30");
    expect(desde.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    // Semiaberto: o banco guarda microssegundos, então não há "último instante" em milissegundos.
    expect(antes.toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(periodoDoRelatorio("2026-12-31", "2026-12-31").antes.toISOString()).toBe("2027-01-01T04:00:00.000Z");
    expect(periodoDoRelatorio("2028-02-28", "2028-02-28").antes.toISOString()).toBe("2028-02-29T04:00:00.000Z");
    // Os extremos da faixa do contrato (2000-01-01 a 2100-12-31) dão instantes válidos.
    expect(periodoDoRelatorio("2000-01-01", "2100-12-31")).toEqual({ desde: new Date("2000-01-01T04:00:00.000Z"), antes: new Date("2101-01-01T04:00:00.000Z") });
  });
});

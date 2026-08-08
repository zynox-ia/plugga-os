import { PREMISSAS_2026_08, type InvoiceData } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { auditarFatura } from "../calculo/auditoria.js";
import { calcularEconomia } from "../calculo/cenarios.js";
import { analisarDemanda } from "../calculo/demanda.js";
import { dimensionar } from "../calculo/dimensionamento.js";
import { calcularFinanceiro } from "../calculo/financeiro.js";
import {
  HASH_MODELO_APROVADO,
  MARCADORES_DO_CASO_FONTE,
  carregarEnvelope,
} from "./envelope.js";
import { gerarRelatorio, type EntradaDoRelatorio } from "./relatorio.js";
import { TITULOS_OBRIGATORIOS, validarDocumento } from "./validacao.js";

const premissas = PREMISSAS_2026_08;

/** A M Química — cenário cativo estimado, ref. 06/2026. */
const FATURA: InvoiceData = {
  consumoPontaKwh: 4_275,
  consumoForaPontaKwh: 126_050,
  tarifaPonta: 1.82396,
  tarifaForaPonta: 0.53899,
  valorPonta: 7_797.43,
  valorForaPonta: 67_939.69,
  valorDemanda: 15_827.0,
  valorTotal: 100_881.25,
  demandaContratadaKw: 700,
  demandaMedidaPontaKw: 249,
  demandaMedidaForaPontaKw: 586,
  tarifaDemanda: 22.61,
  valorReativo: 571.22,
  valorBeneficioFiscal: 0,
  valorMultasJurosEncargos: 0,
};

function montarEntrada(): EntradaDoRelatorio {
  const auditoria = auditarFatura(FATURA);
  const dimensionamento = dimensionar({ fatura: FATURA, premissas });
  const economia = calcularEconomia({ fatura: FATURA, premissas, dimensionamento });
  const financeiro = calcularFinanceiro({
    premissas,
    dimensionamento,
    economiaAno1: economia.economiaAno1,
  });
  const demanda = analisarDemanda({
    demandaContratadaKw: 700,
    historicoKw: [634, 704, 705, 698, 668, 586],
    tarifaDemanda: 22.61,
    premissas,
  });

  return {
    caso: {
      cliente: "A M QUIMICA INDUSTRIA E COMERCIO DE PRODUTOS QUIMICOS LTDA",
      unidadeConsumidora: "0000033531002-19",
      distribuidora: "Amazonas Energia",
      localidade: "Manaus/AM",
      grupoModalidade: "Grupo A · A4 · Horossazonal Verde",
      referencia: "06/2026",
    },
    fatura: FATURA,
    premissas,
    auditoria,
    demanda,
    dimensionamento,
    economia,
    financeiro,
  };
}

describe("envelope congelado", () => {
  it("confere o hash do modelo aprovado", () => {
    const envelope = carregarEnvelope();
    expect(envelope.hash).toBe(HASH_MODELO_APROVADO);
  });

  it("separa cabeçalho e rodapé, descartando o corpo do modelo", () => {
    const envelope = carregarEnvelope();

    expect(envelope.cabecalho).toContain("<style");
    expect(envelope.cabecalho).toContain('class="hero"');
    expect(envelope.rodape).toContain('class="footer"');
    // O corpo do modelo não entra: as seções vêm das regras.
    expect(envelope.cabecalho).not.toContain("2. Identificação da unidade consumidora");
  });
});

describe("geração do relatório", () => {
  const { html, problemas } = gerarRelatorio(montarEntrada());

  it("passa na validação bloqueante sem nenhum problema", () => {
    expect(problemas).toEqual([]);
  });

  it("tem as dez seções obrigatórias, inclusive as que faltam no modelo", () => {
    for (const titulo of TITULOS_OBRIGATORIOS) {
      expect(html).toContain(titulo);
    }
    // As duas que o modelo congelado não tem e as regras exigem.
    expect(html).toContain("Análise de eficiência energética");
    expect(html).toContain("Economia acumulada projetada");
  });

  /**
   * O hero do modelo traz o cliente, a UC e a distribuidora do caso que o
   * originou. Numa primeira versão o relatório da A M Química saiu com
   * "MERCANTIL NOVA ERA LTDA • UC 01374052 • Roraima Energia" no topo — o
   * mesmo erro que fez o gerador original listar marcadores do caso-fonte.
   */
  it("substitui o cabeçalho e não deixa resíduo do caso-fonte", () => {
    expect(html).toContain("A M QUIMICA INDUSTRIA E COMERCIO DE PRODUTOS QUIMICOS LTDA");
    expect(html).toContain("0000033531002-19");
    expect(html).toContain("Amazonas Energia");

    for (const marcador of MARCADORES_DO_CASO_FONTE) {
      expect(html).not.toContain(marcador);
    }
  });

  it("mantém a identidade visual do modelo aprovado", () => {
    expect(html).toContain('class="hero"');
    expect(html).toContain('class="footer"');
    expect(html).toContain("data:image/png;base64");
  });

  it("escreve dinheiro por extenso, nunca abreviado", () => {
    expect(html).toContain("R$ 100.881,25");
    expect(html).not.toMatch(/R\$\s?[\d.,]+\s?(mi|mil)\b/i);
  });

  it("não abre fórmula nem termo interno para o cliente", () => {
    const visivel = html.replace(/<[^>]+>/g, " ");
    for (const proibido of ["all-in", "debug", "rascunho", "conforme Dilkson"]) {
      expect(visivel.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
    expect(visivel).not.toContain("÷");
  });

  it("mostra o CAPEX como soma de geração e armazenamento", () => {
    expect(html).toContain("R$ 1.505.000,00");
    expect(html).toContain("R$ 1.650.000,00");
    expect(html).toContain("R$ 3.155.000,00");
  });

  it("declara a análise de demanda como preliminar com seis faturas", () => {
    expect(html).toContain("Análise preliminar");
    expect(html).toContain("12 meses de histórico ou memória de massa");
  });

  it("diz que o investimento é estimativa, não orçamento fechado", () => {
    expect(html).toContain("não constituem orçamento fechado");
  });
});

describe("validação bloqueante", () => {
  const base = {
    html: gerarRelatorio(montarEntrada()).html,
    capexFv: 1_505_000,
    capexBess: 1_650_000,
    capexTotal: 3_155_000,
  };

  it("bloqueia CAPEX que não soma", () => {
    const problemas = validarDocumento({ ...base, capexTotal: 1_505_000 });
    expect(problemas.some((p) => p.regra === "capex_inconsistente")).toBe(true);
  });

  it("bloqueia seção removida", () => {
    const semOportunidades = base.html.replace("<h2>7. Oportunidades</h2>", "<h2>Sete</h2>");
    const problemas = validarDocumento({ ...base, html: semOportunidades });
    expect(problemas.some((p) => p.regra === "secao_obrigatoria")).toBe(true);
  });

  it("bloqueia gráfico obrigatório ausente", () => {
    const semAcumulada = base.html.replace("Economia acumulada projetada", "Outro gráfico");
    const problemas = validarDocumento({ ...base, html: semAcumulada });
    expect(problemas.some((p) => p.regra === "grafico_obrigatorio")).toBe(true);
  });

  it("bloqueia termo interno que escapou para o texto", () => {
    const comTermo = base.html.replace("</h2>", "</h2><p>CAPEX all-in estimado</p>");
    const problemas = validarDocumento({ ...base, html: comTermo });
    expect(problemas.some((p) => p.regra === "termo_interno")).toBe(true);
  });

  it("bloqueia resíduo do caso-fonte no cabeçalho", () => {
    const comResiduo = base.html.replace("Amazonas Energia", "Roraima Energia");
    const problemas = validarDocumento({ ...base, html: comResiduo });
    expect(problemas.some((p) => p.regra === "residuo_do_caso_fonte")).toBe(true);
  });

  it("bloqueia dinheiro abreviado", () => {
    const abreviado = base.html.replace("<h2>7.", "<p>Economia de R$ 8,3 mi</p><h2>7.");
    const problemas = validarDocumento({ ...base, html: abreviado });
    expect(problemas.some((p) => p.regra === "dinheiro_abreviado")).toBe(true);
  });
});

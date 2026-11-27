import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTRAPARTES_DE_EXEMPLO, lancamentosDeExemplo, notasDeExemplo } from "../app/lib/notas-fiscais-exemplo.ts";
import {
  avisoDoValor,
  casaComABusca,
  filtrarNotas,
  formatoPeloConteudo,
  intervaloDasNotas,
  lancamentosParaVincular,
  notasDoLado,
  numeroNormalizado,
  temFiltroNasNotas,
  estadoDoEnderecoDasNotas,
  visaoDasNotas,
  visoesDasNotas,
  ORDEM_DOS_CAMPOS,
  problemaDoArquivo,
  resumoDoLado,
  saldoDasNotas,
  validarNota,
  type CamposDaNota,
} from "../app/lib/notas-fiscais.ts";

const HOJE = "2026-11-27";
const notas = notasDeExemplo(HOJE);
const lancamentos = lancamentosDeExemplo(HOJE);
const contexto = { hoje: HOJE, notas, contrapartes: CONTRAPARTES_DE_EXEMPLO, lancamentos, registradaPor: "Teste", novoId: "nova" };
const bytes = (texto: string) => new TextEncoder().encode(texto);
const campos = (parcial: Partial<CamposDaNota> = {}): CamposDaNota => ({
  tipo: "entrada", empresa: "plugga", numero: "1290", emitidaEm: HOJE, valor: "2640.00", contraparteId: "c-ponte", lancamento: "", arquivo: null, ...parcial,
});

describe("dados de exemplo das Notas fiscais (PLU-361)", () => {
  it("cobrem os dois lados, as duas empresas, com e sem lançamento e com e sem arquivo", () => {
    for (const tipo of ["entrada", "saida"] as const) {
      const lado = notasDoLado(notas, tipo);
      assert.ok(lado.some((n) => n.empresa === "plugga") && lado.some((n) => n.empresa === "waze"), tipo);
      assert.ok(lado.some((n) => n.lancamento) && lado.some((n) => !n.lancamento), tipo);
      assert.ok(lado.some((n) => n.arquivo) && lado.some((n) => !n.arquivo), tipo);
    }
  });

  it("todo vínculo é da mesma empresa, do mesmo sentido e do mesmo cliente ou fornecedor", () => {
    for (const nota of notas.filter((n) => n.lancamento)) {
      const l = lancamentos.find((x) => x.codigo === nota.lancamento!.codigo)!;
      assert.equal(l.tipo, nota.tipo, nota.id);
      assert.equal(l.empresa, nota.empresa, nota.id);
      assert.equal(l.contraparteId, nota.contraparte.id, nota.id);
      assert.equal(nota.contraparte.papel, nota.tipo === "entrada" ? "cliente" : "fornecedor", nota.id);
    }
  });
});

describe("filtros das Notas fiscais", () => {
  it("período personalizado: do dia De ao dia Até, com os dois extremos, e vale mais que o atalho", () => {
    const todas = notasDoLado(filtrarNotas(notas, {}, HOJE), "entrada").length;
    const recorte = { de: "2026-11-10", ate: "2026-11-20" };
    const dentro = filtrarNotas(notas, { intervalo: recorte }, HOJE);
    assert.ok(dentro.length > 0 && dentro.length < notas.length);
    assert.ok(dentro.every((n) => n.emitidaEm >= recorte.de && n.emitidaEm <= recorte.ate));
    assert.equal(notas.filter((n) => n.emitidaEm >= recorte.de && n.emitidaEm <= recorte.ate).length, dentro.length);
    // o último dia entra inteiro e o dia seguinte não
    const noUltimo = notas.find((n) => n.emitidaEm === dentro[0]!.emitidaEm)!;
    assert.equal(filtrarNotas(notas, { intervalo: { de: noUltimo.emitidaEm, ate: noUltimo.emitidaEm } }, HOJE).every((n) => n.emitidaEm === noUltimo.emitidaEm), true);
    assert.equal(filtrarNotas(notas, { intervalo: recorte, periodo: "mes-anterior" }, HOJE).length, dentro.length);
    assert.ok(todas >= notasDoLado(dentro, "entrada").length);
  });

  it("os totais de cada lado e o saldo acompanham o intervalo, e ele conta como filtro ativo (o Limpar aparece)", () => {
    const recorte = { de: "2026-11-10", ate: "2026-11-20" };
    const filtradas = filtrarNotas(notas, { intervalo: recorte }, HOJE);
    const esperadoEntrada = resumoDoLado(notasDoLado(notas.filter((n) => n.emitidaEm >= recorte.de && n.emitidaEm <= recorte.ate), "entrada"));
    assert.deepEqual(resumoDoLado(notasDoLado(filtradas, "entrada")), esperadoEntrada);
    const saldo = saldoDasNotas(notas, { intervalo: recorte }, HOJE);
    const dentro = notas.filter((n) => n.emitidaEm >= recorte.de && n.emitidaEm <= recorte.ate);
    const centavos = dentro.reduce((s, n) => s + (n.tipo === "entrada" ? 1n : -1n) * BigInt(Math.round(Number(n.valor) * 100)), 0n);
    assert.equal(Number(saldo), Number(centavos) / 100);
    assert.equal(temFiltroNasNotas({ intervalo: recorte }), true);
    assert.equal(temFiltroNasNotas({}), false);
  });

  it("período: este mês, mês passado, 90 dias e este ano, em dias de Manaus", () => {
    assert.deepEqual(intervaloDasNotas("mes", HOJE), { de: "2026-11-01", ate: HOJE });
    assert.deepEqual(intervaloDasNotas("mes-anterior", HOJE), { de: "2026-10-01", ate: "2026-10-31" });
    assert.deepEqual(intervaloDasNotas("90d", HOJE), { de: "2026-08-30", ate: HOJE });
    assert.deepEqual(intervaloDasNotas("ano", HOJE), { de: "2026-01-01", ate: HOJE });
    assert.deepEqual(intervaloDasNotas("mes-anterior", "2027-01-15"), { de: "2026-12-01", ate: "2026-12-31" });
  });

  it("busca pelo número (sem pontos nem zeros à esquerda) ou pelo nome, sem acento", () => {
    const nota = { numero: "45812", contraparte: { id: "x", nome: "Distribuidora Amazônia Cabos", papel: "fornecedor" as const } };
    assert.ok(casaComABusca(nota, "45.812"));
    assert.ok(casaComABusca(nota, "00045812"));
    assert.ok(casaComABusca(nota, "amazonia"));
    assert.ok(!casaComABusca(nota, "999"));
    assert.ok(!casaComABusca(nota, "000"));
    assert.equal(numeroNormalizado("000.001.287"), "1287");
  });

  it("empresa, período e busca juntos; a mais recente primeiro", () => {
    const daWazeNoMes = filtrarNotas(notas, { empresa: "waze", periodo: "mes" }, HOJE);
    assert.ok(daWazeNoMes.every((n) => n.empresa === "waze" && n.emitidaEm >= "2026-11-01"));
    const datas = daWazeNoMes.map((n) => n.emitidaEm);
    assert.deepEqual(datas, [...datas].sort().reverse());
    assert.deepEqual(filtrarNotas(notas, { busca: "alameda" }, HOJE).map((n) => n.numero), ["1287", "1284"]);
  });

  it("saldo das notas: entradas menos saídas com empresa e período; a busca não entra", () => {
    const nota = (id: string, tipo: "entrada" | "saida", empresa: "plugga" | "waze", valor: string, emitidaEm: string, nome = "Alguém") =>
      ({ ...notas[0]!, id, tipo, empresa, valor, emitidaEm, contraparte: { id, nome, papel: tipo === "entrada" ? "cliente" as const : "fornecedor" as const } });
    const conjunto = [
      nota("a", "entrada", "plugga", "1000.10", "2026-11-20", "Mercado"),
      nota("b", "saida", "plugga", "250.05", "2026-11-21"),
      nota("c", "saida", "waze", "2000.00", "2026-11-22"),
      nota("d", "entrada", "waze", "0.10", "2026-10-15"),
      nota("e", "saida", "plugga", "0.20", "2026-10-02"),
    ];
    assert.equal(saldoDasNotas(conjunto, {}, HOJE), "-1250.05");
    assert.equal(saldoDasNotas(conjunto, { empresa: "plugga" }, HOJE), "749.85");
    assert.equal(saldoDasNotas(conjunto, { periodo: "mes" }, HOJE), "-1249.95");
    assert.equal(saldoDasNotas(conjunto, { empresa: "waze", periodo: "mes-anterior" }, HOJE), "0.10");
    // A busca acha a nota, mas não muda o saldo.
    assert.equal(saldoDasNotas(conjunto, { busca: "mercado" }, HOJE), saldoDasNotas(conjunto, {}, HOJE));
    assert.equal(saldoDasNotas([], {}, HOJE), "0.00");
    assert.equal(saldoDasNotas([conjunto[4]!], {}, HOJE), "-0.20");
  });

  it("o resumo soma em centavos e conta o que falta (lançamento e arquivo)", () => {
    const resumo = resumoDoLado([notas.find((n) => n.id === "nf-s1")!, notas.find((n) => n.id === "nf-s4")!, notas.find((n) => n.id === "nf-s7")!]);
    assert.deepEqual(resumo, { quantidade: 3, total: "9762.07", semLancamento: 1, semArquivo: 1 });
    assert.deepEqual(resumoDoLado([]), { quantidade: 0, total: "0.00", semLancamento: 0, semArquivo: 0 });
  });
});

describe("lançamento vinculado", () => {
  it("só da mesma empresa e do mesmo sentido; com o cliente escolhido, só dele; o que já tem nota vem desligado", () => {
    const daPlugga = lancamentosParaVincular(lancamentos, notas, { tipo: "entrada", empresa: "plugga", contraparteId: "" });
    assert.ok(daPlugga.length > 0 && daPlugga.every(({ lancamento }) => lancamento.tipo === "entrada" && lancamento.empresa === "plugga"));
    assert.equal(daPlugga.find(({ lancamento }) => lancamento.codigo === "CR-0912")?.jaTemNota, "1287");
    assert.equal(daPlugga.find(({ lancamento }) => lancamento.codigo === "CR-0916")?.jaTemNota, null);
    const doPonte = lancamentosParaVincular(lancamentos, notas, { tipo: "entrada", empresa: "plugga", contraparteId: "c-ponte" });
    assert.deepEqual(doPonte.map(({ lancamento }) => lancamento.codigo), ["CR-0916"]);
    assert.deepEqual(lancamentosParaVincular(lancamentos, notas, { tipo: "saida", empresa: "", contraparteId: "" }), []);
  });

  it("valor diferente do lançamento é aviso, não erro", () => {
    assert.equal(avisoDoValor("2600.00", { valor: "2640.00" }), true);
    assert.equal(avisoDoValor("2640.00", { valor: "2640.00" }), false);
    assert.equal(avisoDoValor("2640.00", null), false);
  });
});

describe("arquivo conferido pelo conteúdo", () => {
  it("PDF pelo %PDF-, XML pelo <?xml ou por uma tag (com BOM e espaços); o resto não", () => {
    assert.equal(formatoPeloConteudo(bytes("%PDF-1.7\n")), "pdf");
    assert.equal(formatoPeloConteudo(bytes("<?xml version=\"1.0\"?>")), "xml");
    assert.equal(formatoPeloConteudo(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("\n  <nfeProc>")])), "xml");
    assert.equal(formatoPeloConteudo(bytes("PK\u0003\u0004")), null);
    assert.equal(formatoPeloConteudo(bytes("< não é tag")), null);
    assert.equal(formatoPeloConteudo(new Uint8Array()), null);
  });

  it("vazio, grande demais ou de outro formato é recusado; sem arquivo, tudo bem", () => {
    assert.equal(problemaDoArquivo(null), null);
    assert.equal(problemaDoArquivo({ tamanho: 0, formato: "pdf" }), "O arquivo está vazio.");
    assert.equal(problemaDoArquivo({ tamanho: 26 * 1024 * 1024, formato: "pdf" }), "O arquivo passa de 25 MB.");
    assert.match(problemaDoArquivo({ tamanho: 10, formato: null })!, /PDF \(DANFE\) ou o XML/);
    assert.equal(problemaDoArquivo({ tamanho: 10, formato: "xml" }), null);
  });
});

describe("adicionar nota fiscal", () => {
  it("o foco do primeiro erro segue a ordem visual do modal: arquivo, empresa, lançamento, cliente ou fornecedor, número, emissão, valor", () => {
    assert.deepEqual([...ORDEM_DOS_CAMPOS], ["arquivo", "empresa", "lancamento", "contraparteId", "numero", "emitidaEm", "valor"]);
    const { erros } = validarNota(campos({ empresa: "", numero: "", emitidaEm: "", valor: "", contraparteId: "" }), contexto);
    assert.equal(ORDEM_DOS_CAMPOS.find((c) => erros[c]), "empresa");
    const semCliente = validarNota(campos({ contraparteId: "", numero: "" }), contexto).erros;
    assert.equal(ORDEM_DOS_CAMPOS.find((c) => semCliente[c]), "contraparteId", "o cliente vem antes do número");
  });
  it("campos obrigatórios com mensagem em português", () => {
    const { erros, nota } = validarNota(campos({ empresa: "", numero: "", emitidaEm: "", valor: "", contraparteId: "" }), contexto);
    assert.equal(nota, null);
    assert.deepEqual(erros, {
      empresa: "Escolha a empresa da nota.",
      numero: "Informe o número da nota.",
      emitidaEm: "Informe a data de emissão.",
      valor: "Informe o valor da nota.",
      contraparteId: "Escolha o cliente da nota.",
    });
    assert.equal(validarNota(campos({ tipo: "saida", contraparteId: "" }), contexto).erros.contraparteId, "Escolha o fornecedor que emitiu a nota.");
  });

  it("número só com algarismos, a partir de 1 e com até 9; emissão até hoje; valor positivo", () => {
    assert.equal(validarNota(campos({ numero: "12A" }), contexto).erros.numero, "Use só algarismos no número, como 1287.");
    assert.equal(validarNota(campos({ numero: "000" }), contexto).erros.numero, "O número da nota começa em 1.");
    assert.equal(validarNota(campos({ numero: "1234567890" }), contexto).erros.numero, "O número da nota tem até 9 algarismos.");
    assert.equal(validarNota(campos({ emitidaEm: "2026-11-28" }), contexto).erros.emitidaEm, "A data de emissão não pode ser depois de hoje.");
    assert.equal(validarNota(campos({ valor: "0.00" }), contexto).erros.valor, "O valor da nota precisa ser maior que zero.");
  });

  it("cliente de um lado não serve no outro", () => {
    assert.ok(validarNota(campos({ tipo: "saida", contraparteId: "c-ponte" }), contexto).erros.contraparteId);
  });

  it("número repetido: na entrada, mesma empresa e tipo; na saída, também o mesmo fornecedor", () => {
    assert.equal(validarNota(campos({ numero: "001.287" }), contexto).erros.numero,
      "A Plugga já tem a nota de entrada nº 1287, emitida em 25/11/2026 para Condomínio Residencial Alameda.");
    // O mesmo número na outra empresa ou do outro lado vale.
    assert.equal(validarNota(campos({ numero: "1287", empresa: "waze", contraparteId: "c-ponte" }), contexto).erros.numero, undefined);
    const saida = campos({ tipo: "saida", empresa: "waze", numero: "45812", contraparteId: "f-cabos", valor: "100.00" });
    assert.equal(validarNota(saida, contexto).erros.numero, "A nota nº 45812 de Distribuidora Amazônia Cabos já está registrada na Waze Energia, emitida em 26/11/2026.");
    // Outro fornecedor pode ter uma nota com o mesmo número.
    assert.equal(validarNota({ ...saida, contraparteId: "f-solar" }, contexto).erros.numero, undefined);
  });

  it("o lançamento tem de ser da mesma empresa, do mesmo sentido, do mesmo cliente e sem outra nota", () => {
    assert.equal(validarNota(campos({ lancamento: "CP-0933" }), contexto).erros.lancamento, "O lançamento precisa ser da mesma empresa e do mesmo sentido da nota.");
    assert.equal(validarNota(campos({ lancamento: "CR-0917" }), contexto).erros.lancamento, "O lançamento precisa ser da mesma empresa e do mesmo sentido da nota.");
    assert.equal(validarNota(campos({ lancamento: "CR-0918" }), contexto).erros.lancamento, "O lançamento é de outro cliente.");
    assert.equal(validarNota(campos({ contraparteId: "c-alameda", lancamento: "CR-0912" }), contexto).erros.lancamento, "CR-0912 já tem a nota nº 1287.");
  });

  it("válida, vira a nota da lista com o vínculo e o arquivo", () => {
    const { erros, nota } = validarNota(campos({ numero: "0001.290", lancamento: "CR-0916", arquivo: { nome: "NF-1290.pdf", formato: "pdf", tamanho: 2048 } }), contexto);
    assert.deepEqual(erros, {});
    assert.equal(nota?.numero, "1290");
    assert.equal(nota?.contraparte.nome, "Mercado Ponte Nova");
    assert.equal(nota?.lancamento?.codigo, "CR-0916");
    assert.deepEqual(nota?.arquivo, { nome: "NF-1290.pdf", formato: "pdf", tamanho: 2048 });
    assert.equal(nota?.registradaEm, HOJE);
  });
});

describe("visão das Notas fiscais (Cards ou Lista)", () => {
  it("as visões são Cards e Lista, nessa ordem, como em Lançamentos", () => {
    assert.deepEqual([...visoesDasNotas], ["cards", "lista"]);
  });
  it("a Lista é a padrão; Cards só quando escolhida no endereço", () => {
    assert.equal(visaoDasNotas(undefined), "lista");
    assert.equal(visaoDasNotas(null), "lista");
    assert.equal(visaoDasNotas(""), "lista");
    assert.equal(visaoDasNotas("lista"), "lista");
    assert.equal(visaoDasNotas("cards"), "cards");
  });
  it("valor desconhecido, com outra caixa ou com espaço volta à Lista", () => {
    assert.equal(visaoDasNotas("quadro"), "lista");
    assert.equal(visaoDasNotas("Cards"), "lista");
    assert.equal(visaoDasNotas(" cards"), "lista");
    assert.equal(visaoDasNotas("cards,lista"), "lista");
  });
});

describe("estado das Notas fiscais no endereço (?lado, ?visao, ?de e ?ate)", () => {
  it("lê o lado, a visão e o intervalo de uma vez", () => {
    const estado = estadoDoEnderecoDasNotas(new URLSearchParams("lado=saidas&visao=cards&de=2026-11-01&ate=2026-11-15"));
    assert.deepEqual(estado, { lado: "saida", visao: "cards", intervalo: { de: "2026-11-01", ate: "2026-11-15" } });
  });
  it("sem parâmetros: Entradas, Lista e sem intervalo", () => {
    assert.deepEqual(estadoDoEnderecoDasNotas(new URLSearchParams("")), { lado: "entrada", visao: "lista", intervalo: null });
  });
  it("valores inválidos voltam ao padrão, sem derrubar o resto", () => {
    const estado = estadoDoEnderecoDasNotas(new URLSearchParams("lado=x&visao=quadro&de=2026-11-20&ate=2026-11-10"));
    assert.deepEqual(estado, { lado: "entrada", visao: "lista", intervalo: null });
    assert.deepEqual(estadoDoEnderecoDasNotas(new URLSearchParams("de=2026-11-01")).intervalo, null);
  });
});

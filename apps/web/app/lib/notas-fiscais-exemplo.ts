import { somarDias, type ContraparteDaNota, type LancamentoParaNota, type NotaFiscal } from "./notas-fiscais.ts";

/**
 * DADOS DE EXEMPLO do protótipo das Notas fiscais (PLU-361), todos inventados:
 * nomes, números, valores e códigos de lançamento não existem em lugar nenhum e
 * não vêm da API. As datas contam a partir de hoje, para o protótipo não envelhecer.
 * Quando o desenho for aprovado, este módulo sai e a tela passa a ler a API.
 */

export const CONTRAPARTES_DE_EXEMPLO: readonly ContraparteDaNota[] = [
  { id: "c-alameda", nome: "Condomínio Residencial Alameda", papel: "cliente" },
  { id: "c-ponte", nome: "Mercado Ponte Nova", papel: "cliente" },
  { id: "c-vida", nome: "Clínica Vida Plena", papel: "cliente" },
  { id: "c-horizonte", nome: "Colégio Novo Horizonte", papel: "cliente" },
  { id: "c-igarape", nome: "Pousada Igarapé Azul", papel: "cliente" },
  { id: "f-cabos", nome: "Distribuidora Amazônia Cabos", papel: "fornecedor" },
  { id: "f-solar", nome: "Solar Peças Distribuidora", papel: "fornecedor" },
  { id: "f-rioverde", nome: "Transportes Rio Verde", papel: "fornecedor" },
  { id: "f-andaimes", nome: "Locadora Andaimes Forte", papel: "fornecedor" },
  { id: "f-conecta", nome: "Provedor Conecta Net", papel: "fornecedor" },
  { id: "f-ribeiro", nome: "Escritório Contábil Ribeiro", papel: "fornecedor" },
];

const quem = (id: string): ContraparteDaNota => CONTRAPARTES_DE_EXEMPLO.find((c) => c.id === id)!;

/** Os lançamentos de exemplo: os já vinculados às notas e alguns ainda sem nota, para o formulário. */
export function lancamentosDeExemplo(hoje: string): LancamentoParaNota[] {
  const d = (dias: number) => somarDias(hoje, dias);
  const l = (codigo: string, tipo: LancamentoParaNota["tipo"], empresa: LancamentoParaNota["empresa"], contraparteId: string, descricao: string, valor: string, vencimento: string, situacao: string): LancamentoParaNota =>
    ({ codigo, tipo, empresa, contraparteId, descricao, valor, vencimento, situacao });
  return [
    l("CR-0912", "entrada", "plugga", "c-alameda", "Gestão de energia · novembro", "12500.00", d(8), "Enviada"),
    l("CR-0915", "entrada", "waze", "c-vida", "Usina solar 75 kWp · 2ª parcela", "38940.00", d(12), "Boleto gerado"),
    l("CR-0914", "entrada", "waze", "c-horizonte", "Instalação de carregador veicular", "7215.50", d(4), "NF emitida"),
    l("CR-0911", "entrada", "plugga", "c-igarape", "Consultoria Mercado Livre · outubro", "4380.00", d(-6), "Recebida"),
    l("CR-0905", "entrada", "plugga", "c-alameda", "Gestão de energia · outubro", "12500.00", d(-25), "Recebida"),
    l("CR-0890", "entrada", "plugga", "c-vida", "Auditoria de faturas · agosto", "3150.00", d(-80), "Recebida"),
    l("CR-0916", "entrada", "plugga", "c-ponte", "Auditoria de faturas · novembro", "2640.00", d(10), "Gerada"),
    l("CR-0917", "entrada", "waze", "c-ponte", "Manutenção da usina · novembro", "1980.00", d(15), "Gerada"),
    l("CR-0918", "entrada", "plugga", "c-horizonte", "Gestão de energia · novembro", "5600.00", d(9), "Gerada"),
    l("CP-0931", "saida", "waze", "f-cabos", "Cabos solares 6 mm² · PC-0142", "8432.17", d(20), "Aprovada"),
    l("CP-0928", "saida", "plugga", "f-ribeiro", "Honorários contábeis · novembro", "1850.00", d(3), "Aprovada"),
    l("CP-0925", "saida", "plugga", "f-conecta", "Internet do escritório · novembro", "349.90", d(-2), "Paga"),
    l("CP-0921", "saida", "waze", "f-andaimes", "Locação de andaimes · obra Vida Plena", "4200.00", d(-9), "Paga"),
    l("CP-0910", "saida", "waze", "f-cabos", "Cabos e conectores · PC-0131", "12019.44", d(-30), "Paga"),
    l("CP-0932", "saida", "waze", "f-solar", "Inversores 50 kW · PC-0145", "26700.00", d(25), "Aberta"),
    l("CP-0933", "saida", "plugga", "f-rioverde", "Frete de equipamentos · outubro", "980.00", d(-40), "Paga"),
    l("CP-0934", "saida", "waze", "f-rioverde", "Frete dos módulos · PC-0145", "1640.00", d(18), "Aprovada"),
  ];
}

/** As notas de exemplo: dos dois lados, das duas empresas, com e sem lançamento, com e sem arquivo. */
export function notasDeExemplo(hoje: string): NotaFiscal[] {
  const d = (dias: number) => somarDias(hoje, -dias);
  const lancamentos = lancamentosDeExemplo(hoje);
  const vinculo = (codigo: string | null) => {
    const l = codigo ? lancamentos.find((x) => x.codigo === codigo)! : null;
    return l ? { codigo: l.codigo, descricao: l.descricao, valor: l.valor, vencimento: l.vencimento, situacao: l.situacao } : null;
  };
  const pdf = (nome: string, kb: number) => ({ nome, formato: "pdf" as const, tamanho: kb * 1024 });
  const xml = (nome: string, kb: number) => ({ nome, formato: "xml" as const, tamanho: kb * 1024 });
  const n = (id: string, tipo: NotaFiscal["tipo"], empresa: NotaFiscal["empresa"], numero: string, diasAtras: number, valor: string, contraparteId: string,
    lancamento: string | null, arquivo: NotaFiscal["arquivo"], registradaPor: string): NotaFiscal =>
    ({ id, tipo, empresa, numero, emitidaEm: d(diasAtras), valor, contraparte: quem(contraparteId), lancamento: vinculo(lancamento), arquivo, registradaEm: d(Math.max(0, diasAtras - 1)), registradaPor });
  return [
    n("nf-e1", "entrada", "plugga", "1287", 2, "12500.00", "c-alameda", "CR-0912", pdf("NF-1287-alameda.pdf", 182), "Marina Costa"),
    n("nf-e2", "entrada", "waze", "845", 5, "38940.00", "c-vida", "CR-0915", xml("NFe-845.xml", 14), "Rafael Lima"),
    n("nf-e3", "entrada", "plugga", "1286", 9, "2640.00", "c-ponte", null, pdf("NF-1286.pdf", 176), "Marina Costa"),
    n("nf-e4", "entrada", "waze", "844", 14, "7215.50", "c-horizonte", "CR-0914", null, "Rafael Lima"),
    n("nf-e5", "entrada", "plugga", "1285", 21, "4380.00", "c-igarape", "CR-0911", pdf("NF-1285-igarape.pdf", 190), "Marina Costa"),
    n("nf-e6", "entrada", "plugga", "1284", 33, "12500.00", "c-alameda", "CR-0905", pdf("NF-1284-alameda.pdf", 181), "Marina Costa"),
    n("nf-e7", "entrada", "waze", "843", 41, "19870.00", "c-ponte", null, null, "Rafael Lima"),
    n("nf-e8", "entrada", "plugga", "1279", 95, "3150.00", "c-vida", "CR-0890", xml("NFe-1279.xml", 13), "Marina Costa"),
    n("nf-s1", "saida", "waze", "45812", 1, "8432.17", "f-cabos", "CP-0931", xml("NFe-45812-amazonia-cabos.xml", 16), "Rafael Lima"),
    n("nf-s2", "saida", "plugga", "2207", 4, "1850.00", "f-ribeiro", "CP-0928", pdf("NFS-2207-ribeiro.pdf", 96), "Marina Costa"),
    n("nf-s3", "saida", "waze", "9310", 8, "26700.00", "f-solar", null, pdf("DANFE-9310.pdf", 240), "Rafael Lima"),
    n("nf-s4", "saida", "plugga", "118", 12, "349.90", "f-conecta", "CP-0925", pdf("fatura-118-conecta.pdf", 88), "Marina Costa"),
    n("nf-s5", "saida", "waze", "3377", 19, "4200.00", "f-andaimes", "CP-0921", null, "Rafael Lima"),
    n("nf-s6", "saida", "waze", "45640", 36, "12019.44", "f-cabos", "CP-0910", xml("NFe-45640.xml", 15), "Rafael Lima"),
    n("nf-s7", "saida", "plugga", "2188", 63, "980.00", "f-rioverde", null, null, "Marina Costa"),
  ];
}

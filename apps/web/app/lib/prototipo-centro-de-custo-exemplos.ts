import type { Projeto } from "./prototipo-centro-de-custo.ts";

/**
 * Dados de EXEMPLO do protótipo do Centro de custo (PLU-362): inventados, nenhum
 * nome, valor ou código corresponde a um registro real. SÓ O SERVIDOR importa
 * este módulo (as páginas, depois da trava de desenvolvimento); nenhum
 * componente `"use client"` pode importá-lo, direta ou indiretamente (teste em
 * prototipo-centro-de-custo.test.ts), para os exemplos não irem a um chunk do
 * navegador.
 */
const JOAO = { id: "cli-joao", nome: "João Ferreira" };
const CONDOMINIO = { id: "cli-jardim-das-aguas", nome: "Condomínio Jardim das Águas" };
const MERCADO = { id: "cli-ponto-certo", nome: "Mercado Ponto Certo" };
const CLINICA = { id: "cli-vida-plena", nome: "Clínica Vida Plena" };

/** Exemplos inventados. Nenhum nome, valor ou código corresponde a um registro real. */
export const PROJETOS_DE_EXEMPLO: readonly Projeto[] = [
  {
    id: "usina-solar-residencial-joao",
    nome: "Usina solar residencial 12 kWp",
    cliente: JOAO,
    empresa: "plugga",
    classe: "fisico",
    tipo: "Energia solar",
    situacao: "em_andamento",
    responsavel: "Rafael Monteiro",
    inicio: "2026-10-06",
    orcamento: 6_800_000,
    entradas: [
      { id: "e1", codigo: "CR-0141", descricao: "Sinal de 30% do contrato", vencimento: "2026-10-05", recebidaEm: "2026-10-03", situacao: "recebida", valor: 2_550_000 },
      { id: "e2", codigo: "CR-0158", descricao: "2ª parcela · entrega do material", vencimento: "2026-11-20", recebidaEm: "2026-11-21", situacao: "recebida", valor: 3_400_000 },
      { id: "e3", codigo: "CR-0172", descricao: "3ª parcela · usina ligada", vencimento: "2026-12-18", recebidaEm: null, situacao: "a_receber", valor: 2_550_000 },
    ],
    saidas: [
      { id: "s1", codigo: "CP-0233", descricao: "24 módulos fotovoltaicos 550 W", favorecido: "Solar Distribuidora Norte", categoria: "material", vencimento: "2026-10-20", pagaEm: "2026-10-20", situacao: "paga", valor: 2_840_000, origem: { tipo: "pedido_de_compra", codigo: "PC-0101" } },
      { id: "s2", codigo: "CP-0247", descricao: "Inversor 12 kW trifásico", favorecido: "Energtech Equipamentos", categoria: "material", vencimento: "2026-12-04", pagaEm: null, situacao: "a_pagar", valor: 980_000, origem: { tipo: "pedido_de_compra", codigo: "PC-0104" } },
      { id: "s3", codigo: "CP-0251", descricao: "Instalação · semana 1", favorecido: "Carlos Souza (eletricista)", categoria: "mao_de_obra", vencimento: "2026-11-14", pagaEm: "2026-11-14", situacao: "paga", valor: 180_000, origem: { tipo: "avulsa" } },
      { id: "s4", codigo: "CP-0252", descricao: "Ajudante · semana 1", favorecido: "Diego Lima (ajudante)", categoria: "mao_de_obra", vencimento: "2026-11-14", pagaEm: "2026-11-14", situacao: "paga", valor: 60_000, origem: { tipo: "avulsa" } },
      { id: "s5", codigo: "CP-0263", descricao: "Instalação · semana 2", favorecido: "Carlos Souza (eletricista)", categoria: "mao_de_obra", vencimento: "2026-11-28", pagaEm: null, situacao: "a_pagar", valor: 180_000, origem: { tipo: "avulsa" } },
      { id: "s6", codigo: "CP-0240", descricao: "Andaime · 15 dias", favorecido: "Loca Fácil Equipamentos", categoria: "locacao", vencimento: "2026-11-10", pagaEm: "2026-11-10", situacao: "paga", valor: 85_000, origem: { tipo: "avulsa" } },
      { id: "s7", codigo: "CP-0236", descricao: "Frete dos módulos", favorecido: "Rápido Amazonas Transportes", categoria: "frete", vencimento: "2026-10-22", pagaEm: "2026-10-22", situacao: "paga", valor: 62_000, origem: { tipo: "avulsa" } },
      { id: "s8", codigo: "CP-0238", descricao: "Frete dos módulos (lançado em dobro)", favorecido: "Rápido Amazonas Transportes", categoria: "frete", vencimento: "2026-10-22", pagaEm: null, situacao: "cancelada", valor: 62_000, origem: { tipo: "avulsa" } },
      { id: "s9", codigo: "CP-0239", descricao: "ART de execução", favorecido: "CREA-AM", categoria: "impostos", vencimento: "2026-10-08", pagaEm: "2026-10-08", situacao: "paga", valor: 26_314, origem: { tipo: "avulsa" } },
    ],
    material: [
      { id: "m1", item: "EST-0012", nome: "Cabo solar 6 mm² preto", quantidade: 120, unidade: "m", custoUnitario: 890, data: "2026-11-11", registradaPor: "Bruna Alves" },
      { id: "m2", item: "EST-0013", nome: "Cabo solar 6 mm² vermelho", quantidade: 120, unidade: "m", custoUnitario: 890, data: "2026-11-11", registradaPor: "Bruna Alves" },
      { id: "m3", item: "EST-0021", nome: "Conector MC4 (par)", quantidade: 24, unidade: "par", custoUnitario: 1_450, data: "2026-11-11", registradaPor: "Bruna Alves" },
      { id: "m4", item: "EST-0034", nome: "Kit de fixação para telhado cerâmico", quantidade: 12, unidade: "kit", custoUnitario: 9_500, data: "2026-11-12", registradaPor: "Bruna Alves" },
    ],
    compras: [
      { id: "c1", codigo: "PC-0101", titulo: "Módulos fotovoltaicos", fornecedor: "Solar Distribuidora Norte", etapa: "Recebido", valor: 2_840_000, custo: { tipo: "conta", codigo: "CP-0233" } },
      { id: "c2", codigo: "PC-0104", titulo: "Inversor trifásico", fornecedor: "Energtech Equipamentos", etapa: "Aguardando entrega", valor: 980_000, custo: { tipo: "conta", codigo: "CP-0247" } },
      { id: "c3", codigo: "PC-0109", titulo: "String box e DPS", fornecedor: null, etapa: "Cotações", valor: null, custo: { tipo: "ainda_sem_conta" } },
    ],
  },
  {
    id: "carport-solar-joao",
    nome: "Carport solar da garagem",
    cliente: JOAO,
    empresa: "plugga",
    classe: "fisico",
    tipo: "Energia solar",
    situacao: "nao_iniciado",
    responsavel: null,
    inicio: null,
    orcamento: 4_200_000,
    entradas: [],
    saidas: [],
    material: [],
    compras: [],
  },
  {
    id: "operacao-manutencao-joao",
    nome: "Operação e manutenção mensal da usina",
    cliente: JOAO,
    empresa: "waze",
    classe: "servico",
    tipo: "Operação e manutenção",
    situacao: "em_andamento",
    responsavel: "Larissa Pinto",
    inicio: "2026-08-01",
    orcamento: null,
    entradas: [
      { id: "e1", codigo: "CR-0098", descricao: "Mensalidade de agosto", vencimento: "2026-08-10", recebidaEm: "2026-08-09", situacao: "recebida", valor: 89_000 },
      { id: "e2", codigo: "CR-0112", descricao: "Mensalidade de setembro", vencimento: "2026-09-10", recebidaEm: "2026-09-10", situacao: "recebida", valor: 89_000 },
      { id: "e3", codigo: "CR-0127", descricao: "Mensalidade de outubro", vencimento: "2026-10-10", recebidaEm: "2026-10-13", situacao: "recebida", valor: 89_000 },
      { id: "e4", codigo: "CR-0150", descricao: "Mensalidade de novembro", vencimento: "2026-11-10", recebidaEm: "2026-11-10", situacao: "recebida", valor: 89_000 },
      { id: "e5", codigo: "CR-0176", descricao: "Mensalidade de dezembro", vencimento: "2026-12-10", recebidaEm: null, situacao: "a_receber", valor: 89_000 },
    ],
    saidas: [
      { id: "s1", codigo: "CP-0190", descricao: "Visita técnica de agosto", favorecido: "Paulo Nascimento (técnico)", categoria: "mao_de_obra", vencimento: "2026-08-15", pagaEm: "2026-08-15", situacao: "paga", valor: 35_000, origem: { tipo: "avulsa" } },
      { id: "s2", codigo: "CP-0204", descricao: "Visita técnica de setembro", favorecido: "Paulo Nascimento (técnico)", categoria: "mao_de_obra", vencimento: "2026-09-15", pagaEm: "2026-09-15", situacao: "paga", valor: 35_000, origem: { tipo: "avulsa" } },
      { id: "s3", codigo: "CP-0221", descricao: "Visita técnica e limpeza dos módulos", favorecido: "Paulo Nascimento (técnico)", categoria: "mao_de_obra", vencimento: "2026-10-15", pagaEm: "2026-10-15", situacao: "paga", valor: 35_000, origem: { tipo: "avulsa" } },
      { id: "s4", codigo: "CP-0222", descricao: "Ajudante na limpeza dos módulos", favorecido: "Diego Lima (ajudante)", categoria: "mao_de_obra", vencimento: "2026-10-15", pagaEm: "2026-10-15", situacao: "paga", valor: 15_000, origem: { tipo: "avulsa" } },
      { id: "s5", codigo: "CP-0256", descricao: "Visita técnica de novembro", favorecido: "Paulo Nascimento (técnico)", categoria: "mao_de_obra", vencimento: "2026-11-30", pagaEm: null, situacao: "a_pagar", valor: 35_000, origem: { tipo: "avulsa" } },
    ],
    material: [],
    compras: [],
  },
  {
    id: "usina-solar-condominio",
    nome: "Usina solar do condomínio 75 kWp",
    cliente: CONDOMINIO,
    empresa: "waze",
    classe: "fisico",
    tipo: "Energia solar",
    situacao: "em_andamento",
    responsavel: "Rafael Monteiro",
    inicio: "2026-08-18",
    orcamento: 31_000_000,
    entradas: [
      { id: "e1", codigo: "CR-0101", descricao: "1ª parcela do contrato", vencimento: "2026-08-20", recebidaEm: "2026-08-20", situacao: "recebida", valor: 15_000_000 },
      { id: "e2", codigo: "CR-0133", descricao: "2ª parcela do contrato", vencimento: "2026-10-20", recebidaEm: "2026-10-24", situacao: "recebida", valor: 15_000_000 },
      { id: "e3", codigo: "CR-0170", descricao: "3ª parcela · homologação na distribuidora", vencimento: "2026-12-15", recebidaEm: null, situacao: "a_receber", valor: 8_000_000 },
    ],
    saidas: [
      { id: "s1", codigo: "CP-0201", descricao: "136 módulos fotovoltaicos 550 W", favorecido: "Solar Distribuidora Norte", categoria: "material", vencimento: "2026-09-05", pagaEm: "2026-09-05", situacao: "paga", valor: 15_640_000, origem: { tipo: "pedido_de_compra", codigo: "PC-0082" } },
      { id: "s2", codigo: "CP-0207", descricao: "2 inversores 37,5 kW", favorecido: "Energtech Equipamentos", categoria: "material", vencimento: "2026-09-18", pagaEm: "2026-09-18", situacao: "paga", valor: 6_820_000, origem: { tipo: "pedido_de_compra", codigo: "PC-0085" } },
      { id: "s3", codigo: "CP-0229", descricao: "Estrutura de solo reforçada (troca do projeto)", favorecido: "Metalúrgica Rio Negro", categoria: "material", vencimento: "2026-10-30", pagaEm: "2026-10-30", situacao: "paga", valor: 3_950_000, origem: { tipo: "pedido_de_compra", codigo: "PC-0097" } },
      { id: "s4", codigo: "CP-0214", descricao: "Equipe de montagem · etapa 1", favorecido: "Montagens Silva ME", categoria: "servicos", vencimento: "2026-09-30", pagaEm: "2026-09-30", situacao: "paga", valor: 2_200_000, origem: { tipo: "avulsa" } },
      { id: "s5", codigo: "CP-0244", descricao: "Equipe de montagem · etapa 2", favorecido: "Montagens Silva ME", categoria: "servicos", vencimento: "2026-12-05", pagaEm: null, situacao: "a_pagar", valor: 2_200_000, origem: { tipo: "avulsa" } },
      { id: "s6", codigo: "CP-0216", descricao: "Eletricistas da casa · setembro e outubro", favorecido: "Folha da equipe de campo", categoria: "mao_de_obra", vencimento: "2026-10-31", pagaEm: "2026-10-31", situacao: "paga", valor: 640_000, origem: { tipo: "avulsa" } },
      { id: "s7", codigo: "CP-0225", descricao: "Guindaste · 2 diárias", favorecido: "Içamentos Manaus", categoria: "locacao", vencimento: "2026-10-12", pagaEm: "2026-10-12", situacao: "paga", valor: 380_000, origem: { tipo: "avulsa" } },
      { id: "s8", codigo: "CP-0210", descricao: "Laudo de sondagem do terreno", favorecido: "GeoSolo Engenharia", categoria: "servicos", vencimento: "2026-09-02", pagaEm: "2026-09-02", situacao: "paga", valor: 290_000, origem: { tipo: "avulsa" } },
      { id: "s9", codigo: "CP-0211", descricao: "Taxa de análise do projeto na distribuidora", favorecido: "Distribuidora de energia", categoria: "impostos", vencimento: "2026-09-03", pagaEm: "2026-09-03", situacao: "paga", valor: 48_000, origem: { tipo: "avulsa" } },
    ],
    material: [
      { id: "m1", item: "EST-0012", nome: "Cabo solar 6 mm² preto", quantidade: 600, unidade: "m", custoUnitario: 870, data: "2026-09-22", registradaPor: "Bruna Alves" },
      { id: "m2", item: "EST-0013", nome: "Cabo solar 6 mm² vermelho", quantidade: 600, unidade: "m", custoUnitario: 870, data: "2026-09-22", registradaPor: "Bruna Alves" },
      { id: "m3", item: "EST-0040", nome: "Eletroduto PEAD 2\"", quantidade: 180, unidade: "m", custoUnitario: 1_240, data: "2026-09-24", registradaPor: "Bruna Alves" },
      { id: "m4", item: "EST-0021", nome: "Conector MC4 (par)", quantidade: 80, unidade: "par", custoUnitario: 1_420, data: "2026-09-24", registradaPor: "Bruna Alves" },
    ],
    compras: [
      { id: "c1", codigo: "PC-0082", titulo: "Módulos fotovoltaicos", fornecedor: "Solar Distribuidora Norte", etapa: "Recebido", valor: 15_640_000, custo: { tipo: "conta", codigo: "CP-0201" } },
      { id: "c2", codigo: "PC-0085", titulo: "Inversores", fornecedor: "Energtech Equipamentos", etapa: "Recebido", valor: 6_820_000, custo: { tipo: "conta", codigo: "CP-0207" } },
      { id: "c3", codigo: "PC-0097", titulo: "Estrutura de solo reforçada", fornecedor: "Metalúrgica Rio Negro", etapa: "Recebido", valor: 3_950_000, custo: { tipo: "conta", codigo: "CP-0229" } },
      { id: "c4", codigo: "PC-0090", titulo: "Cabos e eletrodutos para o estoque", fornecedor: "Elétrica Central", etapa: "Atendido pelo estoque", valor: null, custo: { tipo: "estoque" } },
    ],
  },
  {
    id: "eletroposto-ponto-certo",
    nome: "Eletroposto do estacionamento",
    cliente: MERCADO,
    empresa: "plugga",
    classe: "fisico",
    tipo: "Eletroposto",
    situacao: "concluido",
    responsavel: "Larissa Pinto",
    inicio: "2026-07-14",
    orcamento: 5_800_000,
    entradas: [
      { id: "e1", codigo: "CR-0071", descricao: "Contrato do eletroposto · parcela única", vencimento: "2026-07-20", recebidaEm: "2026-07-20", situacao: "recebida", valor: 7_400_000 },
    ],
    saidas: [
      { id: "s1", codigo: "CP-0160", descricao: "2 carregadores 22 kW", favorecido: "EV Power Brasil", categoria: "material", vencimento: "2026-07-28", pagaEm: "2026-07-28", situacao: "paga", valor: 3_600_000, origem: { tipo: "pedido_de_compra", codigo: "PC-0061" } },
      { id: "s2", codigo: "CP-0163", descricao: "Quadro de distribuição montado", favorecido: "Elétrica Central", categoria: "material", vencimento: "2026-08-02", pagaEm: "2026-08-02", situacao: "paga", valor: 740_000, origem: { tipo: "pedido_de_compra", codigo: "PC-0063" } },
      { id: "s3", codigo: "CP-0168", descricao: "Instalação e ligação", favorecido: "Carlos Souza (eletricista)", categoria: "mao_de_obra", vencimento: "2026-08-08", pagaEm: "2026-08-08", situacao: "paga", valor: 420_000, origem: { tipo: "avulsa" } },
      { id: "s4", codigo: "CP-0169", descricao: "Ajudantes · 4 diárias", favorecido: "Diego Lima (ajudante)", categoria: "mao_de_obra", vencimento: "2026-08-08", pagaEm: "2026-08-08", situacao: "paga", valor: 48_000, origem: { tipo: "avulsa" } },
      { id: "s5", codigo: "CP-0171", descricao: "Obra civil da base dos carregadores", favorecido: "Construtora Igarapé", categoria: "servicos", vencimento: "2026-08-05", pagaEm: "2026-08-05", situacao: "paga", valor: 310_000, origem: { tipo: "avulsa" } },
    ],
    material: [
      { id: "m1", item: "EST-0051", nome: "Cabo flexível 16 mm²", quantidade: 90, unidade: "m", custoUnitario: 2_150, data: "2026-08-04", registradaPor: "Bruna Alves" },
      { id: "m2", item: "EST-0058", nome: "Disjuntor DR 40 A", quantidade: 2, unidade: "un", custoUnitario: 18_900, data: "2026-08-04", registradaPor: "Bruna Alves" },
    ],
    compras: [
      { id: "c1", codigo: "PC-0061", titulo: "Carregadores veiculares", fornecedor: "EV Power Brasil", etapa: "Recebido", valor: 3_600_000, custo: { tipo: "conta", codigo: "CP-0160" } },
      { id: "c2", codigo: "PC-0063", titulo: "Quadro de distribuição", fornecedor: "Elétrica Central", etapa: "Recebido", valor: 740_000, custo: { tipo: "conta", codigo: "CP-0163" } },
    ],
  },
  {
    id: "gestao-de-energia-vida-plena",
    nome: "Gestão de energia por assinatura",
    cliente: CLINICA,
    empresa: "waze",
    classe: "servico",
    tipo: "Gestão de energia",
    situacao: "em_andamento",
    responsavel: "Larissa Pinto",
    inicio: "2026-09-01",
    orcamento: null,
    entradas: [
      { id: "e1", codigo: "CR-0115", descricao: "Assinatura de setembro", vencimento: "2026-09-15", recebidaEm: "2026-09-15", situacao: "recebida", valor: 210_000 },
      { id: "e2", codigo: "CR-0130", descricao: "Assinatura de outubro", vencimento: "2026-10-15", recebidaEm: "2026-10-15", situacao: "recebida", valor: 210_000 },
      { id: "e3", codigo: "CR-0152", descricao: "Assinatura de novembro", vencimento: "2026-11-15", recebidaEm: null, situacao: "a_receber", valor: 210_000 },
      { id: "e4", codigo: "CR-0153", descricao: "Assinatura de novembro (emitida em dobro)", vencimento: "2026-11-15", recebidaEm: null, situacao: "cancelada", valor: 210_000 },
    ],
    saidas: [
      { id: "s1", codigo: "CP-0219", descricao: "Análise mensal das faturas", favorecido: "Thiago Rocha (analista)", categoria: "mao_de_obra", vencimento: "2026-10-05", pagaEm: "2026-10-05", situacao: "paga", valor: 60_000, origem: { tipo: "avulsa" } },
      { id: "s2", codigo: "CP-0249", descricao: "Análise mensal das faturas", favorecido: "Thiago Rocha (analista)", categoria: "mao_de_obra", vencimento: "2026-11-05", pagaEm: "2026-11-05", situacao: "paga", valor: 60_000, origem: { tipo: "avulsa" } },
    ],
    material: [],
    compras: [],
  },
];

export const projetoDeExemplo = (id: string): Projeto | null => PROJETOS_DE_EXEMPLO.find((p) => p.id === id) ?? null;

export const clientesDeExemplo = (): Projeto["cliente"][] =>
  [...new Map(PROJETOS_DE_EXEMPLO.map((p) => [p.cliente.id, p.cliente])).values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

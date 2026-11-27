import type { CompanyKey } from "@plugga/shared";

/**
 * PROTÓTIPO do Centro de custo por projeto (PLU-362), só para o André avaliar o
 * desenho: todos os dados daqui são de EXEMPLO, inventados, e não vêm da API.
 * A tela só existe em desenvolvimento (`prototipoDoCentroDeCustoHabilitado`).
 * Quando o desenho for aprovado, este módulo sai e a tela passa a ler a API.
 *
 * Valores em centavos (inteiros), para as somas não acumularem erro.
 *
 * O centro de custo não recebe lançamentos: ele junta o que já está vinculado
 * ao projeto nas origens (o lançamento, o pedido de compra, a saída de estoque).
 */

export type SituacaoDoProjeto = "nao_iniciado" | "em_andamento" | "concluido";
export type ClasseDoProjeto = "fisico" | "servico";

export type Entrada = {
  id: string;
  /** O código do lançamento (CR-0001). */
  codigo: string;
  descricao: string;
  /** "aaaa-mm-dd". */
  vencimento: string;
  /** Dia do recebimento, quando recebida. */
  recebidaEm: string | null;
  situacao: "recebida" | "a_receber" | "cancelada";
  valor: number;
};

export type Saida = {
  id: string;
  /** O código do lançamento (CP-0001). */
  codigo: string;
  descricao: string;
  /** Fornecedor, funcionário ou ajudante. */
  favorecido: string;
  categoria: CategoriaDaSaida;
  vencimento: string;
  pagaEm: string | null;
  situacao: "paga" | "a_pagar" | "cancelada";
  valor: number;
  /** De onde a conta nasceu: o pedido de compra do projeto, ou lançada no Financeiro. */
  origem: { tipo: "pedido_de_compra"; codigo: string } | { tipo: "avulsa" };
};

export type CategoriaDaSaida = "material" | "mao_de_obra" | "servicos" | "locacao" | "frete" | "impostos";

export type SaidaDoEstoque = {
  id: string;
  /** O código do item do estoque (EST-0001). */
  item: string;
  nome: string;
  quantidade: number;
  unidade: string;
  /** Custo médio do item no dia da saída, em centavos por unidade. */
  custoUnitario: number;
  /** "aaaa-mm-dd". */
  data: string;
  /** Quem registrou a saída no Estoque. */
  registradaPor: string;
};

export type CompraDoProjeto = {
  id: string;
  /** O código do pedido (PC-0001). */
  codigo: string;
  titulo: string;
  fornecedor: string | null;
  etapa: string;
  valor: number | null;
  /** Onde o custo do pedido aparece neste centro de custo, para não contar duas vezes. */
  custo: { tipo: "conta"; codigo: string } | { tipo: "estoque" } | { tipo: "ainda_sem_conta" };
};

export type Projeto = {
  id: string;
  nome: string;
  cliente: { id: string; nome: string };
  empresa: CompanyKey;
  classe: ClasseDoProjeto;
  /** O que é o projeto: "Energia solar", "Operação e manutenção"… */
  tipo: string;
  situacao: SituacaoDoProjeto;
  responsavel: string | null;
  /** "aaaa-mm-dd". */
  inicio: string | null;
  orcamento: number | null;
  entradas: Entrada[];
  saidas: Saida[];
  material: SaidaDoEstoque[];
  compras: CompraDoProjeto[];
};

export const ROTULO_DA_SITUACAO: Record<SituacaoDoProjeto, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export const ROTULO_DA_CLASSE: Record<ClasseDoProjeto, string> = { fisico: "Projeto físico", servico: "Serviço" };

/** A ordem e o nome dos grupos das saídas. */
export const CATEGORIAS_DA_SAIDA: readonly { id: CategoriaDaSaida; rotulo: string; nota: string }[] = [
  { id: "material", rotulo: "Material e equipamentos", nota: "Comprado direto para o projeto" },
  { id: "mao_de_obra", rotulo: "Mão de obra", nota: "Funcionários e ajudantes" },
  { id: "servicos", rotulo: "Serviços de terceiros", nota: "Projetos, laudos e empreiteiros" },
  { id: "locacao", rotulo: "Locação de equipamentos", nota: "Andaimes, guindaste, ferramentas" },
  { id: "frete", rotulo: "Frete e deslocamento", nota: "Transporte de material e equipe" },
  { id: "impostos", rotulo: "Impostos e taxas", nota: "ART, taxas da distribuidora" },
];

// ---------------------------------------------------------------- cálculos

const SAIDA_CONTA = (s: Saida) => s.situacao !== "cancelada";

export const totalDaSaidaDoEstoque = (m: SaidaDoEstoque): number => Math.round(m.quantidade * m.custoUnitario);

const soma = (valores: number[]) => valores.reduce((total, v) => total + v, 0);

export type ResumoDoProjeto = {
  recebido: number;
  aReceber: number;
  pago: number;
  aPagar: number;
  material: number;
  /** O que já saiu: pago mais o material do estoque. */
  gasto: number;
  /** Recebido menos gasto: o que o projeto deu até hoje. */
  resultado: number;
  /** Contando o que falta receber e pagar. */
  resultadoPrevisto: number;
  /** Pago, a pagar e material: o que o projeto já comprometeu do orçamento. */
  comprometido: number;
  orcamento: { valor: number; percentual: number; estourou: boolean } | null;
};

/**
 * Os números do centro de custo, só da soma das linhas: cancelado não entra.
 * O material do estoque entra pelo custo da saída; o pedido de compra não soma
 * de novo (o custo dele já está na conta a pagar ou na saída do estoque).
 */
export function resumoDoProjeto(p: Projeto): ResumoDoProjeto {
  const recebido = soma(p.entradas.filter((e) => e.situacao === "recebida").map((e) => e.valor));
  const aReceber = soma(p.entradas.filter((e) => e.situacao === "a_receber").map((e) => e.valor));
  const pago = soma(p.saidas.filter((s) => s.situacao === "paga").map((s) => s.valor));
  const aPagar = soma(p.saidas.filter((s) => s.situacao === "a_pagar").map((s) => s.valor));
  const material = soma(p.material.map(totalDaSaidaDoEstoque));
  const gasto = pago + material;
  const comprometido = pago + aPagar + material;
  return {
    recebido,
    aReceber,
    pago,
    aPagar,
    material,
    gasto,
    resultado: recebido - gasto,
    resultadoPrevisto: recebido + aReceber - comprometido,
    comprometido,
    orcamento: p.orcamento
      ? { valor: p.orcamento, percentual: Math.round((comprometido / p.orcamento) * 100), estourou: comprometido > p.orcamento }
      : null,
  };
}

export type GrupoDeSaidas = { categoria: CategoriaDaSaida; rotulo: string; nota: string; total: number; percentual: number; saidas: Saida[] };

/** As saídas por categoria, na ordem de `CATEGORIAS_DA_SAIDA`; o total e o percentual não contam as canceladas. */
export function saidasPorCategoria(p: Projeto): GrupoDeSaidas[] {
  const totalGeral = soma(p.saidas.filter(SAIDA_CONTA).map((s) => s.valor));
  return CATEGORIAS_DA_SAIDA.flatMap(({ id, rotulo, nota }) => {
    const saidas = p.saidas.filter((s) => s.categoria === id);
    if (!saidas.length) return [];
    const total = soma(saidas.filter(SAIDA_CONTA).map((s) => s.valor));
    return [{ categoria: id, rotulo, nota, total, percentual: totalGeral ? Math.round((total / totalGeral) * 100) : 0, saidas }];
  });
}

export const projetoVazio = (p: Projeto): boolean => !p.entradas.length && !p.saidas.length && !p.material.length && !p.compras.length;

// ---------------------------------------------------------------- filtros e endereços

export type VisaoDosProjetos = "projetos" | "clientes";
export type FiltrosDosProjetos = { visao: VisaoDosProjetos; empresa?: CompanyKey; cliente?: string; situacao?: SituacaoDoProjeto; busca?: string };

export const ROTA_DO_CENTRO_DE_CUSTO = "/financeiro/centro-de-custo";

export function lerFiltrosDosProjetos(parametros: Record<string, string | undefined>): FiltrosDosProjetos {
  const empresa = parametros.empresa === "plugga" || parametros.empresa === "waze" ? parametros.empresa : undefined;
  const situacao = parametros.situacao && Object.hasOwn(ROTULO_DA_SITUACAO, parametros.situacao) ? (parametros.situacao as SituacaoDoProjeto) : undefined;
  const cliente = parametros.cliente && PROJETOS_DE_EXEMPLO.some((p) => p.cliente.id === parametros.cliente) ? parametros.cliente : undefined;
  const busca = parametros.busca?.trim().slice(0, 120) || undefined;
  return {
    visao: parametros.visao === "clientes" ? "clientes" : "projetos",
    ...(empresa ? { empresa } : {}),
    ...(cliente ? { cliente } : {}),
    ...(situacao ? { situacao } : {}),
    ...(busca ? { busca } : {}),
  };
}

export function hrefDosProjetos(filtros: FiltrosDosProjetos): string {
  const q = new URLSearchParams();
  if (filtros.visao !== "projetos") q.set("visao", filtros.visao);
  if (filtros.empresa) q.set("empresa", filtros.empresa);
  if (filtros.cliente) q.set("cliente", filtros.cliente);
  if (filtros.situacao) q.set("situacao", filtros.situacao);
  if (filtros.busca) q.set("busca", filtros.busca);
  const s = q.toString();
  return s ? `${ROTA_DO_CENTRO_DE_CUSTO}?${s}` : ROTA_DO_CENTRO_DE_CUSTO;
}

export const hrefDoProjeto = (id: string): string => `${ROTA_DO_CENTRO_DE_CUSTO}/${encodeURIComponent(id)}`;

export const temFiltroNosProjetos = (f: FiltrosDosProjetos): boolean => Boolean(f.empresa || f.cliente || f.situacao || f.busca);

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

/** Busca no nome do projeto, no cliente, no tipo e nos códigos das origens (CR-, CP-, PC-, EST-). */
export function filtrarProjetos(projetos: readonly Projeto[], f: FiltrosDosProjetos): Projeto[] {
  const termo = f.busca ? semAcento(f.busca) : null;
  return projetos.filter((p) => {
    if (f.empresa && p.empresa !== f.empresa) return false;
    if (f.cliente && p.cliente.id !== f.cliente) return false;
    if (f.situacao && p.situacao !== f.situacao) return false;
    if (!termo) return true;
    const textos = [p.nome, p.cliente.nome, p.tipo, ...p.entradas.map((e) => e.codigo), ...p.saidas.map((s) => s.codigo), ...p.compras.map((c) => c.codigo), ...p.material.map((m) => m.item)];
    return textos.some((t) => semAcento(t).includes(termo));
  });
}

export type ClienteComProjetos = { cliente: Projeto["cliente"]; projetos: Projeto[]; empresas: CompanyKey[]; recebido: number; gasto: number; resultado: number };

/** Um cliente pode ter quantos projetos forem necessários: na visão por cliente, eles aparecem juntos, com a soma. */
export function projetosPorCliente(projetos: readonly Projeto[]): ClienteComProjetos[] {
  const grupos = new Map<string, ClienteComProjetos>();
  for (const p of projetos) {
    const r = resumoDoProjeto(p);
    const g = grupos.get(p.cliente.id) ?? { cliente: p.cliente, projetos: [], empresas: [], recebido: 0, gasto: 0, resultado: 0 };
    g.projetos.push(p);
    if (!g.empresas.includes(p.empresa)) g.empresas.push(p.empresa);
    g.recebido += r.recebido;
    g.gasto += r.gasto;
    g.resultado += r.resultado;
    grupos.set(p.cliente.id, g);
  }
  return [...grupos.values()].sort((a, b) => b.projetos.length - a.projetos.length || a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR"));
}

export function totaisDosProjetos(projetos: readonly Projeto[]): { recebido: number; aReceber: number; gasto: number; aPagar: number; resultado: number; acimaDoOrcamento: number } {
  const resumos = projetos.map(resumoDoProjeto);
  return {
    recebido: soma(resumos.map((r) => r.recebido)),
    aReceber: soma(resumos.map((r) => r.aReceber)),
    gasto: soma(resumos.map((r) => r.gasto)),
    aPagar: soma(resumos.map((r) => r.aPagar)),
    resultado: soma(resumos.map((r) => r.resultado)),
    acimaDoOrcamento: resumos.filter((r) => r.orcamento?.estourou).length,
  };
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** Centavos → "R$ 1.234,56" (negativo com o sinal de menos tipográfico). */
export function reais(centavos: number): string {
  const texto = BRL.format(Math.abs(centavos) / 100);
  return centavos < 0 ? `− ${texto}` : texto;
}

/** "2026-11-18" → "18/11/2026". */
export const dataCurta = (iso: string): string => iso.split("-").reverse().join("/");

// ---------------------------------------------------------------- dados de exemplo

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

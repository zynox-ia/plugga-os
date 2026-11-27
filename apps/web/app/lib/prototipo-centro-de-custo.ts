import type { CompanyKey } from "@plugga/shared";

/**
 * PROTÓTIPO do Centro de custo por projeto (PLU-362), só para o André avaliar o
 * desenho: os tipos, os cálculos, os filtros e os endereços. Os dados de EXEMPLO
 * ficam em `prototipo-centro-de-custo-exemplos.ts`, que só o servidor importa
 * (teste em prototipo-centro-de-custo.test.ts): nada deles vai para um chunk do
 * navegador; descem por props só com a trava de desenvolvimento aberta.
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
  /** Criada no protótipo, nesta aba do navegador (some ao recarregar). */
  nova?: true;
  observacao?: string;
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

/** Cards é a visão padrão (pedido do André em 27/11/2026); Lista é a tabela; Por cliente agrupa. */
export type VisaoDosProjetos = "cards" | "lista" | "clientes";
export type FiltrosDosProjetos = { visao: VisaoDosProjetos; empresa?: CompanyKey; cliente?: string; situacao?: SituacaoDoProjeto; busca?: string };

export const ROTA_DO_CENTRO_DE_CUSTO = "/financeiro/centro-de-custo";

/** `clientes`: os ids de cliente válidos (o filtro de outro id é descartado). */
export function lerFiltrosDosProjetos(parametros: Record<string, string | undefined>, clientes: readonly string[]): FiltrosDosProjetos {
  const empresa = parametros.empresa === "plugga" || parametros.empresa === "waze" ? parametros.empresa : undefined;
  const situacao = parametros.situacao && Object.hasOwn(ROTULO_DA_SITUACAO, parametros.situacao) ? (parametros.situacao as SituacaoDoProjeto) : undefined;
  const cliente = parametros.cliente && clientes.includes(parametros.cliente) ? parametros.cliente : undefined;
  const busca = parametros.busca?.trim().slice(0, 120) || undefined;
  return {
    visao: parametros.visao === "clientes" || parametros.visao === "lista" ? parametros.visao : "cards",
    ...(empresa ? { empresa } : {}),
    ...(cliente ? { cliente } : {}),
    ...(situacao ? { situacao } : {}),
    ...(busca ? { busca } : {}),
  };
}

/** O endereço da lista; com `projeto`, a ficha dele aberta em modal por cima (endereço compartilhável). */
export function hrefDosProjetos(filtros: FiltrosDosProjetos, projeto?: string | null): string {
  const q = new URLSearchParams();
  if (filtros.visao !== "cards") q.set("visao", filtros.visao);
  if (filtros.empresa) q.set("empresa", filtros.empresa);
  if (filtros.cliente) q.set("cliente", filtros.cliente);
  if (filtros.situacao) q.set("situacao", filtros.situacao);
  if (filtros.busca) q.set("busca", filtros.busca);
  if (projeto) q.set("projeto", projeto);
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

// ---------------------------------------------------------------- nova entrada (protótipo, em memória)

export type CamposDaNovaEntrada = { descricao: string; competencia: string; valor: string; vencimento: string; observacao: string };

/** "1.234,56" → 123456 centavos; vazio, inválido ou não positivo → null. */
export function centavosDoTexto(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const centavos = Math.round(Number(limpo) * 100);
  return centavos > 0 ? centavos : null;
}

/** Os problemas por campo, no tom dos formulários do Financeiro; vazio, a entrada pode ser criada. */
export function problemasDaNovaEntrada(c: CamposDaNovaEntrada, hoje: string): Record<string, string> {
  const problemas: Record<string, string> = {};
  if (!c.descricao.trim()) problemas.descricao = "informe a descrição.";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.competencia)) problemas.competencia = "escolha a competência.";
  if (centavosDoTexto(c.valor) === null) problemas.valor = "informe um valor maior que zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) problemas.vencimento = "escolha o vencimento.";
  else if (c.vencimento < hoje) problemas.vencimento = "o vencimento não pode ser antes de hoje.";
  return problemas;
}

/**
 * A entrada criada a partir do centro de custo: no sistema real, uma cobrança em
 * Lançamentos, já com o cliente e o projeto; aqui, só em memória. Nasce a
 * receber; o código definitivo (CR-…) é o que Lançamentos der.
 */
export function entradaNova(c: CamposDaNovaEntrada, sequencia: number): Entrada {
  return {
    id: `nova-${sequencia}`,
    codigo: `CR-nova-${sequencia}`,
    descricao: c.descricao.trim(),
    vencimento: c.vencimento,
    recebidaEm: null,
    situacao: "a_receber",
    valor: centavosDoTexto(c.valor)!,
    nova: true,
    ...(c.observacao.trim() ? { observacao: c.observacao.trim() } : {}),
  };
}

/** O projeto com as entradas criadas nesta sessão primeiro: os totais passam a contá-las. */
export const comEntradasNovas = (p: Projeto, novas: readonly Entrada[]): Projeto => (novas.length ? { ...p, entradas: [...novas, ...p.entradas] } : p);

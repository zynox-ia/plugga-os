import { z } from "zod";

import { diaDoCalendario, etapaDeCompraSchema, obraDeCompraSchema, quantidadeString } from "./compras.js";
import { companyKeySchema } from "./organization.js";
import { decimalString, isoDate, uuid } from "./primitivas.js";

/**
 * Estoque de Suprimentos (PLU-332), em `/suprimentos/estoque`. Um cadastro
 * global: cada item tem a empresa (Plugga ou Waze) como campo obrigatório e
 * filtro, como os pedidos de compra.
 *
 * O saldo nunca é digitado: sai das movimentações. Movimentação não se edita
 * nem se apaga; corrige-se com um ajuste. A reserva vem de um pedido de compra
 * atendido pelo estoque e termina convertida em saída (recebimento) ou
 * liberada (cancelamento), sempre na mesma transação da etapa do pedido.
 *
 * Quantidade com até 3 casas, dinheiro com 2 (o custo médio é guardado com 4 e
 * exibido com 2).
 */

// ---------------------------------------------------------------- catálogos

export const categoriasDeItemDeEstoque = ["kit_solar", "material_eletrico", "material_de_obra", "ferramenta", "escritorio", "outros"] as const;
export const categoriaDeItemDeEstoqueSchema = z.enum(categoriasDeItemDeEstoque);
export type CategoriaDeItemDeEstoque = z.infer<typeof categoriaDeItemDeEstoqueSchema>;

export const rotulosDaCategoriaDeItemDeEstoque: Readonly<Record<CategoriaDeItemDeEstoque, string>> = {
  kit_solar: "Kit solar",
  material_eletrico: "Material elétrico",
  material_de_obra: "Material de obra",
  ferramenta: "Ferramenta",
  escritorio: "Escritório",
  outros: "Outros",
};

/**
 * Situação do saldo, pelo **disponível** (em estoque menos reservado), porque é
 * ele que diz se dá para atender: Zerado quando não há nada disponível; Abaixo
 * do mínimo quando o disponível é menor que o estoque mínimo.
 */
export const situacoesDoSaldo = ["normal", "abaixo_do_minimo", "zerado"] as const;
export const situacaoDoSaldoSchema = z.enum(situacoesDoSaldo);
export type SituacaoDoSaldo = z.infer<typeof situacaoDoSaldoSchema>;

export const rotulosDaSituacaoDoSaldo: Readonly<Record<SituacaoDoSaldo, string>> = {
  normal: "Normal",
  abaixo_do_minimo: "Abaixo do mínimo",
  zerado: "Zerado",
};

/**
 * Tipos de movimentação. `entrada`, `saida` e `ajuste` são registradas pela tela;
 * `reserva`, `liberacao` (a reserva desfeita por cancelamento) e as saídas e
 * entradas ligadas a um pedido nascem das ações do pedido de compra.
 */
export const tiposDeMovimentacao = ["entrada", "saida", "ajuste", "reserva", "liberacao"] as const;
export const tipoDeMovimentacaoSchema = z.enum(tiposDeMovimentacao);
export type TipoDeMovimentacao = z.infer<typeof tipoDeMovimentacaoSchema>;

export const rotulosDoTipoDeMovimentacao: Readonly<Record<TipoDeMovimentacao, string>> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  reserva: "Reserva",
  liberacao: "Liberação de reserva",
};

/** De onde vem o material numa entrada. `compra` liga a um pedido de compra (opcional na tela, sempre no recebimento). */
export const origensDeEntrada = ["compra", "devolucao", "saldo_inicial", "outra"] as const;
export const origemDeEntradaSchema = z.enum(origensDeEntrada);
export type OrigemDeEntrada = z.infer<typeof origemDeEntradaSchema>;

/** Para onde vai o material numa saída ou reserva. `interno` aceita uma área em texto (escritório, almoxarifado…). */
export const destinosDeSaida = ["obra", "cliente", "interno"] as const;
export const destinoDeSaidaSchema = z.enum(destinosDeSaida);
export type DestinoDeSaida = z.infer<typeof destinoDeSaidaSchema>;

export const rotulosDaOrigemDeEntrada: Readonly<Record<OrigemDeEntrada, string>> = {
  compra: "Compra",
  devolucao: "Devolução",
  saldo_inicial: "Saldo inicial",
  outra: "Outra",
};

// ---------------------------------------------------------------- números

const textoOpcional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable()).optional();

/** Quantidade com até 3 casas, zero aceito (estoque mínimo). */
export const quantidadeNaoNegativa = z.string().regex(/^\d+(\.\d{1,3})?$/, "quantidade deve ser um decimal com até 3 casas");

/** Quantidade com sinal, para o ajuste: positivo acrescenta, negativo retira. Nunca zero. */
export const quantidadeComSinal = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, "quantidade deve ser um decimal com até 3 casas")
  .refine((v) => Number(v) !== 0, "o ajuste não pode ser zero");

const dinheiroPositivo = decimalString.refine((v) => Number(v) > 0, "valor deve ser maior que zero");

// ---------------------------------------------------------------- item

/** Código do item: letras, números, ponto, hífen e barra; gravado em maiúsculas. Único por empresa. */
export const codigoDeItemSchema = z
  .string()
  .trim()
  .min(1, "informe o código")
  .max(40)
  .regex(/^[A-Za-z0-9./-]+$/, "use letras, números, ponto, hífen ou barra")
  .transform((v) => v.toUpperCase());

const camposDoItem = {
  empresa: companyKeySchema,
  /** Ausente: a API gera o próximo da empresa (EST-0001, EST-0002…). */
  codigo: codigoDeItemSchema.optional(),
  nome: z.string().trim().min(1, "informe o nome").max(200),
  categoria: categoriaDeItemDeEstoqueSchema,
  /** Unidade de medida como a equipe usa: un, m, kg, rolo, cx… */
  unidade: z.string().trim().min(1, "informe a unidade").max(20),
  estoqueMinimo: quantidadeNaoNegativa,
  observacoes: textoOpcional(2000),
};

/**
 * Item novo. Com `saldoInicial`, a API registra uma entrada de origem
 * `saldo_inicial` com o `custoUnitario`, que vira o custo médio. Sem ele, o item
 * nasce zerado e a primeira entrada define o custo.
 */
export const criarItemDeEstoqueSchema = z
  .object({
    ...camposDoItem,
    saldoInicial: z.preprocess((v) => (v === "" ? undefined : v), quantidadeString.optional()),
    custoUnitario: z.preprocess((v) => (v === "" ? undefined : v), decimalString.refine((v) => Number(v) > 0, "valor deve ser maior que zero").optional()),
  })
  .strict()
  .superRefine((entrada, ctx) => {
    if (entrada.saldoInicial && !entrada.custoUnitario) ctx.addIssue({ code: "custom", path: ["custoUnitario"], message: "informe o custo unitário do saldo inicial" });
    if (!entrada.saldoInicial && entrada.custoUnitario) ctx.addIssue({ code: "custom", path: ["saldoInicial"], message: "informe o saldo inicial" });
  });
export type CriarItemDeEstoque = z.infer<typeof criarItemDeEstoqueSchema>;

/** Edição parcial. A empresa só muda enquanto o item não tem movimentação. */
export const editarItemDeEstoqueSchema = z
  .object({
    empresa: camposDoItem.empresa.optional(),
    codigo: codigoDeItemSchema.optional(),
    nome: camposDoItem.nome.optional(),
    categoria: camposDoItem.categoria.optional(),
    unidade: camposDoItem.unidade.optional(),
    estoqueMinimo: camposDoItem.estoqueMinimo.optional(),
    observacoes: camposDoItem.observacoes,
  })
  .strict();
export type EditarItemDeEstoque = z.infer<typeof editarItemDeEstoqueSchema>;

const pessoa = z.object({ id: uuid, nome: z.string() });

export const saldoDoItemSchema = z.object({
  emEstoque: z.string(),
  reservado: z.string(),
  /** emEstoque − reservado. */
  disponivel: z.string(),
  /** Custo médio ponderado; nulo antes da primeira entrada. */
  custoMedio: z.string().nullable(),
  /** emEstoque × custoMedio. */
  valor: z.string(),
  situacao: situacaoDoSaldoSchema,
  /** Quanto falta para voltar ao mínimo (estoqueMinimo − disponível), ou "0". */
  faltaParaOMinimo: z.string(),
});
export type SaldoDoItem = z.infer<typeof saldoDoItemSchema>;

export const itemDeEstoqueNaListaSchema = z.object({
  id: uuid,
  empresa: companyKeySchema,
  codigo: z.string(),
  nome: z.string(),
  categoria: categoriaDeItemDeEstoqueSchema,
  unidade: z.string(),
  estoqueMinimo: z.string(),
  ativo: z.boolean(),
  saldo: saldoDoItemSchema,
  ultimaMovimentacaoEm: isoDate.nullable(),
});
export type ItemDeEstoqueNaLista = z.infer<typeof itemDeEstoqueNaListaSchema>;

export const reservaDoItemSchema = z.object({
  id: uuid,
  quantidade: z.string(),
  pedido: z.object({ id: uuid, numero: z.number().int().positive(), titulo: z.string(), etapa: z.string() }),
  /** Destino do pedido em texto ("Obra Subestação Santa Tereza", "Cliente Hotel Rio Negro", "Interno"). */
  destino: z.string(),
  reservadaEm: isoDate,
  reservadaPor: pessoa.nullable(),
});
export type ReservaDoItem = z.infer<typeof reservaDoItemSchema>;

/** Entradas e saídas de uma semana (segunda a domingo, em Manaus). */
export const semanaDoItemSchema = z.object({
  /** Segunda-feira da semana. */
  inicio: diaDoCalendario,
  entradas: z.string(),
  saidas: z.string(),
});

export const itemDeEstoqueSchema = itemDeEstoqueNaListaSchema.extend({
  observacoes: z.string().nullable(),
  /** As 8 semanas mais recentes, da mais antiga para a atual, inclusive as sem movimento. */
  ultimas8Semanas: z.array(semanaDoItemSchema).length(8),
  /** Pedidos de compra que reservam o item agora. */
  reservas: z.array(reservaDoItemSchema),
  /** As 10 movimentações mais recentes do item. */
  ultimasMovimentacoes: z.array(z.lazy(() => movimentacaoSchema)),
  /** Pode inativar: não tem reserva ativa. */
  podeInativar: z.boolean(),
  /** Pode trocar a empresa: ainda não tem movimentação. */
  podeTrocarEmpresa: z.boolean(),
  criadoPor: pessoa.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ItemDeEstoque = z.infer<typeof itemDeEstoqueSchema>;

export const filtrosDeSaldo = ["todos", "normal", "abaixo_do_minimo", "zerado", "com_reserva"] as const;

export const listarItensDeEstoqueQuerySchema = z
  .object({
    empresa: companyKeySchema.optional(),
    categoria: categoriaDeItemDeEstoqueSchema.optional(),
    saldo: z.enum(filtrosDeSaldo).default("todos"),
    situacao: z.enum(["ativos", "inativos", "todos"]).default("ativos"),
    /** Código ou nome. */
    busca: z.string().trim().min(1).max(150).optional(),
  })
  .strict();
export type ListarItensDeEstoqueQuery = z.input<typeof listarItensDeEstoqueQuerySchema>;

export const resumoDoEstoqueSchema = z.object({
  itens: z.number().int().nonnegative(),
  normais: z.number().int().nonnegative(),
  abaixoDoMinimo: z.number().int().nonnegative(),
  zerados: z.number().int().nonnegative(),
  comReserva: z.number().int().nonnegative(),
  valorEmEstoque: z.string(),
});

export const listarItensDeEstoqueRespostaSchema = z.object({
  itens: z.array(itemDeEstoqueNaListaSchema),
  /** Com os filtros de empresa, categoria, situação e busca, sem o filtro de saldo. */
  resumo: resumoDoEstoqueSchema,
});
export type ListarItensDeEstoqueResposta = z.infer<typeof listarItensDeEstoqueRespostaSchema>;

// ---------------------------------------------------------------- movimentação

const comum = {
  itemId: uuid,
  /** Dia do movimento em Manaus; não pode ser futuro. Ausente: hoje. */
  data: diaDoCalendario.optional(),
  observacao: textoOpcional(1000),
};

/** Entrada: `compra` pode ligar a um pedido de compra (`pedidoId`); as outras origens não levam vínculo. */
const origemDaEntrada = z
  .object({ tipo: origemDeEntradaSchema.exclude(["saldo_inicial"]), pedidoId: uuid.nullable().optional() })
  .strict()
  .superRefine((v, ctx) => {
    if (v.tipo !== "compra" && v.pedidoId) ctx.addIssue({ code: "custom", path: ["pedidoId"], message: "pedido só vale para origem compra" });
  });

/** Saída: obra exige `obraId`, cliente exige `clientId`, interno aceita `area` em texto. */
const destinoDaSaida = z
  .object({
    tipo: destinoDeSaidaSchema,
    obraId: uuid.nullable().optional(),
    clientId: uuid.nullable().optional(),
    area: textoOpcional(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.tipo === "obra" && !v.obraId) ctx.addIssue({ code: "custom", path: ["obraId"], message: "escolha a obra" });
    if (v.tipo === "cliente" && !v.clientId) ctx.addIssue({ code: "custom", path: ["clientId"], message: "escolha o cliente" });
    if (v.tipo !== "obra" && v.obraId) ctx.addIssue({ code: "custom", path: ["obraId"], message: "obra só vale para destino obra" });
    if (v.tipo !== "cliente" && v.clientId) ctx.addIssue({ code: "custom", path: ["clientId"], message: "cliente só vale para destino cliente" });
    if (v.tipo !== "interno" && v.area) ctx.addIssue({ code: "custom", path: ["area"], message: "área só vale para destino interno" });
  });

/**
 * O que a tela registra (`POST /suprimentos/estoque/movimentacoes`). Reserva e
 * liberação não estão aqui: nascem do pedido de compra. A saída não passa do
 * disponível; o ajuste não deixa o estoque abaixo do reservado; a entrada
 * recalcula o custo médio.
 *
 * O ajuste vem de duas formas, exatamente uma: `saldoContado` (o que a contagem
 * achou; a API calcula a diferença) ou `quantidade` com sinal. Exige o motivo.
 */
export const registrarMovimentacaoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("entrada"), ...comum, quantidade: quantidadeString, custoUnitario: dinheiroPositivo, origem: origemDaEntrada }).strict(),
  z.object({ tipo: z.literal("saida"), ...comum, quantidade: quantidadeString, destino: destinoDaSaida }).strict(),
  z
    .object({
      tipo: z.literal("ajuste"),
      ...comum,
      quantidade: quantidadeComSinal.optional(),
      saldoContado: quantidadeNaoNegativa.optional(),
      observacao: z.string().trim().min(1, "informe o motivo do ajuste").max(1000),
    })
    .strict()
    .refine((v) => (v.quantidade === undefined) !== (v.saldoContado === undefined), {
      path: ["saldoContado"],
      message: "informe o saldo contado ou a diferença, um dos dois",
    }),
]);
export type RegistrarMovimentacao = z.infer<typeof registrarMovimentacaoSchema>;

export const movimentacaoSchema = z.object({
  id: uuid,
  tipo: tipoDeMovimentacaoSchema,
  item: z.object({ id: uuid, codigo: z.string(), nome: z.string(), unidade: z.string(), empresa: companyKeySchema }),
  data: diaDoCalendario,
  /** Positiva; no ajuste, com o sinal. */
  quantidade: z.string(),
  /** Só na entrada. */
  custoUnitario: z.string().nullable(),
  /** quantidade × custo (entrada) ou × custo médio do momento (saída e ajuste). */
  valor: z.string().nullable(),
  /** Na entrada. */
  origem: origemDeEntradaSchema.nullable(),
  /** Na saída e na reserva. */
  destino: destinoDeSaidaSchema.nullable(),
  obra: z.object({ id: uuid, nome: z.string() }).nullable(),
  cliente: z.object({ id: uuid, nome: z.string() }).nullable(),
  area: z.string().nullable(),
  /** Pedido de compra ligado: a compra da entrada, ou o pedido da reserva, da liberação e da saída por recebimento. */
  pedido: z.object({ id: uuid, numero: z.number().int().positive() }).nullable(),
  /** Pronto para a tela: "Compra · PC-0012", "Obra Subestação Santa Tereza", "Interno · Escritório", "Ajuste". */
  origemOuDestino: z.string(),
  observacao: z.string().nullable(),
  /** Saldo em estoque do item logo depois desta movimentação. */
  saldoDepois: z.string(),
  registradaPor: pessoa.nullable(),
  registradaEm: isoDate,
});
export type Movimentacao = z.infer<typeof movimentacaoSchema>;

export const listarMovimentacoesQuerySchema = z
  .object({
    empresa: companyKeySchema.optional(),
    tipo: tipoDeMovimentacaoSchema.optional(),
    itemId: uuid.optional(),
    /** Código ou nome do item. */
    busca: z.string().trim().min(1).max(150).optional(),
    /**
     * Atalho de período: últimos 7 dias, últimos 30 ou o mês corrente, em Manaus.
     * Não combina com `de`/`ate`. Sem nenhum dos três: últimos 30 dias.
     */
    periodo: z.enum(["7", "30", "mes"]).optional(),
    de: diaDoCalendario.optional(),
    ate: diaDoCalendario.optional(),
  })
  .strict()
  .refine((q) => !(q.periodo && (q.de || q.ate)), { path: ["periodo"], message: "use o período ou as datas, não os dois" });
export type ListarMovimentacoesQuery = z.infer<typeof listarMovimentacoesQuerySchema>;

/** Teto de movimentações devolvidas por consulta; `total` conta todas. */
export const LIMITE_DE_MOVIMENTACOES = 500;

export const listarMovimentacoesRespostaSchema = z.object({
  /** Do dia mais recente para o mais antigo; dentro do dia, da mais recente para a mais antiga. */
  dias: z.array(z.object({ dia: diaDoCalendario, movimentacoes: z.array(movimentacaoSchema) })),
  /** Contagem e valor por tipo no período, com os mesmos filtros. */
  resumo: z.object({
    entradas: z.object({ quantidade: z.number().int().nonnegative(), valor: z.string() }),
    saidas: z.object({ quantidade: z.number().int().nonnegative(), valor: z.string() }),
    ajustes: z.object({ quantidade: z.number().int().nonnegative() }),
    reservas: z.object({ quantidade: z.number().int().nonnegative() }),
    liberacoes: z.object({ quantidade: z.number().int().nonnegative() }),
  }),
  total: z.number().int().nonnegative(),
});
export type ListarMovimentacoesResposta = z.infer<typeof listarMovimentacoesRespostaSchema>;

// ---------------------------------------------------------------- ligação com Compras

/**
 * A linha do pedido vinculada a um item de estoque usa a unidade do item (o
 * saldo, a reserva e a entrada contam nela). Comparação de unidades: igualdade
 * exata depois de tirar os espaços das pontas e normalizar o Unicode (NFC).
 * Caixa e espaço interno contam ("mL" não é "ML"; "rolo 50" não é "rolo50").
 * Linha sem unidade não conflita: adota a do item. Uma regra só para a API e a web.
 */
export function unidadeDaLinhaConflita(unidadeDaLinha: string | null | undefined, unidadeDoItem: string): boolean {
  const linha = unidadeDaLinha?.trim().normalize("NFC") ?? "";
  if (!linha) return false;
  return linha !== unidadeDoItem.trim().normalize("NFC");
}

/**
 * Por que a linha não é atendida inteira pelo estoque: sem item de estoque
 * vinculado, item inativo, item de outra empresa, linha em unidade diferente da
 * do item ou disponível insuficiente.
 */
export const motivosSemCobertura = ["sem_vinculo", "inativo", "outra_empresa", "unidade_diferente", "insuficiente"] as const;
export const motivoSemCoberturaSchema = z.enum(motivosSemCobertura);
export type MotivoSemCobertura = z.infer<typeof motivoSemCoberturaSchema>;

/**
 * Quanto o estoque da empresa do pedido atende, item a item, na análise de
 * estoque: `GET /suprimentos/compras/pedidos/:id/atendimento`. Segue as mesmas
 * condições da reserva: linhas do mesmo item dividem um disponível só (na
 * ordem do pedido), e item inativo ou de outra empresa não atende.
 */
export const atendimentoPeloEstoqueSchema = z.object({
  itens: z.array(
    z.object({
      itemDoPedidoId: uuid,
      descricao: z.string(),
      quantidadePedida: z.string(),
      /** Unidade da linha como está no pedido (a vinculada usa a do item). */
      unidadePedida: z.string().nullable(),
      itemDeEstoque: z.object({ id: uuid, codigo: z.string(), nome: z.string(), unidade: z.string() }).nullable(),
      /** Disponível do item (em estoque − reservado, nunca negativo); nulo sem vínculo. */
      disponivel: z.string().nullable(),
      /** Soma das linhas deste pedido com o mesmo item; nulo sem vínculo. */
      pedidoDoItem: z.string().nullable(),
      /** O que o estoque atende desta linha, depois das linhas anteriores do mesmo item; "0.000" quando não atende. */
      atende: z.string(),
      /** Nulo quando atende a linha inteira. */
      motivo: motivoSemCoberturaSchema.nullable(),
    }),
  ),
  /** Todas as linhas atendidas inteiras: dá para decidir "estoque". */
  atendeTudo: z.boolean(),
});
export type AtendimentoPeloEstoque = z.infer<typeof atendimentoPeloEstoqueSchema>;

/**
 * Liga (ou desliga, com null) os itens do pedido aos itens de estoque da mesma
 * empresa: `PUT /suprimentos/compras/pedidos/:id/vinculos-de-estoque`, até a
 * análise de estoque, como a edição dos itens.
 */
export const vincularItensAoEstoqueSchema = z
  .object({ itens: z.array(z.object({ itemDoPedidoId: uuid, itemDeEstoqueId: uuid.nullable() }).strict()).min(1).max(100) })
  .strict();
export type VincularItensAoEstoque = z.infer<typeof vincularItensAoEstoqueSchema>;

/** A entrada no estoque do recebimento de uma aquisição é `entradaNoEstoque` na ação `confirmar_recebimento` (compras.ts). */

/**
 * Pedidos de compra que ainda podem receber entrada do item:
 * `GET /suprimentos/estoque/itens/:id/pedidos-para-entrada`, para a entrada de
 * origem "Compra" do registro de movimentação. Basta a tela de Estoque: vem só o
 * mínimo do pedido (número, título, etapa e as quantidades deste item), não as
 * demais linhas. Ficam de fora o pedido cancelado, o atendido pelo estoque (o
 * material sai da reserva, não entra por compra) e o que já recebeu tudo.
 */
export const pedidoParaEntradaSchema = z.object({
  id: uuid,
  numero: z.number().int().positive(),
  titulo: z.string(),
  etapa: etapaDeCompraSchema,
  /** Soma das linhas do pedido vinculadas ao item. */
  pedida: z.string(),
  /** Entradas de origem compra já ligadas ao pedido, deste item (manuais e a do recebimento). */
  recebida: z.string(),
  /** pedida − recebida, sempre > 0 aqui. */
  falta: z.string(),
});
export type PedidoParaEntrada = z.infer<typeof pedidoParaEntradaSchema>;
export const pedidosParaEntradaRespostaSchema = z.object({ itens: z.array(pedidoParaEntradaSchema) });
export type PedidosParaEntradaResposta = z.infer<typeof pedidosParaEntradaRespostaSchema>;

/**
 * "Abrir pedido de compra" a partir de um item abaixo do mínimo:
 * `POST /suprimentos/estoque/itens/:id/abrir-pedido`. O pedido nasce com a
 * empresa do item, destino interno, o item vinculado e a quantidade que falta
 * para o mínimo (ou a informada). Exige também a tela de Compras.
 */
export const abrirPedidoDeReposicaoSchema = z
  .object({
    quantidade: quantidadeString.optional(),
    prazoEntregaDesejado: diaDoCalendario,
    responsavelId: uuid.nullable().optional(),
  })
  .strict();
export type AbrirPedidoDeReposicao = z.infer<typeof abrirPedidoDeReposicaoSchema>;
export const pedidoDeReposicaoAbertoSchema = z.object({ pedidoId: uuid, numero: z.number().int().positive() });
export type PedidoDeReposicaoAberto = z.infer<typeof pedidoDeReposicaoAbertoSchema>;

/**
 * Opções do registro de movimentação: `GET /suprimentos/estoque/opcoes`, com as
 * obras ativas para o destino da saída. A busca de cliente é
 * `GET /suprimentos/estoque/clientes?busca=`, com os schemas de Compras
 * (`buscarClientesDeCompraQuerySchema`/`RespostaSchema`): só id e nome.
 */
export const opcoesDeEstoqueRespostaSchema = z.object({ obras: z.array(obraDeCompraSchema) });
export type OpcoesDeEstoqueResposta = z.infer<typeof opcoesDeEstoqueRespostaSchema>;

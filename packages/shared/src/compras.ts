import { z } from "zod";

import { formaDePagamentoSchema } from "./fornecedores.js";
import { companyKeySchema } from "./organization.js";
import { decimalString, isoDate, uuid } from "./primitivas.js";

/**
 * Compras de Suprimentos (PLU-327), em `/suprimentos/compras`: o pedido de
 * compra e as sete etapas, no lugar do funil Compras do Bitrix.
 *
 * ```
 * pedido_gerado → analise_estoque ─┬─ estoque ───────────────────────────────┐
 *                                  └─ aquisicao → cotacoes → aprovacao_compra → pagamento → retirada → concluido
 *                                                   ▲              │ revisar
 *                                                   └──────────────┘
 * ```
 *
 * Cancelar vale em qualquer etapa antes de `concluido`, com motivo (o "Negócio
 * perdido" do Bitrix). O pedido cancelado guarda a etapa em que parou.
 *
 * Compras é um setor só, com um quadro de todos os pedidos. A empresa (Plugga
 * ou Waze) é campo obrigatório do pedido, aparece no card e é filtro, como nos
 * pipelines do CRM (decisão do André em 23/11/2026). Sem segregação de função
 * nesta entrega, mas toda ação grava quem fez e quando.
 */

// ---------------------------------------------------------------- etapas

export const etapasDeCompra = [
  "pedido_gerado",
  "analise_estoque",
  "cotacoes",
  "aprovacao_compra",
  "pagamento",
  "retirada",
  "concluido",
] as const;
export const etapaDeCompraSchema = z.enum(etapasDeCompra);
export type EtapaDeCompra = z.infer<typeof etapaDeCompraSchema>;

/** `concluido` é terminal e não tem prazo: nunca abre passagem. */
export type EtapaDeCompraComPrazo = Exclude<EtapaDeCompra, "concluido">;
export const etapasDeCompraComPrazo = etapasDeCompra.filter(
  (etapa): etapa is EtapaDeCompraComPrazo => etapa !== "concluido",
);

export const rotulosDaEtapaDeCompra: Readonly<Record<EtapaDeCompra, string>> = {
  pedido_gerado: "Pedido gerado",
  analise_estoque: "Análise de estoque",
  cotacoes: "Cotações",
  aprovacao_compra: "Aprovação da compra",
  pagamento: "Pagamento",
  retirada: "Retirada",
  concluido: "Concluído",
};

/**
 * Prazo de cada etapa em dias úteis (segunda a sexta, calendário de Manaus, sem
 * feriados). PROPOSTA a validar com o André no protótipo: é o único lugar onde
 * os prazos vivem, e mudar aqui muda a API e a web. Na retirada de aquisição
 * vale o prazo que o fornecedor declarou na cotação escolhida, quando for maior.
 */
export const PRAZO_DA_ETAPA_DE_COMPRA_EM_DIAS_UTEIS: Readonly<Record<EtapaDeCompraComPrazo, number>> = {
  pedido_gerado: 2,
  analise_estoque: 2,
  cotacoes: 5,
  aprovacao_compra: 2,
  pagamento: 2,
  retirada: 5,
};

export const COMPRAS_FUSO_HORARIO = "America/Manaus";

export const situacoesDoPrazo = ["no_prazo", "vence_hoje", "vencido"] as const;
export const situacaoDoPrazoSchema = z.enum(situacoesDoPrazo);
export type SituacaoDoPrazo = z.infer<typeof situacaoDoPrazoSchema>;

/** Onde o pedido está: em andamento numa etapa, concluído ou cancelado (com a etapa em que parou). */
export const situacoesDoPedido = ["em_andamento", "concluido", "cancelado"] as const;
export const situacaoDoPedidoSchema = z.enum(situacoesDoPedido);
export type SituacaoDoPedido = z.infer<typeof situacaoDoPedidoSchema>;

export const destinosDeCompra = ["obra", "cliente", "interno"] as const;
export const destinoDeCompraSchema = z.enum(destinosDeCompra);
export type DestinoDeCompra = z.infer<typeof destinoDeCompraSchema>;

export const rotulosDoDestinoDeCompra: Readonly<Record<DestinoDeCompra, string>> = {
  obra: "Obra",
  cliente: "Cliente",
  interno: "Interno",
};

/** A decisão da análise: "possui em estoque ou já faturado?". */
export const origensDoAtendimento = ["estoque", "aquisicao"] as const;
export const origemDoAtendimentoSchema = z.enum(origensDoAtendimento);
export type OrigemDoAtendimento = z.infer<typeof origemDoAtendimentoSchema>;

// ---------------------------------------------------------------- arquivos

/** Anexo de cotação e comprovante de pagamento: PDF ou imagem, conferidos pelo conteúdo. */
export const ARQUIVO_DE_COMPRA_MAX_BYTES = 25 * 1024 * 1024;
export const tiposDeArquivoDeCompra = ["application/pdf", "image/jpeg", "image/png"] as const;

// ---------------------------------------------------------------- entradas

const texto = (min: number, max: number, problema: string) => z.string().trim().min(min, problema).max(max);
const textoOpcional = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable()).optional();

/** Dia do calendário (AAAA-MM-DD), lido no fuso de Manaus. */
export const diaDoCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
  .refine((v) => {
    const [ano, mes, dia] = v.split("-").map(Number) as [number, number, number];
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  }, "data inexistente");

/** Quantidade com até 3 casas, maior que zero. */
export const quantidadeString = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "quantidade deve ser um decimal com até 3 casas")
  .refine((v) => Number(v) > 0, "quantidade deve ser maior que zero");

const valorPositivo = decimalString.refine((v) => Number(v) > 0, "valor deve ser maior que zero");

export const itemDoPedidoEntradaSchema = z
  .object({
    descricao: texto(1, 300, "descreva o material"),
    quantidade: quantidadeString,
    unidade: textoOpcional(20),
    /** Item de estoque da mesma empresa do pedido (PLU-332): é o que permite atender pelo estoque. */
    itemDeEstoqueId: uuid.nullable().optional(),
  })
  .strict();
export type ItemDoPedidoEntrada = z.infer<typeof itemDoPedidoEntradaSchema>;

/** Destino e vínculo andam juntos: obra exige `obraId`, cliente exige `clientId`, interno não leva nenhum. */
const destinoComVinculo = {
  destino: destinoDeCompraSchema,
  obraId: uuid.nullable().optional(),
  clientId: uuid.nullable().optional(),
};

type DestinoParaValidar = { destino?: DestinoDeCompra; obraId?: string | null; clientId?: string | null };

export function problemaDoDestino(entrada: DestinoParaValidar): { campo: "obraId" | "clientId"; problema: string } | null {
  if (entrada.destino === "obra" && !entrada.obraId) return { campo: "obraId", problema: "Escolha a obra de destino." };
  if (entrada.destino === "cliente" && !entrada.clientId) return { campo: "clientId", problema: "Escolha o cliente de destino." };
  if (entrada.destino !== "obra" && entrada.obraId) return { campo: "obraId", problema: "Obra só vale para destino obra." };
  if (entrada.destino !== "cliente" && entrada.clientId) return { campo: "clientId", problema: "Cliente só vale para destino cliente." };
  return null;
}

export const criarPedidoDeCompraSchema = z
  .object({
    empresa: companyKeySchema,
    titulo: texto(1, 200, "informe o título"),
    descricao: textoOpcional(4000),
    ...destinoComVinculo,
    itens: z.array(itemDoPedidoEntradaSchema).min(1, "inclua pelo menos um item").max(100),
    prazoEntregaDesejado: diaDoCalendario,
    valorOrcado: valorPositivo.nullable().optional(),
    /** Ausente: quem cria é o solicitante. */
    solicitanteId: uuid.optional(),
    responsavelId: uuid.nullable().optional(),
  })
  .strict()
  .superRefine((entrada, ctx) => {
    const problema = problemaDoDestino(entrada);
    if (problema) ctx.addIssue({ code: "custom", path: [problema.campo], message: problema.problema });
  });
export type CriarPedidoDeCompra = z.infer<typeof criarPedidoDeCompraSchema>;

/**
 * Edição dos dados do pedido enquanto ele está em andamento. Os itens só mudam
 * até a análise de estoque: depois disso as cotações já foram pedidas sobre eles.
 * O destino é conferido na API depois de mesclar com o que já existe.
 * A empresa pode mudar sem mexer no número: a numeração é única e global, não
 * por empresa (decisão do coordenador em 23/11/2026, protótipo PC-0131).
 */
export const editarPedidoDeCompraSchema = z
  .object({
    empresa: companyKeySchema.optional(),
    titulo: texto(1, 200, "informe o título").optional(),
    descricao: textoOpcional(4000),
    destino: destinoDeCompraSchema.optional(),
    obraId: uuid.nullable().optional(),
    clientId: uuid.nullable().optional(),
    itens: z.array(itemDoPedidoEntradaSchema).min(1, "inclua pelo menos um item").max(100).optional(),
    prazoEntregaDesejado: diaDoCalendario.optional(),
    valorOrcado: valorPositivo.nullable().optional(),
    solicitanteId: uuid.optional(),
    responsavelId: uuid.nullable().optional(),
  })
  .strict();
export type EditarPedidoDeCompra = z.infer<typeof editarPedidoDeCompraSchema>;

/**
 * Cotação: enviada em `multipart/form-data` com o arquivo no campo `arquivo`
 * (obrigatório) e estes campos como texto. Só na etapa `cotacoes`.
 */
export const registrarCotacaoSchema = z
  .object({
    fornecedorId: uuid,
    valor: valorPositivo,
    valorFrete: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), decimalString.nullable()).optional(),
    /** Prazo de entrega declarado pelo fornecedor, em dias úteis. */
    prazoEntregaDias: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
      z.number().int().min(1).max(365).nullable(),
    ).optional(),
    condicoesPagamento: textoOpcional(500),
  })
  .strict();
export type RegistrarCotacao = z.infer<typeof registrarCotacaoSchema>;

/**
 * Ações sobre o pedido, uma por requisição em `POST .../pedidos/:id/acoes`.
 * Cada uma só vale na etapa indicada; fora dela a API responde 409
 * (`CONFLITO_ESTADO`). O comprovante do pagamento vai antes, por
 * `POST .../pedidos/:id/comprovante` (multipart, campo `arquivo`).
 */
export const acaoDoPedidoSchema = z.discriminatedUnion("acao", [
  /** pedido_gerado → analise_estoque. */
  z.object({ acao: z.literal("iniciar_analise"), observacao: textoOpcional(1000) }).strict(),
  /** analise_estoque → retirada (estoque) ou cotacoes (aquisicao). */
  z.object({ acao: z.literal("decidir_estoque"), origem: origemDoAtendimentoSchema, observacao: textoOpcional(1000) }).strict(),
  /** Em cotacoes: escolhe (ou troca) a cotação de referência. */
  z.object({ acao: z.literal("selecionar_cotacao"), cotacaoId: uuid }).strict(),
  /** cotacoes → aprovacao_compra. Exige cotação escolhida. */
  z.object({ acao: z.literal("enviar_para_aprovacao"), observacao: textoOpcional(1000) }).strict(),
  /** aprovacao_compra → pagamento. */
  z.object({ acao: z.literal("aprovar"), observacao: textoOpcional(1000) }).strict(),
  /** aprovacao_compra → cotacoes, limpando a cotação escolhida. */
  z.object({ acao: z.literal("revisar"), motivo: texto(1, 1000, "informe o motivo da revisão") }).strict(),
  /** pagamento → retirada. */
  z.object({ acao: z.literal("registrar_pagamento"), forma: formaDePagamentoSchema, observacao: textoOpcional(1000) }).strict(),
  /**
   * retirada → concluido. Valor faturado obrigatório na aquisição; no
   * atendimento por estoque é opcional (o material já estava pago).
   */
  z.object({
    acao: z.literal("confirmar_recebimento"),
    /** Dia em que o material foi recebido, informado por quem recebeu; não pode ser futuro. */
    recebidoEm: diaDoCalendario,
    valorFaturado: valorPositivo.nullable().optional(),
    observacao: textoOpcional(1000),
    /**
     * Só na aquisição (PLU-332): itens do pedido, vinculados ao estoque, que
     * entram no estoque com a quantidade recebida e o custo unitário. No
     * atendimento por estoque a reserva vira saída sozinha, sem este campo.
     */
    entradaNoEstoque: z
      .array(z.object({ itemDoPedidoId: uuid, quantidade: quantidadeString, custoUnitario: valorPositivo }).strict())
      .min(1)
      .max(100)
      .optional(),
  }).strict(),
  /** Qualquer etapa antes de concluido. */
  z.object({ acao: z.literal("cancelar"), motivo: texto(1, 1000, "informe o motivo do cancelamento") }).strict(),
]);
export type AcaoDoPedido = z.infer<typeof acaoDoPedidoSchema>;
export type NomeDaAcaoDoPedido = AcaoDoPedido["acao"];
export const acoesDoPedido = [
  "iniciar_analise",
  "decidir_estoque",
  "selecionar_cotacao",
  "enviar_para_aprovacao",
  "aprovar",
  "revisar",
  "registrar_pagamento",
  "confirmar_recebimento",
  "cancelar",
] as const satisfies readonly NomeDaAcaoDoPedido[];
// Falha a compilação se uma ação nova entrar na união sem entrar na lista acima.
const _todasAsAcoesListadas: Exclude<NomeDaAcaoDoPedido, (typeof acoesDoPedido)[number]> extends never ? true : never = true;
void _todasAsAcoesListadas;

/**
 * O destino "obra" do pedido escolhe uma obra do cadastro de Obras da Engenharia
 * (PLU-350); o Compras não cria obra (PLU-355). A obra tem empresa, como o pedido.
 */
const clienteResumido = z.object({ id: uuid, nome: z.string() });

export const obraDeCompraSchema = z.object({ id: uuid, empresa: companyKeySchema, nome: z.string(), cliente: clienteResumido.nullable() });
export type ObraDeCompra = z.infer<typeof obraDeCompraSchema>;

/**
 * Busca de cliente para o destino, em `GET .../compras/clientes?busca=`: só id e
 * nome de clientes ativos, sem abrir o cadastro de clientes do CRM.
 */
export const buscarClientesDeCompraQuerySchema = z.object({ busca: z.string().trim().min(2).max(150) }).strict();
export type BuscarClientesDeCompraQuery = z.infer<typeof buscarClientesDeCompraQuerySchema>;
export const buscarClientesDeCompraRespostaSchema = z.object({ itens: z.array(clienteResumido) });
export type BuscarClientesDeCompraResposta = z.infer<typeof buscarClientesDeCompraRespostaSchema>;

// ---------------------------------------------------------------- saídas

const pessoa = z.object({ id: uuid, nome: z.string() });
export type PessoaDeCompra = z.infer<typeof pessoa>;

/** Quem fez e quando. */
const registro = z.object({ por: pessoa.nullable(), em: isoDate });

export const arquivoDeCompraSchema = z.object({
  nome: z.string(),
  tamanhoBytes: z.number().int().positive(),
  tipo: z.string(),
  /** Caminho da API para baixar (nunca a URL do armazenamento). */
  url: z.string(),
});
export type ArquivoDeCompra = z.infer<typeof arquivoDeCompraSchema>;

export const itemDoPedidoSchema = z.object({
  id: uuid,
  descricao: z.string(),
  quantidade: z.string(),
  unidade: z.string().nullable(),
  /** Item de estoque vinculado (PLU-332), com o que a tela precisa para mostrar. */
  itemDeEstoque: z.object({ id: uuid, codigo: z.string(), nome: z.string() }).nullable(),
});
export type ItemDoPedido = z.infer<typeof itemDoPedidoSchema>;

export const cotacaoDeCompraSchema = z.object({
  id: uuid,
  fornecedor: z.object({ id: uuid, nome: z.string(), ativo: z.boolean() }),
  valor: z.string(),
  valorFrete: z.string().nullable(),
  /** valor + frete. */
  valorTotal: z.string(),
  prazoEntregaDias: z.number().int().nullable(),
  condicoesPagamento: z.string().nullable(),
  arquivo: arquivoDeCompraSchema,
  selecionada: z.boolean(),
  criada: registro,
});
export type CotacaoDeCompra = z.infer<typeof cotacaoDeCompraSchema>;

/** Uma passagem por uma etapa. Revisar cria uma segunda passagem por cotações. */
export const passagemDeEtapaSchema = z.object({
  etapa: etapaDeCompraSchema.exclude(["concluido"]),
  entrouEm: isoDate,
  prazoDiasUteis: z.number().int().positive(),
  prazoEm: isoDate,
  saiuEm: isoDate.nullable(),
  /** Nulo enquanto a passagem está aberta. */
  cumpriuPrazo: z.boolean().nullable(),
  /** Só na passagem aberta. */
  situacaoDoPrazo: situacaoDoPrazoSchema.nullable(),
  responsavel: pessoa.nullable(),
  /** O texto da ação que fechou a passagem: o motivo, na revisão e no cancelamento, ou a observação. */
  observacao: z.string().nullable(),
});
export type PassagemDeEtapa = z.infer<typeof passagemDeEtapaSchema>;

export const destinoDoPedidoSchema = z.object({
  tipo: destinoDeCompraSchema,
  obra: z.object({ id: uuid, nome: z.string() }).nullable(),
  cliente: z.object({ id: uuid, nome: z.string() }).nullable(),
});

/**
 * A conta a pagar que o pedido aprovado gerou no Financeiro (W3, PLU-341). É sempre uma
 * saída; as etapas são as da saída do Financeiro (um teste da API confere), declaradas
 * aqui porque `financeiro.ts` importa este arquivo.
 */
export const etapasDaContaDoPedido = ["aberta", "aprovada", "paga", "conciliada"] as const;
export const contaAPagarDoPedidoSchema = z.object({
  id: uuid,
  /** "CP-0412". */
  codigo: z.string(),
  etapa: z.enum(etapasDaContaDoPedido),
  cancelado: z.boolean(),
});
export type ContaAPagarDoPedido = z.infer<typeof contaAPagarDoPedidoSchema>;

export const pedidoDeCompraSchema = z.object({
  id: uuid,
  empresa: companyKeySchema,
  /** Único e global (PC-0131), não por empresa. */
  numero: z.number().int().positive(),
  titulo: z.string(),
  descricao: z.string().nullable(),
  destino: destinoDoPedidoSchema,
  itens: z.array(itemDoPedidoSchema),
  prazoEntregaDesejado: diaDoCalendario,
  etapa: etapaDeCompraSchema,
  situacao: situacaoDoPedidoSchema,
  origemAtendimento: origemDoAtendimentoSchema.nullable(),
  valorOrcado: z.string().nullable(),
  /** Total da cotação escolhida (valor + frete). */
  valorCotado: z.string().nullable(),
  valorFaturado: z.string().nullable(),
  solicitante: pessoa,
  responsavel: pessoa.nullable(),
  cotacoes: z.array(cotacaoDeCompraSchema),
  cotacaoSelecionadaId: uuid.nullable(),
  pagamento: z
    .object({ forma: formaDePagamentoSchema, comprovante: arquivoDeCompraSchema.nullable(), observacao: z.string().nullable(), registrado: registro })
    .nullable(),
  /** Comprovante enviado na etapa de pagamento, antes de registrá-lo. */
  comprovantePendente: arquivoDeCompraSchema.nullable(),
  /**
   * A conta a pagar no Financeiro, criada na aprovação. Nula antes de aprovar, em pedido
   * aprovado antes da W3 e com o Financeiro desligado. Opcional no contrato até a web ler.
   */
  contaAPagar: contaAPagarDoPedidoSchema.nullable().optional(),
  passagens: z.array(passagemDeEtapaSchema),
  /** Quem fez cada marco. Nulo enquanto o marco não aconteceu. */
  marcos: z.object({
    criado: registro,
    analiseIniciada: registro.nullable(),
    estoqueDecidido: registro.nullable(),
    cotacaoSelecionada: registro.nullable(),
    aprovado: registro.nullable(),
    /** Cada volta da aprovação para cotações, com o motivo, da mais antiga para a mais recente. */
    revisoes: z.array(registro.extend({ motivo: z.string() })),
    /** `em` é o momento do registro; `recebidoEm`, o dia em que o material chegou. */
    recebimentoConfirmado: registro.extend({ recebidoEm: diaDoCalendario }).nullable(),
    cancelado: registro.extend({ motivo: z.string() }).nullable(),
  }),
  /** O que a pessoa da requisição pode fazer agora, já considerando etapa e acesso. */
  acoesPermitidas: z.array(z.enum(acoesDoPedido)),
  podeEditar: z.boolean(),
  podeRegistrarCotacao: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type PedidoDeCompra = z.infer<typeof pedidoDeCompraSchema>;

/** Card do quadro e linha da lista. */
export const pedidoDeCompraResumoSchema = z.object({
  id: uuid,
  empresa: companyKeySchema,
  numero: z.number().int().positive(),
  titulo: z.string(),
  destino: destinoDoPedidoSchema,
  etapa: etapaDeCompraSchema,
  situacao: situacaoDoPedidoSchema,
  responsavel: pessoa.nullable(),
  solicitante: pessoa,
  /** Faturado, senão cotado, senão orçado. */
  valor: z.string().nullable(),
  prazoEntregaDesejado: diaDoCalendario,
  /** Da passagem aberta; nulos em pedido concluído ou cancelado. */
  entrouNaEtapaEm: isoDate.nullable(),
  prazoDaEtapaEm: isoDate.nullable(),
  situacaoDoPrazo: situacaoDoPrazoSchema.nullable(),
  cotacoes: z.number().int().nonnegative(),
  createdAt: isoDate,
});
export type PedidoDeCompraResumo = z.infer<typeof pedidoDeCompraResumoSchema>;

const filtrosDoQuadro = {
  empresa: companyKeySchema.optional(),
  responsavelId: uuid.optional(),
  destino: destinoDeCompraSchema.optional(),
  /** Período de criação do pedido, dias de Manaus, inclusivos. */
  de: diaDoCalendario.optional(),
  ate: diaDoCalendario.optional(),
};

export const quadroDeComprasQuerySchema = z.object(filtrosDoQuadro).strict();
export type QuadroDeComprasQuery = z.infer<typeof quadroDeComprasQuerySchema>;

/** Sem período no filtro, a coluna Concluído mostra só os concluídos nestes últimos dias. */
export const DIAS_DE_CONCLUIDOS_NO_QUADRO = 30;

/**
 * Uma coluna por etapa, na ordem de `etapasDeCompra`. Cancelados ficam fora do
 * quadro (aparecem na lista). Totais por coluna somam `valor` dos cards. Sem
 * `de`/`ate`, a coluna `concluido` traz só os concluídos nos últimos
 * `DIAS_DE_CONCLUIDOS_NO_QUADRO` dias; as etapas em andamento vêm todas.
 */
export const quadroDeComprasRespostaSchema = z.object({
  colunas: z.array(
    z.object({
      etapa: etapaDeCompraSchema,
      quantidade: z.number().int().nonnegative(),
      valorTotal: z.string(),
      vencidos: z.number().int().nonnegative(),
      vencemHoje: z.number().int().nonnegative(),
      pedidos: z.array(pedidoDeCompraResumoSchema),
    }),
  ),
});
export type QuadroDeComprasResposta = z.infer<typeof quadroDeComprasRespostaSchema>;

export const listarPedidosDeCompraQuerySchema = z
  .object({
    ...filtrosDoQuadro,
    /** Título ou número. */
    busca: z.string().trim().min(1).max(150).optional(),
    situacao: situacaoDoPedidoSchema.optional(),
    etapa: etapaDeCompraSchema.optional(),
  })
  .strict();
export type ListarPedidosDeCompraQuery = z.infer<typeof listarPedidosDeCompraQuerySchema>;

/** A lista traz os mais recentes primeiro, até este teto; `total` conta todos os que casam com o filtro. */
export const LIMITE_DA_LISTA_DE_PEDIDOS = 200;

export const listarPedidosDeCompraRespostaSchema = z.object({
  itens: z.array(pedidoDeCompraResumoSchema),
  total: z.number().int().nonnegative(),
});
export type ListarPedidosDeCompraResposta = z.infer<typeof listarPedidosDeCompraRespostaSchema>;

/** Opções dos selects do formulário: pessoas com acesso a Compras, obras ativas e fornecedores ativos. */
export const opcoesDeCompraRespostaSchema = z.object({
  pessoas: z.array(pessoa),
  obras: z.array(obraDeCompraSchema),
  fornecedores: z.array(z.object({ id: uuid, nome: z.string(), nomeFantasia: z.string().nullable() })),
});
export type OpcoesDeCompraResposta = z.infer<typeof opcoesDeCompraRespostaSchema>;

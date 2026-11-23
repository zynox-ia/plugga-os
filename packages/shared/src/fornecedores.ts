import { z } from "zod";

import { cepOpcional, emailOpcional, telefoneOpcional, textoOpcional, ufOpcional, vazioViraNulo } from "./clients.js";
import { cnpjValido, cpfValido, somenteDigitos } from "./documento.js";
import { companyKeySchema } from "./organization.js";
import { isoDate, uuid } from "./primitivas.js";

/**
 * Cadastro de fornecedores de Suprimentos (PLU-326), em `/suprimentos/fornecedores`.
 * Substitui o fornecedor digitado em texto nas cotações do Bitrix.
 *
 * Um cadastro só, compartilhado por Plugga e Waze (decisão do André em
 * 23/11/2026): o fornecedor não tem empresa, e o documento, quando informado,
 * é único no cadastro inteiro.
 *
 * Não há exclusão: fornecedor sai de uso por inativação, porque uma cotação
 * aponta para ele e apagar o fornecedor apagaria a evidência da compra.
 */

export const categoriasDeFornecedor = [
  "kit_solar",
  "material_eletrico",
  "material_de_obra",
  "servico",
  "escritorio",
  "outros",
] as const;
export const categoriaDeFornecedorSchema = z.enum(categoriasDeFornecedor);
export type CategoriaDeFornecedor = z.infer<typeof categoriaDeFornecedorSchema>;

export const rotulosDaCategoriaDeFornecedor: Readonly<Record<CategoriaDeFornecedor, string>> = {
  kit_solar: "Kit solar",
  material_eletrico: "Material elétrico",
  material_de_obra: "Material de obra",
  servico: "Serviço",
  escritorio: "Escritório",
  outros: "Outros",
};

/** Formas de pagamento. As mesmas que o pagamento de uma compra registra (`compras.ts`). */
export const formasDePagamento = ["pix", "boleto", "cartao_credito", "transferencia"] as const;
export const formaDePagamentoSchema = z.enum(formasDePagamento);
export type FormaDePagamento = z.infer<typeof formaDePagamentoSchema>;

export const rotulosDaFormaDePagamento: Readonly<Record<FormaDePagamento, string>> = {
  pix: "PIX",
  boleto: "Boleto",
  cartao_credito: "Cartão de crédito",
  transferencia: "Transferência",
};

/** CPF (11 dígitos) ou CNPJ (14), conferido pelo dígito verificador. Gravado só com dígitos. */
export function documentoDeFornecedorValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

const documentoDoFornecedor = z
  .preprocess(
    vazioViraNulo,
    z.string().transform(somenteDigitos).refine(documentoDeFornecedorValido, "CPF ou CNPJ inválido").nullable(),
  )
  .optional();

const camposDoFornecedor = {
  /** Razão social (PJ) ou nome (PF). */
  nome: z.string().trim().min(1, "informe o nome ou a razão social").max(200),
  nomeFantasia: textoOpcional(200),
  documento: documentoDoFornecedor,
  categoria: categoriaDeFornecedorSchema,
  contatoNome: textoOpcional(150),
  telefone: telefoneOpcional,
  email: emailOpcional,
  /** Endereço completo (PLU-334). CEP só com os 8 dígitos. */
  cep: cepOpcional,
  logradouro: textoOpcional(200),
  numero: textoOpcional(20),
  complemento: textoOpcional(100),
  bairro: textoOpcional(100),
  cidade: textoOpcional(100),
  uf: ufOpcional,
  formasDePagamento: z
    .array(formaDePagamentoSchema)
    .max(formasDePagamento.length)
    .refine((formas) => new Set(formas).size === formas.length, "forma de pagamento repetida")
    .optional(),
  chavePix: textoOpcional(140),
  /** Banco, agência, conta e favorecido, como o fornecedor informou. */
  dadosBancarios: textoOpcional(500),
  observacoes: textoOpcional(2000),
};

export const criarFornecedorSchema = z.object(camposDoFornecedor).strict();
export type CriarFornecedor = z.infer<typeof criarFornecedorSchema>;

/** Edição parcial: `undefined` mantém, `null` apaga. */
export const editarFornecedorSchema = z
  .object({
    ...camposDoFornecedor,
    nome: camposDoFornecedor.nome.optional(),
    categoria: camposDoFornecedor.categoria.optional(),
  })
  .strict();
export type EditarFornecedor = z.infer<typeof editarFornecedorSchema>;

const pessoaResumida = z.object({ id: uuid, nome: z.string() });

export const fornecedorSchema = z.object({
  id: uuid,
  nome: z.string(),
  nomeFantasia: z.string().nullable(),
  /** Só dígitos; o web formata como CPF ou CNPJ pelo tamanho. */
  documento: z.string().nullable(),
  categoria: categoriaDeFornecedorSchema,
  contatoNome: z.string().nullable(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  cep: z.string().nullable(),
  logradouro: z.string().nullable(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  formasDePagamento: z.array(formaDePagamentoSchema),
  /**
   * Dados de pagamento sempre mascarados na leitura (só os 4 últimos caracteres).
   * O completo sai só por `POST /suprimentos/fornecedores/:id/dados-de-pagamento/revelar`,
   * que grava auditoria. A escrita (criar e editar) continua com o valor completo.
   */
  chavePixMascarada: z.string().nullable(),
  dadosBancariosMascarados: z.string().nullable(),
  observacoes: z.string().nullable(),
  ativo: z.boolean(),
  /** Quantas cotações apontam para ele. Informativo: nunca bloqueia a inativação. */
  cotacoes: z.number().int().nonnegative(),
  criadoPor: pessoaResumida.nullable(),
  atualizadoPor: pessoaResumida.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Fornecedor = z.infer<typeof fornecedorSchema>;

export const fornecedorNaListaSchema = fornecedorSchema.pick({
  id: true,
  nome: true,
  nomeFantasia: true,
  documento: true,
  categoria: true,
  contatoNome: true,
  telefone: true,
  email: true,
  formasDePagamento: true,
  cotacoes: true,
  cidade: true,
  uf: true,
  ativo: true,
  updatedAt: true,
});
export type FornecedorNaLista = z.infer<typeof fornecedorNaListaSchema>;

export const situacoesDoFornecedor = ["ativos", "inativos", "todos"] as const;

export const listarFornecedoresQuerySchema = z
  .object({
    /** Nome, nome fantasia ou documento (com ou sem pontuação). */
    busca: z.string().trim().min(1).max(150).optional(),
    /** A lista abre em "todos", como no protótipo aprovado. */
    situacao: z.enum(situacoesDoFornecedor).default("todos"),
    categoria: categoriaDeFornecedorSchema.optional(),
  })
  .strict();
export type ListarFornecedoresQuery = z.input<typeof listarFornecedoresQuerySchema>;

export const listarFornecedoresRespostaSchema = z.object({
  itens: z.array(fornecedorNaListaSchema),
  /** Contagem com a busca e a categoria aplicadas, sem a situação: os dois números não mudam ao trocar o filtro de situação. */
  contagem: z.object({ ativos: z.number().int().nonnegative(), inativos: z.number().int().nonnegative() }),
});
export type ListarFornecedoresResposta = z.infer<typeof listarFornecedoresRespostaSchema>;

/** Máscara dos dados de pagamento: só os 4 últimos caracteres à vista. */
export function mascararDadoDePagamento(valor: string | null): string | null {
  if (valor === null) return null;
  const limpo = valor.trim();
  return limpo.length <= 4 ? "••••" : `•••• ${limpo.slice(-4)}`;
}

/**
 * Revelar os dados de pagamento completos:
 * `POST /suprimentos/fornecedores/:id/dados-de-pagamento/revelar` com o motivo.
 * POST porque grava auditoria (quem, quando, qual fornecedor e o motivo; nunca o valor).
 */
export const motivosParaRevelar = ["mostrar", "copiar", "editar"] as const;
export const revelarDadosDePagamentoSchema = z.object({ motivo: z.enum(motivosParaRevelar) }).strict();
export type RevelarDadosDePagamento = z.infer<typeof revelarDadosDePagamentoSchema>;
export const dadosDePagamentoReveladosSchema = z.object({ chavePix: z.string().nullable(), dadosBancarios: z.string().nullable() });
export type DadosDePagamentoRevelados = z.infer<typeof dadosDePagamentoReveladosSchema>;

// ---------------------------------------------------------------- desempenho (PLU-334)

/**
 * Desempenho do fornecedor: `GET /suprimentos/fornecedores/:id/desempenho`.
 * - Vitória: a cotação é a escolhida de um pedido aprovado (do Pagamento em
 *   diante); revisão ou cancelamento antes da aprovação não contam.
 * - Valor comprado: soma do total (valor + frete) das cotações vencedoras de
 *   pedidos concluídos.
 * - Prazo médio: média do prazo de entrega declarado (dias úteis) nas cotações
 *   que o informaram; nulo sem nenhuma.
 */
export const desempenhoDoFornecedorSchema = z.object({
  cotacoes: z.number().int().nonnegative(),
  vitorias: z.number().int().nonnegative(),
  /** 0 a 100, com 1 casa; nulo sem cotação. */
  percentualDeVitorias: z.number().min(0).max(100).nullable(),
  valorComprado: z.string(),
  prazoMedioDeEntregaDias: z.number().nonnegative().nullable(),
  ultimaCotacaoEm: isoDate.nullable(),
});
export type DesempenhoDoFornecedor = z.infer<typeof desempenhoDoFornecedorSchema>;

/** Uma cotação no histórico do fornecedor, da mais recente para a mais antiga. */
export const cotacaoDoFornecedorSchema = z.object({
  id: uuid,
  pedido: z.object({
    id: uuid,
    numero: z.number().int().positive(),
    titulo: z.string(),
    empresa: companyKeySchema,
    /** Etapa do pedido, ou "cancelado". */
    situacao: z.string(),
  }),
  data: isoDate,
  /** valor + frete. */
  valorTotal: z.string(),
  prazoEntregaDias: z.number().int().nullable(),
  venceu: z.boolean(),
  /**
   * A cotação no pedido: `venceu` (a escolhida de pedido aprovado, do Pagamento em
   * diante), `escolhida` (a escolhida de pedido ainda em Cotações ou Aprovação) ou
   * `nao_venceu` (todo o resto). O card Vitórias conta só `venceu`.
   */
  resultado: z.enum(["venceu", "escolhida", "nao_venceu"]),
});
export type CotacaoDoFornecedor = z.infer<typeof cotacaoDoFornecedorSchema>;

/** Teto do histórico; `total` conta todas. */
export const LIMITE_DO_HISTORICO_DE_COTACOES = 100;

/** `GET /suprimentos/fornecedores/:id/cotacoes`. */
export const historicoDeCotacoesRespostaSchema = z.object({
  itens: z.array(cotacaoDoFornecedorSchema),
  total: z.number().int().nonnegative(),
});
export type HistoricoDeCotacoesResposta = z.infer<typeof historicoDeCotacoesRespostaSchema>;

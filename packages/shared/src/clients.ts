import { z } from "zod";

import { cnpjValido, cpfValido, somenteDigitos } from "./documento.js";
import { isoDate, uuid } from "./primitivas.js";

/**
 * Cadastro único de clientes (PLU-268). Um cliente é pessoa física ou jurídica,
 * sem empresa dona (ADR-0013): a relação com Plugga ou Waze vem dos negócios.
 * Campo não informado fica nulo; nada de valor fictício (como a data
 * 01/01/1900 que o Bitrix grava quando falta o nascimento).
 */

/**
 * @deprecated Segmento legado, que o cadastro novo não usa. Fica só porque o
 * módulo comercial antigo (ganhar oportunidade com cliente novo) ainda o aceita,
 * até a PLU-271 substituí-lo.
 */
export const clientSegmentSchema = z.enum(["prospect", "opm", "pluggamob", "associacoes_gd", "inativo"]);
export type ClientSegment = z.infer<typeof clientSegmentSchema>;

export const clientPersonTypeSchema = z.enum(["pf", "pj"]);
export type ClientPersonType = z.infer<typeof clientPersonTypeSchema>;

export const clientOrigins = [
  "indicacao",
  "instagram",
  "whatsapp",
  "site",
  "telefone",
  "email",
  "evento",
  "prospeccao_ativa",
  "cliente_existente",
  "parceiro",
  "outro",
] as const;
export const clientOriginSchema = z.enum(clientOrigins);
export type ClientOrigin = z.infer<typeof clientOriginSchema>;

export const clientContactRoles = ["decisor", "representante_legal", "tecnico", "financeiro", "outro"] as const;
export const clientContactRoleSchema = z.enum(clientContactRoles);
export type ClientContactRole = z.infer<typeof clientContactRoleSchema>;

export const ufs = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
export const ufSchema = z.enum(ufs);

/** Formulário manda "" para campo em branco: vira null (não informado). */
const vazioViraNulo = (valor: unknown) => (typeof valor === "string" && valor.trim() === "" ? null : valor);

const textoOpcional = (max: number) => z.preprocess(vazioViraNulo, z.string().trim().max(max).nullable()).optional();
const digitosOpcionais = (validos: (d: string) => boolean, problema: string) =>
  z
    .preprocess(vazioViraNulo, z.string().transform(somenteDigitos).refine(validos, problema).nullable())
    .optional();

const telefoneOpcional = digitosOpcionais((d) => d.length >= 10 && d.length <= 13, "informe DDD e número");
const emailOpcional = z.preprocess(vazioViraNulo, z.string().trim().toLowerCase().email("e-mail inválido").max(254).nullable()).optional();
/** O tipo (CPF ou CNPJ) depende de PF/PJ: o dígito verificador é conferido em `problemasDoCadastro`. */
const documentoOpcional = digitosOpcionais((d) => d.length === 11 || d.length === 14, "documento incompleto");
const cpfOpcional = digitosOpcionais(cpfValido, "CPF inválido");
const cepOpcional = digitosOpcionais((d) => d.length === 8, "CEP deve ter 8 dígitos");
const ufOpcional = z.preprocess(vazioViraNulo, ufSchema.nullable()).optional();
const origemOpcional = z.preprocess(vazioViraNulo, clientOriginSchema.nullable()).optional();
const papelOpcional = z.preprocess(vazioViraNulo, clientContactRoleSchema.nullable()).optional();
const dataDeNascimentoOpcional = z
  .preprocess(
    vazioViraNulo,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
      .refine((v) => v > "1900-01-01" && v <= new Date().toISOString().slice(0, 10), "data de nascimento fora do intervalo")
      .nullable(),
  )
  .optional();

// ---------------------------------------------------------------- contatos

const camposDoContato = {
  name: z.string().trim().min(1, "informe o nome").max(150),
  jobTitle: textoOpcional(100),
  role: papelOpcional,
  phone: telefoneOpcional,
  phoneIsWhatsapp: z.boolean().optional(),
  email: emailOpcional,
  isPrimary: z.boolean().optional(),
  cpf: cpfOpcional,
  rg: textoOpcional(30),
};

export const clientContactInputSchema = z.object(camposDoContato).strict();
export type ClientContactInput = z.infer<typeof clientContactInputSchema>;

export const updateClientContactRequestSchema = z
  .object({ ...camposDoContato, name: camposDoContato.name.optional() })
  .strict();
export type UpdateClientContactRequest = z.infer<typeof updateClientContactRequestSchema>;

export const clientContactSchema = z.object({
  id: uuid,
  name: z.string(),
  jobTitle: z.string().nullable(),
  role: clientContactRoleSchema.nullable(),
  phone: z.string().nullable(),
  phoneIsWhatsapp: z.boolean(),
  email: z.string().nullable(),
  isPrimary: z.boolean(),
  cpf: z.string().nullable(),
  rg: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ClientContact = z.infer<typeof clientContactSchema>;

// ---------------------------------------------------------------- cliente

const camposDoCliente = {
  name: z.string().trim().min(1, "informe o nome").max(150),
  legalName: textoOpcional(200),
  document: documentoOpcional,
  phone: telefoneOpcional,
  email: emailOpcional,
  postalCode: cepOpcional,
  street: textoOpcional(200),
  addressComplement: textoOpcional(100),
  district: textoOpcional(100),
  city: textoOpcional(100),
  state: ufOpcional,
  /** Ausente na criação: o responsável é quem cadastra. */
  ownerId: uuid.optional(),
  origin: origemOpcional,
  notes: textoOpcional(2000),
  rg: textoOpcional(30),
  rgIssuer: textoOpcional(30),
  nationality: textoOpcional(60),
  birthDate: dataDeNascimentoOpcional,
};

/** O que as regras de cadastro precisam enxergar, já com os valores finais (criação ou edição mesclada). */
export type ClienteParaValidar = {
  personType: ClientPersonType;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  rg?: string | null;
  rgIssuer?: string | null;
  nationality?: string | null;
  birthDate?: string | null;
  temContatos?: boolean;
};

export type ProblemaDeCadastro = { campo: string; problema: string };

/**
 * Regras que cruzam campos. Uma fonte só: o schema de criação, a API (na edição,
 * depois de mesclar com o que já existe) e o formulário do web chamam esta função.
 */
export function problemasDoCadastro(cliente: ClienteParaValidar): ProblemaDeCadastro[] {
  const problemas: ProblemaDeCadastro[] = [];
  if (!cliente.phone && !cliente.email) {
    problemas.push({ campo: "phone", problema: "Informe pelo menos um telefone ou e-mail." });
  }
  if (cliente.document) {
    if (cliente.personType === "pj" && !cnpjValido(cliente.document)) problemas.push({ campo: "document", problema: "CNPJ inválido." });
    if (cliente.personType === "pf" && !cpfValido(cliente.document)) problemas.push({ campo: "document", problema: "CPF inválido." });
  }
  if (cliente.personType === "pj" && (cliente.rg || cliente.rgIssuer || cliente.nationality || cliente.birthDate)) {
    problemas.push({ campo: "rg", problema: "Dados para contrato (RG, nacionalidade, nascimento) são só de pessoa física." });
  }
  if (cliente.personType === "pf" && cliente.temContatos) {
    problemas.push({ campo: "personType", problema: "Contatos são só de pessoa jurídica. Remova os contatos antes de mudar para pessoa física." });
  }
  return problemas;
}

export const createClientRequestSchema = z
  .object({
    personType: clientPersonTypeSchema,
    ...camposDoCliente,
    /** Atalho do formulário de PJ: o primeiro contato já entra como principal. */
    primaryContact: clientContactInputSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const problemas = problemasDoCadastro({ ...input, temContatos: input.primaryContact !== undefined });
    for (const { campo, problema } of problemas) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: problema });
  });
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

/** Edição parcial: `undefined` mantém, `null` apaga. As regras cruzadas rodam na API depois de mesclar. */
export const updateClientRequestSchema = z
  .object({ personType: clientPersonTypeSchema.optional(), ...camposDoCliente, name: camposDoCliente.name.optional() })
  .strict();
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

export const inactivateClientRequestSchema = z.object({ reason: z.string().trim().min(1).max(300).optional() }).strict();
export type InactivateClientRequest = z.infer<typeof inactivateClientRequestSchema>;

export const clientOwnerSchema = z.object({ id: uuid, name: z.string() });
export type ClientOwner = z.infer<typeof clientOwnerSchema>;

/** Ficha do cliente: dados completos, para quem tem acesso ao cadastro. */
export const clientDetailSchema = z.object({
  id: uuid,
  personType: clientPersonTypeSchema,
  name: z.string(),
  legalName: z.string().nullable(),
  /** Só dígitos; o web formata. */
  document: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  postalCode: z.string().nullable(),
  street: z.string().nullable(),
  addressComplement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  owner: clientOwnerSchema.nullable(),
  origin: clientOriginSchema.nullable(),
  notes: z.string().nullable(),
  rg: z.string().nullable(),
  rgIssuer: z.string().nullable(),
  nationality: z.string().nullable(),
  birthDate: z.string().nullable(),
  active: z.boolean(),
  contacts: z.array(clientContactSchema),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ClientDetail = z.infer<typeof clientDetailSchema>;

/** Linha da lista (LGPD): CPF e telefone já chegam mascarados; CNPJ é público e vem formatado. */
export const clientListItemSchema = z.object({
  id: uuid,
  personType: clientPersonTypeSchema,
  name: z.string(),
  legalName: z.string().nullable(),
  documentDisplay: z.string().nullable(),
  phoneDisplay: z.string().nullable(),
  email: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  owner: clientOwnerSchema.nullable(),
  primaryContactName: z.string().nullable(),
  active: z.boolean(),
  updatedAt: isoDate,
});
export type ClientListItem = z.infer<typeof clientListItemSchema>;

export const listClientsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(150).optional(),
    active: z.enum(["true", "false"]).optional(),
  })
  .strict();
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const listClientsResponseSchema = z.object({ items: z.array(clientListItemSchema) });
export type ListClientsResponse = z.infer<typeof listClientsResponseSchema>;

/** `document` bloqueia; os demais só avisam (nome parecido pega prospect sem documento). */
export const duplicateMatchReasonSchema = z.enum(["document", "phone", "email", "name"]);
export type DuplicateMatchReason = z.infer<typeof duplicateMatchReasonSchema>;

export const clientDuplicateCandidateSchema = z.object({
  id: uuid,
  name: z.string(),
  personType: clientPersonTypeSchema,
  matchedOn: z.array(duplicateMatchReasonSchema).min(1),
});
export type ClientDuplicateCandidate = z.infer<typeof clientDuplicateCandidateSchema>;

export const duplicateCandidatesQuerySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    document: z.string().trim().min(1).max(30).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    /** Na edição, o próprio cliente não conta como duplicata. */
    excludeId: uuid.optional(),
  })
  .strict();
export type DuplicateCandidatesQuery = z.infer<typeof duplicateCandidatesQuerySchema>;

export const clientDuplicateCandidatesResponseSchema = z.object({ candidates: z.array(clientDuplicateCandidateSchema) });
export type ClientDuplicateCandidatesResponse = z.infer<typeof clientDuplicateCandidatesResponseSchema>;

/** Documento repetido é bloqueado antes (409); telefone, e-mail ou nome parecido voltam aqui como aviso. */
export const createClientResponseSchema = z.object({
  client: clientDetailSchema,
  duplicateCandidates: z.array(clientDuplicateCandidateSchema),
});
export type CreateClientResponse = z.infer<typeof createClientResponseSchema>;

export const clientOwnersResponseSchema = z.object({ items: z.array(clientOwnerSchema) });
export type ClientOwnersResponse = z.infer<typeof clientOwnersResponseSchema>;

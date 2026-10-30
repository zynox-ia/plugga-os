import {
  formatarCnpj,
  mascararCpf,
  mascararTelefone,
  problemasDoCadastro,
  type ClientContactRole,
  type ClientDetail,
  type ClientListItem,
  type ClientOrigin,
  type ClientPersonType,
  type ProblemaDeCadastro,
  type UpdateClientRequest,
} from "@plugga/shared";

/** Regras puras do cadastro de clientes: o repositório persiste, estas funções decidem o formato. */

export type LinhaDeContato = {
  id: string;
  name: string;
  jobTitle: string | null;
  role: ClientContactRole | null;
  phone: string | null;
  phoneIsWhatsapp: boolean;
  email: string | null;
  isPrimary: boolean;
  cpf: string | null;
  rg: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LinhaDeCliente = {
  id: string;
  personType: ClientPersonType;
  name: string;
  legalName: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  postalCode: string | null;
  street: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  origin: ClientOrigin | null;
  notes: string | null;
  rg: string | null;
  rgIssuer: string | null;
  nationality: string | null;
  /** AAAA-MM-DD. */
  birthDate: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string } | null;
  contacts: LinhaDeContato[];
};

/** Principal primeiro; os demais na ordem em que foram cadastrados. */
function ordenarContatos<T extends { isPrimary: boolean; createdAt: Date }>(contatos: T[]): T[] {
  return [...contatos].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt.getTime() - b.createdAt.getTime());
}

/** CNPJ é dado público e aparece inteiro; CPF aparece mascarado na lista (LGPD). */
function documentoNaLista(personType: ClientPersonType, document: string | null): string | null {
  if (!document) return null;
  return personType === "pj" ? formatarCnpj(document) : mascararCpf(document);
}

export function paraItemDeLista(
  linha: Pick<
    LinhaDeCliente,
    "id" | "personType" | "name" | "legalName" | "document" | "phone" | "email" | "city" | "state" | "owner" | "active" | "updatedAt"
  > & { contacts: Array<Pick<LinhaDeContato, "name" | "isPrimary" | "createdAt">> },
): ClientListItem {
  return {
    id: linha.id,
    personType: linha.personType,
    name: linha.name,
    legalName: linha.legalName,
    documentDisplay: documentoNaLista(linha.personType, linha.document),
    phoneDisplay: linha.phone ? mascararTelefone(linha.phone) : null,
    email: linha.email,
    city: linha.city,
    state: linha.state,
    owner: linha.owner,
    primaryContactName: ordenarContatos(linha.contacts)[0]?.name ?? null,
    active: linha.active,
    updatedAt: linha.updatedAt.toISOString(),
  };
}

export function paraDetalhe(linha: LinhaDeCliente): ClientDetail {
  return {
    id: linha.id,
    personType: linha.personType,
    name: linha.name,
    legalName: linha.legalName,
    document: linha.document,
    phone: linha.phone,
    email: linha.email,
    postalCode: linha.postalCode,
    street: linha.street,
    addressComplement: linha.addressComplement,
    district: linha.district,
    city: linha.city,
    state: linha.state,
    owner: linha.owner,
    origin: linha.origin,
    notes: linha.notes,
    rg: linha.rg,
    rgIssuer: linha.rgIssuer,
    nationality: linha.nationality,
    birthDate: linha.birthDate,
    active: linha.active,
    contacts: ordenarContatos(linha.contacts).map((contato) => ({
      ...contato,
      createdAt: contato.createdAt.toISOString(),
      updatedAt: contato.updatedAt.toISOString(),
    })),
    createdAt: linha.createdAt.toISOString(),
    updatedAt: linha.updatedAt.toISOString(),
  };
}

/** Na edição, `undefined` mantém o valor atual e `null` apaga: as regras olham o resultado final. */
export function problemasDaEdicao(atual: LinhaDeCliente, edicao: UpdateClientRequest, temContatos: boolean): ProblemaDeCadastro[] {
  const final = <K extends keyof UpdateClientRequest & keyof LinhaDeCliente>(campo: K) =>
    edicao[campo] !== undefined ? edicao[campo] : atual[campo];
  return problemasDoCadastro({
    personType: edicao.personType ?? atual.personType,
    document: final("document") as string | null,
    phone: final("phone") as string | null,
    email: final("email") as string | null,
    rg: final("rg") as string | null,
    rgIssuer: final("rgIssuer") as string | null,
    nationality: final("nationality") as string | null,
    birthDate: final("birthDate") as string | null,
    temContatos,
  });
}

/** Para a trilha de auditoria: só os nomes dos campos enviados, nunca os valores. */
export function camposInformados(entrada: Record<string, unknown>): string[] {
  return Object.keys(entrada).filter((campo) => entrada[campo] !== undefined);
}

import { formatarCep, somenteDigitos, telefoneNacional, type LeadProfile } from "@plugga/shared";

export function mascaraCep(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

export function mascaraTelefone(valor: string, fixo = false): string {
  const digitos = telefoneNacional(valor).slice(0, fixo ? 10 : 11);
  if (!digitos) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  const corte = digitos.length > 10 ? 7 : 6;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, corte)}${digitos.length > corte ? `-${digitos.slice(corte)}` : ""}`;
}

export function normalizarSite(valor: string): string {
  const site = valor.trim();
  return site && !/^[a-z][a-z\d+.-]*:/i.test(site) ? `https://${site}` : site;
}

export function urlSiteSeguro(valor: string | null | undefined): string | null {
  if (!valor) return null;
  try {
    const url = new URL(normalizarSite(valor));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

type EnderecoLead = Pick<LeadProfile, "postalCode" | "street" | "district" | "city" | "state">;

export function mapaDoEndereco(endereco: EnderecoLead) {
  const cep = somenteDigitos(endereco.postalCode ?? "");
  const rua = endereco.street?.trim();
  const cidade = endereco.city?.trim();
  if (!rua && cep.length !== 8 && !(cidade && endereco.state)) return null;
  const query = [rua, endereco.district?.trim(), cidade, endereco.state, cep.length === 8 ? formatarCep(cep) : "", "Brasil"].filter(Boolean).join(", ");
  return {
    query,
    embedUrl: `https://maps.google.com/maps?${new URLSearchParams({ q: query, output: "embed", z: "16", hl: "pt-BR" })}`,
    externalUrl: `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`,
  };
}

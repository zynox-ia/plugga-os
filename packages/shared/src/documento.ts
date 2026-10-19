/**
 * CPF, CNPJ, CEP e telefone brasileiros: validação por dígito verificador,
 * formatação e máscara para listas. Sem dependências e sem importar outros
 * módulos do pacote, para rodar igual na API, no web e no `node --test`.
 */

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Confere o dígito na posição `pesos.length` (módulo 11, resto < 2 vira 0). */
function digitoConfere(digitos: string, pesos: readonly number[]): boolean {
  const soma = pesos.reduce((total, peso, i) => total + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return Number(digitos[pesos.length]) === (resto < 2 ? 0 : 11 - resto);
}

const PESOS_CPF_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  return digitoConfere(d, PESOS_CPF_1) && digitoConfere(d, PESOS_CPF_2);
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  return digitoConfere(d, PESOS_CNPJ_1) && digitoConfere(d, PESOS_CNPJ_2);
}

export function formatarCpf(valor: string): string {
  const d = somenteDigitos(valor);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : valor;
}

export function formatarCnpj(valor: string): string {
  const d = somenteDigitos(valor);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : valor;
}

export function formatarCep(valor: string): string {
  const d = somenteDigitos(valor);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : valor;
}

/** Telefone nacional: DDD + 8 ou 9 dígitos; o código do país (55) é descartado. */
export function telefoneNacional(valor: string): string {
  const d = somenteDigitos(valor);
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
}

export function formatarTelefone(valor: string): string {
  const d = telefoneNacional(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

/** CPF em lista (LGPD): só os seis dígitos do meio ficam à vista. */
export function mascararCpf(valor: string): string {
  const d = somenteDigitos(valor);
  return d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : "•••";
}

/** Telefone em lista (LGPD): DDD, primeiro dígito e os quatro finais. */
export function mascararTelefone(valor: string): string {
  const d = telefoneNacional(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]}••••-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d[2]}•••-${d.slice(6)}`;
  return `${"•".repeat(Math.max(d.length - 4, 0))}${d.slice(-4)}`;
}

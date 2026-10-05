// Validação e geração de documentos sintéticos (spec 002, US2). Ninguém aqui
// identifica uma pessoa ou empresa real: a faixa reservada é documentada em
// specs/002-fundacao-solida/quickstart.md e o scanner a trata como permitida.

/** CNPJ: raiz começando por 99999 (8 dígitos), filial 0001. CPF: 9 primeiros dígitos começando por 999999. */
export const FAIXA_CNPJ = "99999";
export const FAIXA_CPF = "999999";

const soDigitos = (texto) => String(texto).replace(/\D/g, "");

function digito(base, pesos) {
  const soma = [...base].reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, ...PESOS_CNPJ_1];

export function cnpjValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const d1 = digito(d.slice(0, 12), PESOS_CNPJ_1);
  const d2 = digito(d.slice(0, 12) + d1, PESOS_CNPJ_2);
  return d.slice(12) === `${d1}${d2}`;
}

export function cpfValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const d1 = digito(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(d.slice(0, 9) + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d.slice(9) === `${d1}${d2}`;
}

export function cnpjSintetico(sequencia) {
  const base = FAIXA_CNPJ + String(sequencia).padStart(3, "0") + "0001";
  const d1 = digito(base, PESOS_CNPJ_1);
  return base + d1 + digito(base + d1, PESOS_CNPJ_2);
}

export function cpfSintetico(sequencia) {
  const base = FAIXA_CPF + String(sequencia).padStart(3, "0");
  const d1 = digito(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base + d1 + digito(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
}

export const naFaixaSintetica = (digitos) =>
  (digitos.length === 14 && digitos.startsWith(FAIXA_CNPJ)) ||
  (digitos.length === 11 && digitos.startsWith(FAIXA_CPF));

export function formataCnpj(d) {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formataCpf(d) {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

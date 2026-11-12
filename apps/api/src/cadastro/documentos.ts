/** Só dígitos: aceita máscara (12.345.678/0001-95, 69.000-000) e devolve o número cru. */
export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/** CNPJ com 14 dígitos e os dois verificadores corretos. Sequência repetida (00000000000000) não vale. */
export function cnpjValido(texto: string): boolean {
  const cnpj = somenteDigitos(texto);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const verificador = (base: string): number => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((total, digito, indice) => total + Number(digito) * (pesos[indice] ?? 0), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = verificador(cnpj.slice(0, 12));
  const segundo = verificador(cnpj.slice(0, 12) + String(primeiro));
  return cnpj.endsWith(`${primeiro}${segundo}`);
}

/** CEP com exatamente 8 dígitos. O CEP não tem verificador. */
export function cepValido(texto: string): boolean {
  return /^\d{8}$/.test(somenteDigitos(texto)) && !/^0{8}$/.test(somenteDigitos(texto));
}

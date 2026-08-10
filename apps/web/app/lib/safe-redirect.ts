/**
 * Validação de destino pós-login, num lugar só.
 *
 * Ela existia inline no formulário de login e passou a ser compartilhada porque
 * o login Google atravessa o Google e volta: o destino é gravado antes da ida
 * (`sessionStorage`) e lido depois da volta, e as duas pontas precisam aplicar
 * a MESMA regra. Validar só na gravação deixaria o valor confiável apenas
 * enquanto ninguém mexesse no armazenamento da aba — que é justamente o que um
 * XSS ou uma extensão fariam.
 */

/** Devolve o caminho se ele for relativo e same-origin; senão, null. */
export function safeRelativePath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) {
    return null;
  }
  // `//host` é URL de protocolo relativo: o browser vai para OUTRO site.
  // `/\host` é a mesma coisa em vários browsers, que tratam "\" como "/".
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  // Caractere de controle (inclusive CR/LF) num destino é vetor de injeção de
  // cabeçalho. Conferido por código, e não por regex, para o teste ficar óbvio.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return null;
    }
  }

  // Última conferência pela própria resolução do browser: se, resolvido contra
  // uma origem qualquer, o resultado sai dela, não era relativo de verdade.
  try {
    const base = "https://plugga.invalid";
    const resolved = new URL(value, base);
    if (resolved.origin !== base) {
      return null;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

/** Mesma regra, com a raiz como destino padrão. */
export function safeRedirect(value: string | null | undefined): string {
  return safeRelativePath(value) ?? "/";
}

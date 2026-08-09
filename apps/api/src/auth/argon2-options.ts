/**
 * Parâmetros Argon2id (ADR-0008), seguindo a orientação OWASP (~19 MiB, 2
 * iterações, 1 lane). Fonte única de propósito: o seed e o dublê de teste
 * geravam hash com cópias próprias "alinhadas por comentário" — endurecer o
 * custo no serviço e esquecer uma cópia faria o hash do admin semeado divergir
 * do runtime em silêncio.
 */
export const argon2Options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

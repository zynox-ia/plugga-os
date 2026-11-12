/**
 * Chamadas das integrações à API: o texto do erro vem da própria API (já em
 * português e sem detalhe interno), com um padrão para quando não vier.
 */
export async function detalheDoErro(resposta: Response, padrao: string): Promise<string> {
  // `ok` antes do parse: um erro sem JSON (proxy fora do ar) não pode estourar aqui.
  const corpo = (await resposta.json().catch(() => null)) as { message?: unknown } | null;
  return typeof corpo?.message === "string" ? corpo.message : padrao;
}

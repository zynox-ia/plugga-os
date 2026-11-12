/**
 * Chamadas das integrações à API: o texto do erro vem da própria API (já em
 * português e sem detalhe interno), com um padrão para quando não vier.
 */
export async function detalheDoErro(resposta: Response, padrao: string): Promise<string> {
  // `ok` antes do parse: um erro sem JSON (proxy fora do ar) não pode estourar aqui.
  const corpo = (await resposta.json().catch(() => null)) as { message?: unknown; issues?: unknown } | null;
  // Validação de campo: a API devolve uma frase genérica em `message` e o motivo, já em
  // português, em `issues`. É o motivo que ajuda quem preenche o formulário.
  if (Array.isArray(corpo?.issues)) {
    const primeira = (corpo.issues as { message?: unknown }[]).find((issue) => typeof issue?.message === "string" && issue.message !== "");
    if (primeira) return primeira.message as string;
  }
  return typeof corpo?.message === "string" ? corpo.message : padrao;
}

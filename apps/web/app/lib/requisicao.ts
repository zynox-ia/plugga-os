/**
 * Validação de corpo de requisição no navegador, antes do envio (US12, T122, FR-060).
 *
 * Os clientes (`compras-client`, `commercial-client`, `energy-client`) recebiam
 * `corpo: unknown` e mandavam o que viesse. Agora cada função declara o schema de
 * `@plugga/shared` do endpoint: o tipo do argumento sai dele e o valor é validado
 * (e normalizado) antes de qualquer `fetch`. A API continua validando — esta é a
 * primeira barreira, não a única.
 */

export type ResultadoHttp<T> = { ok: true; data: T } | { ok: false; message: string };

/** Contrato mínimo de um schema zod, sem depender de `zod` direto no web. */
export type EsquemaDeCorpo<S> = {
  _input: unknown;
  safeParse(
    valor: unknown,
  ): { success: true; data: S } | { success: false; error: { issues: { message: string; path: (string | number)[] }[] } };
};

/**
 * Corpo aceito por um schema: só as chaves que o schema conhece (um campo
 * digitado errado é erro de compilação), com valor `unknown`.
 *
 * Os valores são `unknown` de propósito: os corpos nascem de `FormData`, onde
 * tudo é `string`, e a conversão para o tipo do schema (enum, UUID, data ISO)
 * é exatamente o que `validarCorpo` faz em tempo de execução, antes do envio.
 * Tipar os valores aqui só forçaria `as` nas telas sem checar nada a mais.
 */
export type EntradaDe<E> = E extends { _input: infer I } ? { [K in keyof I]?: unknown } : never;

export function validarCorpo<S>(
  schema: EsquemaDeCorpo<S>,
  corpo: unknown,
): { ok: true; dados: S } | { ok: false; message: string } {
  const resultado = schema.safeParse(corpo);
  if (resultado.success) return { ok: true, dados: resultado.data };
  const message = resultado.error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
  return { ok: false, message: message || "dados inválidos" };
}

type Falha = { issues?: { message: string }[]; message?: string; mensagem?: string } | null;

export function mensagemDeFalha(payload: Falha, status: number): string {
  const issues = Array.isArray(payload?.issues) ? payload.issues.map((issue) => issue.message).join("; ") : null;
  return issues || payload?.mensagem || payload?.message || `falha (${status})`;
}

/**
 * POST JSON same-origin para as rotas `app/api/**`. Valida `corpo` com `schema`
 * antes de enviar; `semServico` é a mensagem de rede para o módulo.
 */
export async function postarJson<E extends EsquemaDeCorpo<unknown>, T = unknown>(
  url: string,
  schema: E,
  corpo: EntradaDe<E>,
  semServico: string,
): Promise<ResultadoHttp<T>> {
  const validado = validarCorpo(schema, corpo);
  if (!validado.ok) return { ok: false, message: validado.message };

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validado.dados),
    });
    const payload = await resposta.json().catch(() => null);
    if (!resposta.ok) return { ok: false, message: mensagemDeFalha(payload, resposta.status) };
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, message: semServico };
  }
}

export class MfaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function mfaRequest<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/mfa/${path}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new MfaError(0, "Não foi possível conectar. Verifique sua conexão e tente novamente.");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 403 && body && typeof body === "object" && "message" in body
      && body.message === "Entre novamente para configurar a autenticação em duas etapas.") {
      throw new MfaError(403, body.message);
    }
    const message = response.status === 429 ? "Muitas tentativas. Aguarde um minuto e tente novamente."
      : response.status === 401 ? "Código inválido ou expirado. Use um código atual ou um código de recuperação ainda não utilizado."
      : response.status === 403 ? "Confirme o segundo fator para continuar."
      : "Não foi possível concluir. Tente novamente.";
    throw new MfaError(response.status, message);
  }
  return response.json() as Promise<T>;
}

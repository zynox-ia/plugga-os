/**
 * Configuração do login Google lida no SERVIDOR e entregue como prop.
 *
 * Deliberadamente sem `NEXT_PUBLIC_`: uma variável `NEXT_PUBLIC_` é congelada no
 * momento do build, e o app é publicado como bundle standalone reutilizado entre
 * ambientes — o client ID de desenvolvimento acabaria embutido na imagem de
 * produção, e a audiência do ID token deixaria de bater com a que a API espera.
 * O valor é público (vai para o browser de qualquer jeito), mas precisa vir do
 * ambiente de execução, não do de compilação.
 */

export interface GoogleAuthConfig {
  clientId: string;
  /** URI absoluta do callback, exatamente como registrada no Google Cloud. */
  loginUri: string;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Devolve a configuração quando o recurso está ligado E completo. Configuração
 * pela metade some do mesmo jeito que a flag desligada: renderizar o botão
 * oficial com client ID vazio produziria um erro do Google no console e um
 * botão que não faz nada — pior do que não oferecer o caminho.
 */
export function googleAuthConfig(): GoogleAuthConfig | null {
  if (process.env.GOOGLE_AUTH_ENABLED !== "true") {
    return null;
  }

  const clientId = (process.env.GOOGLE_OIDC_CLIENT_ID ?? "").trim();
  const loginUri = (process.env.GOOGLE_LOGIN_URI ?? "").trim();
  if (!clientId || !loginUri) {
    console.warn(
      "GOOGLE_AUTH_ENABLED=true but GOOGLE_OIDC_CLIENT_ID/GOOGLE_LOGIN_URI are missing; " +
        "the Google button stays hidden and password login is unaffected",
    );
    return null;
  }

  try {
    const url = new URL(loginUri);
    if (url.protocol !== "https:" && !isLocalHost(url.hostname)) {
      console.warn("GOOGLE_LOGIN_URI must use https outside localhost; Google button stays hidden");
      return null;
    }
  } catch {
    console.warn("GOOGLE_LOGIN_URI is not a valid absolute URL; Google button stays hidden");
    return null;
  }

  return { clientId, loginUri };
}

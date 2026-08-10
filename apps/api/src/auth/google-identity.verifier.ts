/**
 * Porta de verificação do ID token do Google (adendo ao ADR-0008).
 *
 * Existe para que a política de vínculo — quem entra, quem é recusado, o que é
 * auditado — seja testável sem rede e sem conta Google real. O adaptador de
 * produção (`GoogleAuthLibraryVerifier`) é a única coisa neste projeto que fala
 * com o Google; tudo acima dele trabalha sobre estas claims já verificadas.
 */

/** Claims mínimas necessárias para decidir o login. Nada além disto é lido. */
export interface GoogleIdentityClaims {
  /** `sub`: identificador estável da conta Google. É a identidade permanente. */
  subject: string;
  email: string;
  emailVerified: boolean;
  /** Claim `hd`: domínio Google Workspace. Ausente em contas Gmail comuns. */
  hostedDomain: string | null;
}

/**
 * Por que a falha é de UM dos dois tipos e nunca de um terceiro: "o token não
 * vale" é uma resposta definitiva sobre esta tentativa, e "não deu para
 * verificar" é uma indisponibilidade nossa. Confundir os dois faria uma queda
 * do JWKS do Google virar uma enxurrada de "conta não autorizada" — e mandaria
 * o suporte procurar defeito na conta de quem tentou entrar.
 */
export type GoogleVerificationFailure = "invalid_token" | "unavailable";

export class GoogleVerificationError extends Error {
  constructor(
    readonly kind: GoogleVerificationFailure,
    message: string,
  ) {
    super(message);
    this.name = "GoogleVerificationError";
  }
}

export abstract class GoogleIdentityVerifier {
  /**
   * Verifica assinatura, `aud`, `iss` e `exp` do ID token e devolve as claims.
   * Lança `GoogleVerificationError`. O token bruto nunca aparece na mensagem.
   */
  abstract verify(idToken: string): Promise<GoogleIdentityClaims>;
}

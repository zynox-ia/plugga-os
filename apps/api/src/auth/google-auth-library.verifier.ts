import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client, type TokenPayload } from "google-auth-library";

import {
  GoogleIdentityVerifier,
  GoogleVerificationError,
  type GoogleIdentityClaims,
} from "./google-identity.verifier";

/**
 * Sinais de que a falha foi de REDE/JWKS e não do token. `google-auth-library`
 * usa a mesma classe de erro para as duas coisas, e a diferença é o que separa
 * "sua conta não pode entrar" de "o Google está fora do ar" na tela.
 */
const NETWORK_FAILURE = [
  "verification certificates",
  "federated signon",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "getaddrinfo",
  "socket hang up",
  "network",
  "fetch failed",
  "request timed out",
];

/**
 * Adaptador oficial de verificação do ID token (Google Identity Services).
 *
 * Usa `verifyIdToken`, que confere assinatura contra as chaves públicas do
 * Google — com cache e rotação feitos pela própria biblioteca —, `aud`, `iss` e
 * `exp`. O endpoint `tokeninfo` NÃO é usado: é de depuração, custa uma ida à
 * rede por login e passa a ser um ponto único de falha.
 */
@Injectable()
export class GoogleAuthLibraryVerifier extends GoogleIdentityVerifier {
  private readonly logger = new Logger(GoogleAuthLibraryVerifier.name);
  private readonly client: OAuth2Client;
  private readonly audience: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    this.audience = config.get<string>("GOOGLE_OIDC_CLIENT_ID", "");
    this.client = new OAuth2Client(this.audience);
  }

  async verify(idToken: string): Promise<GoogleIdentityClaims> {
    if (!this.audience) {
      // Chega aqui só se a flag foi ligada sem client ID; o schema de ambiente
      // já recusa esse arranjo no boot. Falha fechada, nunca "aceita qualquer".
      throw new GoogleVerificationError("unavailable", "google client id is not configured");
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audience });
      payload = ticket.getPayload();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (NETWORK_FAILURE.some((sinal) => message.toLowerCase().includes(sinal.toLowerCase()))) {
        // A mensagem da biblioteca é sobre a nossa infraestrutura, não sobre a
        // pessoa: pode ser registrada. O token, esse, nunca.
        this.logger.warn(`google id token verification unavailable: ${message}`);
        throw new GoogleVerificationError("unavailable", "google verification is unavailable");
      }
      throw new GoogleVerificationError("invalid_token", "google id token is not valid");
    }

    if (!payload?.sub || !payload.email) {
      throw new GoogleVerificationError("invalid_token", "google id token is missing sub or email");
    }

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      hostedDomain: payload.hd ?? null,
    };
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { generateOpaqueToken, hashToken } from "../core/auth/token.util";
import { EmailPort } from "../email/email.port";
import { AuthRepository } from "./auth.repository";

const INVITE_TTL_MINUTES = 72 * 60;
const RESET_TTL_MINUTES = 60;

export interface TokenRecipient {
  id: string;
  email: string;
  name: string;
}

/**
 * Emite o token de uso único e manda o e-mail correspondente (ADR-0008/0010).
 * Vive fora de AuthService porque convite e redefinição de senha são fluxos de
 * donos diferentes — a equipe convida, a própria pessoa redefine — e os dois
 * precisam da mesma primitiva. Só o hash do token é guardado; o valor bruto sai
 * daqui apenas dentro do link do e-mail.
 */
@Injectable()
export class AuthTokenIssuer {
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(EmailPort) private readonly email: EmailPort,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  sendInvite(user: TokenRecipient): Promise<void> {
    return this.issue(user, "invite", INVITE_TTL_MINUTES, "accept-invite");
  }

  sendReset(user: TokenRecipient): Promise<void> {
    return this.issue(user, "reset", RESET_TTL_MINUTES, "reset");
  }

  private async issue(
    user: TokenRecipient,
    type: "invite" | "reset",
    ttlMinutes: number,
    linkPath: string,
  ): Promise<void> {
    const rawToken = generateOpaqueToken();
    await this.repository.createAuthToken({
      userId: user.id,
      type,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    });

    const baseUrl = this.config.get<string>("AUTH_APP_BASE_URL", "http://localhost:3000");
    await this.email.sendTransactional({
      to: user.email,
      template: type,
      variables: {
        name: user.name,
        link: `${baseUrl}/auth/${linkPath}?token=${rawToken}`,
        expiresInMinutes: ttlMinutes,
      },
    });
  }
}

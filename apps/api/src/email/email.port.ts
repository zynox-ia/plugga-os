export type EmailTemplate = "invite" | "reset";

export interface TransactionalEmail {
  to: string;
  template: EmailTemplate;
  variables: {
    name?: string;
    /** Single-use link carrying the opaque token. Never logged. */
    link: string;
    expiresInMinutes: number;
  };
}

/**
 * Port consumed by the auth flows (ADR-0010). No auth flow imports an email SDK
 * directly. Mailpit/Brevo adapters land in a later PR; the default is a safe
 * Noop that never sends.
 */
export abstract class EmailPort {
  abstract sendTransactional(email: TransactionalEmail): Promise<void>;
}

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
 * directly. Adapters: noop (default, never sends), mailpit (local), brevo
 * (client account in staging/prod).
 */
export abstract class EmailPort {
  abstract sendTransactional(email: TransactionalEmail): Promise<void>;
}

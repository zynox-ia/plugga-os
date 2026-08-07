import type { EmailStatus } from "@plugga/shared";

/** Fallback local (usado só quando GET /email/status não responde). */
export const FALLBACK_EMAIL_STATUS: EmailStatus = {
  provider: "noop",
  configured: false,
};

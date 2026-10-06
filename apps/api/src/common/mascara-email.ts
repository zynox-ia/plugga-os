/**
 * Masks an email address for logging. Adapters log delivery outcomes but never
 * the recipient's full address or the token/link (ADR-0007).
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "***";
  }
  return `${local.slice(0, 1)}***@${domain}`;
}

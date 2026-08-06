/**
 * Bitrix Migrator is a TEMPORARY, read-only migrator (ADR-0009), not an eternal
 * integration. It only ever reads from Bitrix and mirrors into the OS Postgres.
 */

/** Integration key for the Bitrix registry row (matches the seed). */
export const BITRIX_INTEGRATION_KEY = "bitrix";

/** Mirror domain code for OPM (Bitrix "C7"), the first read_only target. */
export const BITRIX_OPM_DOMAIN = "opm";

/** BullMQ job key for the OPM import handler. */
export const BITRIX_OPM_IMPORT_JOB_KEY = "bitrix.import.opm";

/** Hard cap on pages per import run — defense against a pagination loop. */
export const BITRIX_MAX_PAGES = 10_000;

/**
 * Read-only method allowlist — an exact set, not a pattern. Only these literal
 * Bitrix methods may ever be issued; anything else (notably write-shaped
 * `.add`/`.update`/`.delete`/`.set`) is rejected before a request is made.
 * Adding a method here is a deliberate, reviewable act.
 */
const READ_METHODS: ReadonlySet<string> = new Set([
  "crm.item.list",
  "crm.item.get",
  "crm.item.fields",
]);

export function assertReadOnlyMethod(method: string): void {
  if (!READ_METHODS.has(method)) {
    throw new Error(
      `Bitrix Migrator is read-only: refusing non-read method '${method}'`,
    );
  }
}

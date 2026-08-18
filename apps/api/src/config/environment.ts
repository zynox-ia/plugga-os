import { z } from "zod";

const environmentBoolean = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}, z.boolean());

/**
 * Variável ausente e variável vazia são a mesma coisa: "não configurada".
 *
 * O `compose.yaml` passa as opcionais como `${VAR:-}`, o que entrega ao
 * contêiner a variável DEFINIDA com string vazia. `.optional()` do zod só
 * aceita `undefined`, então uma regra como `.min(1)` ou `.url()` recusava o
 * vazio e derrubava o boot em qualquer ambiente que não tivesse preenchido a
 * variável — exatamente o ambiente que ainda não usa o recurso. A CI nunca
 * pegaria: lá as variáveis estão sempre preenchidas.
 */
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor),
    schema.optional(),
  );
}

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().trim().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3_001),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    // Redis backing BullMQ (ADR-0007/0011). Local-only host, like DATABASE_URL.
    REDIS_URL: z.string().trim().min(1).default("redis://localhost:6379"),
    // Whether this process runs the BullMQ queue + worker. Off by default so the
    // API and unit tests boot without Redis; enabled locally/on the worker host.
    JOBS_ENABLED: environmentBoolean.default(false),
    JOBS_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(1),
    DEV_AUTH_ENABLED: environmentBoolean.default(false),
    // Express `trust proxy` (ADR-0012). "loopback" is only correct while every
    // process shares a host: once api/web are separate containers the request
    // arrives from the Compose bridge IP, the hop is not trusted, and the
    // per-IP throttle on /auth/* silently collapses into one global bucket.
    // Trusting a hop must therefore be an explicit, deliberate choice.
    // Accepts express values: "loopback", a hop count ("1"), an IP/CIDR, or
    // "false"/"true". "true" trusts any caller's self-reported chain and is
    // rejected at boot in production; use an explicit hop count or CIDR there.
    TRUST_PROXY: z.string().trim().min(1).default("loopback"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
    // Signs the session cookie (integrity, defense in depth over the opaque
    // token). Local placeholder only in .env.example; never committed for real.
    AUTH_SESSION_SECRET: z.string().min(32),
    // Adapter selection for EmailPort (ADR-0010). The safe default never sends;
    // brevo sends via the client's account. Mailpit was removed 2026-08-10 —
    // Brevo has been the only production provider since 2026-08-09.
    EMAIL_PROVIDER: z.enum(["noop", "brevo"]).default("noop"),
    // Sender identity for the brevo adapter. Local placeholder in .env.example;
    // a verified sender is required on the client's Brevo account.
    EMAIL_FROM_ADDRESS: z.string().trim().min(1).default("no-reply@plugga.local"),
    EMAIL_FROM_NAME: z.string().trim().min(1).default("plugga-os"),
    // Brevo (client account) transactional API. Key lives only in the
    // environment/secret, never in git; required when EMAIL_PROVIDER=brevo.
    BREVO_API_KEY: z.string().trim().min(1).optional(),
    BREVO_API_URL: z.string().url().default("https://api.brevo.com/v3/smtp/email"),
    // Cookie Secure flag. Defaults to on outside development; can be forced.
    AUTH_COOKIE_SECURE: environmentBoolean.optional(),
    SESSION_TTL_MINUTES: z.coerce.number().int().min(1).max(43_200).default(720),
    SESSION_ABSOLUTE_TTL_HOURS: z.coerce.number().int().min(1).max(8_760).default(720),
    // Comma-separated browser origins accepted on mutating auth routes (CSRF
    // defense in depth alongside SameSite=Lax).
    AUTH_ALLOWED_ORIGINS: z.string().trim().optional(),
    // --- Login federado com o Google (adendo ao ADR-0008) ---
    // Desligado por default: sem a flag a rota /auth/google recusa tudo e o
    // botão some da tela. É esta variável, e não um deploy, que faz o rollback.
    GOOGLE_AUTH_ENABLED: environmentBoolean.default(false),
    // Client ID do OAuth Client do Google. É público por natureza (vai para o
    // browser), mas é a AUDIÊNCIA aceita pelo verificador: um valor errado aqui
    // aceitaria ID token emitido para outro aplicativo. Não há client secret
    // neste fluxo — o GIS entrega um ID token já assinado, não um code.
    GOOGLE_OIDC_CLIENT_ID: opcional(z.string().trim().min(1)),
    // URI absoluta do callback registrado no Google Cloud. Quem a CONSOME é o
    // app web, mas a API também exige o valor quando a flag está ligada: os
    // dois serviços leem o mesmo `.env`, e é a API que falha alto se ele
    // estiver incompleto. Sem isto, esquecer a variável fazia o botão sumir da
    // tela em silêncio — o modo de falha mais caro de diagnosticar, porque nada
    // no sistema reclama.
    GOOGLE_LOGIN_URI: opcional(z.string().trim().url()),
    // Bitrix Migrator credential (ADR-0009): inbound webhook URL with the token
    // embedded in the path. Lives only in the environment/secret — never in git,
    // never in the integrations table, never logged. Bitrix is external SaaS, so
    // there is no local-host guard (unlike DATABASE_URL/REDIS_URL); the adapter
    // is read-only by construction. Absent until a domain moves to read_only.
    BITRIX_WEBHOOK_URL: z.string().trim().url().optional(),
    // Bitrix entityTypeId for the OPM (C7) domain — portal-specific. Supplied at
    // activation, not hardcoded; required to run the OPM import.
    BITRIX_OPM_ENTITY_TYPE_ID: z.coerce.number().int().positive().optional(),
    // Page size for Bitrix list reads (Bitrix caps a page at 50).
    BITRIX_IMPORT_PAGE_SIZE: z.coerce.number().int().min(1).max(50).default(50),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && environment.DEV_AUTH_ENABLED) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEV_AUTH_ENABLED"],
        message: "development authentication cannot be enabled in production",
      });
    }

    // Ligar o login Google sem audiência configurada é pior do que deixá-lo
    // desligado: o verificador não teria contra o que comparar `aud`.
    if (environment.GOOGLE_AUTH_ENABLED && !environment.GOOGLE_OIDC_CLIENT_ID) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_OIDC_CLIENT_ID"],
        message: "GOOGLE_OIDC_CLIENT_ID is required when GOOGLE_AUTH_ENABLED=true",
      });
    }

    if (environment.GOOGLE_AUTH_ENABLED && !environment.GOOGLE_LOGIN_URI) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_LOGIN_URI"],
        message: "GOOGLE_LOGIN_URI is required when GOOGLE_AUTH_ENABLED=true",
      });
    }

    if (environment.GOOGLE_LOGIN_URI) {
      try {
        const loginUri = new URL(environment.GOOGLE_LOGIN_URI);
        const isLocal = ["localhost", "127.0.0.1"].includes(loginUri.hostname);
        if (loginUri.protocol !== "https:" && !isLocal) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["GOOGLE_LOGIN_URI"],
            message: "GOOGLE_LOGIN_URI must use https outside localhost",
          });
        }

        // Em produção o callback tem de morar na MESMA origem do aplicativo.
        // Callback e origem divergentes é a falha operacional número um deste
        // fluxo: o Google recusa o redirect, ou pior, o cookie double-submit
        // `g_csrf_token` não acompanha o POST e toda tentativa vira "conta não
        // autorizada" — com o token, a audiência e o código todos corretos.
        // `AUTH_APP_BASE_URL` não é declarada no schema (chega pelo
        // passthrough), então é lida com cuidado e a regra só vale quando as
        // duas existem.
        const appBaseUrl = environment.AUTH_APP_BASE_URL;
        if (environment.NODE_ENV === "production" && typeof appBaseUrl === "string" && appBaseUrl) {
          try {
            const base = new URL(appBaseUrl);
            if (base.origin !== loginUri.origin) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["GOOGLE_LOGIN_URI"],
                message: `GOOGLE_LOGIN_URI must share the origin of AUTH_APP_BASE_URL (${base.origin})`,
              });
            }
          } catch {
            // AUTH_APP_BASE_URL inválida é problema de outra variável, não
            // desta: quem a valida é quem monta os links de convite/reset.
          }
        }
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["GOOGLE_LOGIN_URI"],
          message: "GOOGLE_LOGIN_URI must be a valid absolute URL",
        });
      }
    }

    if (environment.EMAIL_PROVIDER === "brevo" && !environment.BREVO_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BREVO_API_KEY"],
        message: "BREVO_API_KEY is required when EMAIL_PROVIDER=brevo",
      });
    }

    try {
      const databaseUrl = new URL(environment.DATABASE_URL);
      if (!["localhost", "127.0.0.1", "postgres"].includes(databaseUrl.hostname)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message: "Block A only permits a local PostgreSQL host",
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL must be a valid PostgreSQL URL",
      });
    }

    if (environment.BITRIX_WEBHOOK_URL) {
      try {
        const bitrixUrl = new URL(environment.BITRIX_WEBHOOK_URL);
        if (bitrixUrl.protocol !== "https:") {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["BITRIX_WEBHOOK_URL"],
            message: "BITRIX_WEBHOOK_URL must use https",
          });
        } else if (!bitrixUrl.pathname.includes("/rest/")) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["BITRIX_WEBHOOK_URL"],
            message: "BITRIX_WEBHOOK_URL must be a Bitrix REST webhook URL (path contains /rest/)",
          });
        }
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BITRIX_WEBHOOK_URL"],
          message: "BITRIX_WEBHOOK_URL must be a valid URL",
        });
      }
    }

    try {
      const redisUrl = new URL(environment.REDIS_URL);
      if (!["redis:", "rediss:"].includes(redisUrl.protocol)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["REDIS_URL"],
          message: "REDIS_URL must use the redis:// or rediss:// protocol",
        });
      } else if (!["localhost", "127.0.0.1", "redis"].includes(redisUrl.hostname)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["REDIS_URL"],
          message: "Block B only permits a local Redis host",
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL must be a valid Redis URL",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

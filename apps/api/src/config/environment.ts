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
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
    // Signs the session cookie (integrity, defense in depth over the opaque
    // token). Local placeholder only in .env.example; never committed for real.
    AUTH_SESSION_SECRET: z.string().min(32),
    // Adapter selection for EmailPort (ADR-0010). The safe default never sends;
    // mailpit captures locally; brevo sends via the client's account.
    EMAIL_PROVIDER: z.enum(["noop", "mailpit", "brevo"]).default("noop"),
    // Sender identity shared by the mailpit/brevo adapters. Local placeholder in
    // .env.example; a verified sender is required on the client's Brevo account.
    EMAIL_FROM_ADDRESS: z.string().trim().min(1).default("no-reply@plugga.local"),
    EMAIL_FROM_NAME: z.string().trim().min(1).default("Plugga OS"),
    // Local Mailpit SMTP endpoint (Compose service). Never a real relay.
    MAILPIT_SMTP_HOST: z.string().trim().min(1).default("localhost"),
    MAILPIT_SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1_025),
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

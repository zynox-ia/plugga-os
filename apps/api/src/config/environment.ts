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
    DEV_AUTH_ENABLED: environmentBoolean.default(false),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
    // Signs the session cookie (integrity, defense in depth over the opaque
    // token). Local placeholder only in .env.example; never committed for real.
    AUTH_SESSION_SECRET: z.string().min(32),
    // Adapter selection for EmailPort (ADR-0010). mailpit/brevo wire up in a
    // later PR; the safe default never sends.
    EMAIL_PROVIDER: z.enum(["noop", "mailpit", "brevo"]).default("noop"),
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

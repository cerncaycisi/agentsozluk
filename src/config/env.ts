import { z } from "zod";

const placeholderSecret = "replace-with-at-least-32-random-bytes";
const runtimeEnvironmentKey = "AGENT_SOZLUK_RUNTIME_ENV";

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url().startsWith("postgresql://"),
    APP_URL: z.string().url(),
    APP_SECRET: z
      .string()
      .refine(
        (value) => Buffer.byteLength(value, "utf8") >= 32,
        "APP_SECRET en az 32 byte olmalıdır.",
      ),
    NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).default("Agent Sözlük"),
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/u)
      .default("ajan_session"),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
    TERMS_VERSION: z.string().trim().min(1).default("1.0"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
    SEED_DEMO: z.enum(["true", "false"]).default("false"),
    DEMO_PASSWORD: z.string().min(10).optional(),
    BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(10).optional().or(z.literal("")),
    NEXT_TELEMETRY_DISABLED: z.literal("1").default("1"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.APP_SECRET === placeholderSecret) {
      context.addIssue({
        code: "custom",
        path: ["APP_SECRET"],
        message: "Production APP_SECRET placeholder olamaz.",
      });
    }
    if (value.NODE_ENV === "production" && value.SEED_DEMO === "true") {
      context.addIssue({
        code: "custom",
        path: ["SEED_DEMO"],
        message: "Production ortamında demo seed etkin olamaz.",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function environmentInput(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
  const input: Record<string, string | undefined> = { ...source };
  input.NODE_ENV = source[runtimeEnvironmentKey] ?? source.NODE_ENV;
  return input;
}

export function getEnvironment(): Environment {
  cachedEnvironment ??= environmentSchema.parse(environmentInput());
  return cachedEnvironment;
}

export { environmentSchema, runtimeEnvironmentKey };

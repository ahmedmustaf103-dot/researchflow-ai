import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: optionalNonEmptyString,
  AUTH_GOOGLE_SECRET: optionalNonEmptyString,
  GEMINI_API_KEY: optionalNonEmptyString,
  BRAVE_API_KEY: optionalNonEmptyString,
  JINA_API_KEY: optionalNonEmptyString,
  GEMINI_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).default("gemini-2.5-flash"),
  ),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = undefined;
}

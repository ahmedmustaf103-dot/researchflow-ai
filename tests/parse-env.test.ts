import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

function validEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/researchflow",
    AUTH_SECRET: "test-auth-secret-do-not-use-in-production",
    ...overrides,
  };
}

describe("parseEnv", () => {
  it("accepts the required foundation variables", () => {
    const env = parseEnv(validEnv());

    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.AUTH_SECRET.length).toBeGreaterThan(0);
    expect(env.AUTH_GOOGLE_ID).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe("gemini-2.5-flash");
  });

  it("accepts a configured Gemini model and treats an empty key as unset", () => {
    const env = parseEnv(
      validEnv({
        GEMINI_API_KEY: "",
        GEMINI_MODEL: "gemini-2.5-flash",
      }),
    );

    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe("gemini-2.5-flash");
  });

  it("treats empty Google OAuth values as unset", () => {
    const env = parseEnv(
      validEnv({
        AUTH_GOOGLE_ID: "",
        AUTH_GOOGLE_SECRET: "",
      }),
    );

    expect(env.AUTH_GOOGLE_ID).toBeUndefined();
    expect(env.AUTH_GOOGLE_SECRET).toBeUndefined();
  });

  it("rejects a missing database URL", () => {
    expect(() =>
      parseEnv(
        validEnv({
          DATABASE_URL: undefined,
        }),
      ),
    ).toThrow(/DATABASE_URL/);
  });
});

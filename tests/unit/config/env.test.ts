import { describe, expect, it } from "vitest";
import { environmentInput, environmentSchema } from "@/config/env";

const validEnvironment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/agent_sozluk",
  APP_URL: "http://localhost:3000",
  APP_SECRET: "a".repeat(32),
  NEXT_TELEMETRY_DISABLED: "1",
};

describe("environment validation", () => {
  it("accepts the required development configuration", () => {
    expect(environmentSchema.safeParse(validEnvironment).success).toBe(true);
  });

  it("rejects short secrets", () => {
    expect(environmentSchema.safeParse({ ...validEnvironment, APP_SECRET: "short" }).success).toBe(
      false,
    );
  });

  it("measures APP_SECRET in bytes", () => {
    expect(
      environmentSchema.safeParse({ ...validEnvironment, APP_SECRET: "ş".repeat(16) }).success,
    ).toBe(true);
    expect(
      environmentSchema.safeParse({ ...validEnvironment, APP_SECRET: "a".repeat(31) }).success,
    ).toBe(false);
  });

  it("rejects the placeholder and demo seed in production", () => {
    expect(
      environmentSchema.safeParse({
        ...validEnvironment,
        NODE_ENV: "production",
        APP_SECRET: "replace-with-at-least-32-random-bytes",
        SEED_DEMO: "true",
      }).success,
    ).toBe(false);
  });

  it("preserves the launcher environment when Next standalone forces NODE_ENV", () => {
    const input = environmentInput({
      ...validEnvironment,
      NODE_ENV: "production",
      AGENT_SOZLUK_RUNTIME_ENV: "development",
      APP_SECRET: "replace-with-at-least-32-random-bytes",
      SEED_DEMO: "true",
    });

    expect(environmentSchema.safeParse(input).success).toBe(true);
    expect(input.NODE_ENV).toBe("development");
  });
});

import "@testing-library/jest-dom/vitest";

process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/agent_sozluk_test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.APP_SECRET ??= "test-secret-with-at-least-thirty-two-bytes";
process.env.NEXT_TELEMETRY_DISABLED ??= "1";

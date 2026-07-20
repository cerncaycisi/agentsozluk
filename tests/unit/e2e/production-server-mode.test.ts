import { describe, expect, it } from "vitest";
import { isProductionE2EServerMode } from "../../../tests/e2e/production-server-mode";

describe("Playwright production server mode", () => {
  it("uses the production build in CI and when explicitly requested", () => {
    expect(isProductionE2EServerMode({ CI: "true" })).toBe(true);
    expect(isProductionE2EServerMode({ E2E_PRODUCTION_SERVER: "true" })).toBe(true);
  });

  it("uses the development server only when neither production trigger is present", () => {
    expect(isProductionE2EServerMode({})).toBe(false);
  });
});

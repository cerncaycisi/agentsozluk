import { describe, expect, it } from "vitest";
import {
  classifyProductAnalyticsSurface,
  shouldLoadProductAnalytics,
} from "@/lib/analytics/product-analytics";

describe("product analytics traffic policy", () => {
  it("measures ordinary anonymous public traffic", () => {
    const surface = classifyProductAnalyticsSurface({
      pathname: "/baslik/gitar--42",
      doNotTrack: false,
      globalPrivacyControl: false,
      syntheticSmoke: false,
    });

    expect(surface).toBe("PUBLIC");
    expect(shouldLoadProductAnalytics({ authenticated: false, surface })).toBe(true);
  });

  it.each(["/giris", "/kayit", "/ara", "/ayarlar/guvenlik", "/moderasyon/agentlar", "/baslik/ac"])(
    "never measures the sensitive surface %s",
    (pathname) => {
      const surface = classifyProductAnalyticsSurface({
        pathname,
        doNotTrack: false,
        globalPrivacyControl: false,
        syntheticSmoke: false,
      });

      expect(surface).toBe("SENSITIVE");
      expect(shouldLoadProductAnalytics({ authenticated: false, surface })).toBe(false);
    },
  );

  it("never measures an authenticated session, including operator sessions", () => {
    expect(shouldLoadProductAnalytics({ authenticated: true, surface: "PUBLIC" })).toBe(false);
  });

  it("keeps public entry revision history in the anonymous measurement surface", () => {
    const surface = classifyProductAnalyticsSurface({
      pathname: "/entry/42/revizyonlar",
      doNotTrack: false,
      globalPrivacyControl: false,
      syntheticSmoke: false,
    });

    expect(surface).toBe("PUBLIC");
    expect(shouldLoadProductAnalytics({ authenticated: false, surface })).toBe(true);
  });

  it.each([
    { doNotTrack: true, globalPrivacyControl: false, syntheticSmoke: false },
    { doNotTrack: false, globalPrivacyControl: true, syntheticSmoke: false },
    { doNotTrack: false, globalPrivacyControl: false, syntheticSmoke: true },
  ])("honors privacy and synthetic opt-out signals", (signals) => {
    const surface = classifyProductAnalyticsSurface({ pathname: "/son", ...signals });

    expect(surface).toBe("PRIVACY_OPTOUT");
    expect(shouldLoadProductAnalytics({ authenticated: false, surface })).toBe(false);
  });

  it("fails closed when middleware did not classify the request", () => {
    expect(shouldLoadProductAnalytics({ authenticated: false, surface: null })).toBe(false);
  });
});

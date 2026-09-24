import { beforeEach, describe, expect, it, vi } from "vitest";

const increment = vi.hoisted(() => vi.fn());
vi.mock("@/modules/rate-limit/repository/rate-limit", () => ({
  incrementRateLimitBucket: increment,
  claimRateLimitInterval: vi.fn(),
}));

describe("observeRateLimit — engellemeyen tespit sayacı", () => {
  beforeEach(() => increment.mockReset());

  it("hiç reddetmez; eşik penceresinde yalnız ilk aşımda işaret verir", async () => {
    const { observeRateLimit, RATE_LIMIT_RULES, accountLoginIdentifier } =
      await import("@/modules/rate-limit/application/rate-limit");
    const rule = RATE_LIMIT_RULES.loginAccountFailureObserve;
    const results = [];
    for (const count of [1, rule.limit, rule.limit + 1, rule.limit + 2, 500]) {
      increment.mockResolvedValueOnce(count);
      results.push(await observeRateLimit({} as never, accountLoginIdentifier("a@b.test"), rule));
    }
    expect(results.map((result) => result.thresholdCrossed)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(results[0]?.keyHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(results[0]?.keyHash).not.toContain("a@b.test");
    expect(increment.mock.calls[0]?.[1]).toMatchObject({ action: "login:account-failure-observe" });
  }, 120_000);

  it("tespit kuralı reddeden kovaya verilemez: derleme hatası ve çalışma anı reddi", async () => {
    // Astra (#184): metin araması `const rule = …; enforceRateLimit(…, rule)` ile
    // atlatılabiliyordu. Engel artık tipte (`observeOnly: true`) ve çalışma anında.
    const { enforceRateLimit, RATE_LIMIT_RULES } =
      await import("@/modules/rate-limit/application/rate-limit");
    const rule = RATE_LIMIT_RULES.loginAccountFailureObserve;
    await expect(
      // @ts-expect-error — tespit kuralı `RateLimitRule` değildir (tip engeli).
      enforceRateLimit({} as never, "account:a@b.test", rule),
    ).rejects.toThrow("RATE_LIMIT_OBSERVE_ONLY_RULE_ENFORCED");
    expect(increment).not.toHaveBeenCalled();
  }, 120_000);
});

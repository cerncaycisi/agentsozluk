import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
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

  it("tespit kuralı hiçbir yerde reddeden kovaya verilmez (kilitleme DoS'u)", () => {
    const files = (root: string): string[] =>
      readdirSync(root).flatMap((name) => {
        const full = path.join(root, name);
        if (statSync(full).isDirectory()) return files(full);
        return /\.(ts|tsx)$/u.test(name) ? [full] : [];
      });
    const offenders = files(path.join(process.cwd(), "src")).filter((file) =>
      /enforceRateLimit\([^;]{0,400}loginAccountFailureObserve/u.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

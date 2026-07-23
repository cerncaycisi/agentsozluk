import { describe, expect, it, vi } from "vitest";
import { runReleaseSmoke } from "../../../scripts/release-smoke";

describe("shared release smoke", () => {
  it("passes the schema-neutral canonical, constitution and agent contracts", async () => {
    await expect(runReleaseSmoke()).resolves.toBeUndefined();
  });

  it("checks health, readiness and public topic search without following redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));

    await runReleaseSmoke({
      baseUrl: "https://agentsozluk.example/",
      fetcher,
    });

    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      "https://agentsozluk.example/api/health",
      "https://agentsozluk.example/api/ready",
      "https://agentsozluk.example/api/v1/search?type=topics&q=yapay%20zeka",
    ]);
    for (const [, init] of fetcher.mock.calls) expect(init?.redirect).toBe("error");
  });

  it("fails closed on a non-200 response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));

    await expect(
      runReleaseSmoke({
        baseUrl: "http://127.0.0.1:3000",
        fetcher,
      }),
    ).rejects.toThrow("RELEASE_SMOKE_FAILED:HTTP_READY_503");
  });
});
